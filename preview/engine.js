// ═══════════════════════════════════════════════════════════════
// engine.js —— Awen 浏览器近似引擎(预览用途,非权威)
//
// 从 template.html 拆出的文档处理层。职责:
//   块结构来源:桌面版 ingestNative(Aine 权威解析);HTML 渲染(fmtH/blockHtml/tableHtml/objHtml)
//   → 分页(layoutPages) → DOM 序列化(serializeAll) → 诊断由 Aine 原生提供
//
// ⚠ 权威边界:桌面版(Tauri)下块级解析/诊断由 Aine 原生引擎经 Bridge 提供,
//   本文件的解析结果仅用于浏览器环境与交互式编辑;HTML 渲染、像素分页、
//   DOM→源码序列化绑定浏览器 DOM,始终在本文件完成。
//
// 本次重构修复的缺口:
//   - 多行作用域 @[font]…@[/font] 解析(原分支为死代码)+ 渲染 + 序列化回写
//   - 图片 width/align 双方言(空格分隔 `width 65%` 与冒号 `width: 65%`)
//   - 表格分隔行对齐(:---:/---:)渲染与序列化回写、@[table 名 widths: 30,40]
//     编辑器扩展列宽参数(colgroup,经 data-open 整行保真回写,含 label)
// ═══════════════════════════════════════════════════════════════
(function(){
'use strict';

// ── 页面模型状态(§30 A4 默认;文档级 @[...] 设置经 applyDocsets 覆盖)──
var cfg={PAGE_W:210,PAGE_H:297,MARGIN:20,LINE_H:1.9,FONT_PT:11,PT2MM:0.352778,FONT:'',FIRSTLINE:'',PARA_SPACING:'0em'};
var PAPER_SIZES={A4:[210,297],Letter:[215.9,279.4],B5:[176,250],A3:[297,420],A5:[148,210]};
var CHAR_MM,CONTENT_W,CONTENT_H,MAX_EM,LINE_MM,LINES_PER_PAGE;
function recalc(){
  CHAR_MM=cfg.FONT_PT*cfg.PT2MM;
  CONTENT_W=cfg.PAGE_W-cfg.MARGIN*2; CONTENT_H=cfg.PAGE_H-cfg.MARGIN*2;
  MAX_EM=CONTENT_W/CHAR_MM;
  LINE_MM=cfg.FONT_PT*cfg.PT2MM*cfg.LINE_H;
  LINES_PER_PAGE=Math.floor(CONTENT_H/LINE_MM);
}
recalc();

// 文档级设置生效:遍历 docset 节点,按源码顺序覆盖配置(源码即权威)。
// 每次先重置默认——源码里没有对应行时,设置回落默认值。
function applyDocsets(nodes,docsets){
  cfg.PAGE_W=210; cfg.PAGE_H=297; cfg.MARGIN=20; cfg.LINE_H=1.9;
  cfg.FONT_PT=11; cfg.FONT=''; cfg.FIRSTLINE=''; cfg.PARA_SPACING='0em';
  // A′:设置由引擎结构化下发(docsets=[[英文名,参数]…],任意语言别名已在
  // 引擎归一),前端不再按命令词猜——十语种写法天然生效
  var ds=docsets||[];
  for(var d=0;d<ds.length;d++){
    var key=ds[d][0], arg=String(ds[d][1]==null?'':ds[d][1]).trim();
    if(key==='page'){ var sz=PAPER_SIZES[arg]; if(sz){cfg.PAGE_W=sz[0];cfg.PAGE_H=sz[1]} }
    else if(key==='margin'){ var mv=parseFloat(arg); if(!isNaN(mv))cfg.MARGIN=mv }
    else if(key==='line-spacing'){ var lv=parseFloat(arg); if(!isNaN(lv))cfg.LINE_H=lv }
    else if(key==='size'){ var fv=parseFloat(arg); if(!isNaN(fv))cfg.FONT_PT=fv }
    else if(key==='font'){ cfg.FONT=arg.replace(/^"(.*)"$/,'$1') }
    else if(key==='first-line'){ cfg.FIRSTLINE=arg.match(/em$/)?arg:arg+'em' }
    else if(key==='para-spacing'){ cfg.PARA_SPACING=arg.match(/em$/)?arg:arg+'em' }
  }
  // 兜底:无 docsets(旧响应)时退回原文正则(中英)
  if(!ds.length){
    var m;
    for(var i=0;i<nodes.length;i++){
      if(nodes[i].kind!=='docset')continue;
      var t=nodes[i].text||'';
      if(m=t.match(/^@\[(?:page|页面)\s+(\w+)\s*\]/)){ var sz=PAPER_SIZES[m[1]]; if(sz){cfg.PAGE_W=sz[0];cfg.PAGE_H=sz[1]} }
      else if(m=t.match(/^@\[(?:margin|边距)\s+([\d.]+)\s*(?:mm)?\s*\]/)){ cfg.MARGIN=parseFloat(m[1]) }
      else if(m=t.match(/^@\[(?:line-spacing|行距)\s+([\d.]+)\s*\]/)){ cfg.LINE_H=parseFloat(m[1]) }
      else if(m=t.match(/^@\[(?:size|大小|字号)\s+([\d.]+)\s*(?:pt)?\s*\]/)){ cfg.FONT_PT=parseFloat(m[1]) }
      else if(m=t.match(/^@\[(?:font|字体)\s+"([^"]+)"\s*\]/)){ cfg.FONT=m[1] }
      else if(m=t.match(/^@\[(?:first-line|首行缩进|首行)\s+([\d.]+em)\s*\]/)){ cfg.FIRSTLINE=m[1] }
      else if(m=t.match(/^@\[(?:para-spacing|段距|段落间距)\s+([\d.]+em|\d+)\s*\]/)){ cfg.PARA_SPACING=m[1].match(/em$/)?m[1]:m[1]+'em' }
    }
  }
  recalc();
}

// ── 行内工具 ──
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escAttr(s){return escHtml(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
// 属性值转义:文本已过 escHtml(&<> 已是实体),再转引号即可(避免 & 双重转义)
function escAttrQ(s){return String(s).replace(/"/g,'&quot;')}
// 转义序列占位:@@X 与 @X(@# @** @_ @~~ @- @> @` @1.)→ \uE000 X \uE001,
// 行内替换全部完成后再还原为字面 X(防止 @** 被误解析为粗体等)
function escTokens(s){
  return s.replace(/@@([\s\S])/g,'\uE000$1\uE001').replace(/@(1\.|[#*_~>`\-]|&gt;)/g,'\uE000$1\uE001');
}
function unescTokens(s){
  return s.replace(/\uE000([\s\S]*?)\uE001/g,'$1');
}
function displayText(t){
  var s=escTokens(t);
  s=s
    .replace(/@\[(u|color|size|font|mark|sup|sub)\s*[^\]]*\]((?:.|])*?)@\[\/\1\]/g,'$2')
    .replace(/\*\*((?:.|])*?)\*\*/g,'$1')
    .replace(/~~((?:.|])*?)~~/g,'$1')
    .replace(/`((?:.|])*?)`/g,'$1')
    .replace(/@\[(?:link|链接)\s+([^\]]+?)\s+url:\s*([^\]]+)\]/g,'$1')
    .replace(/@\[(?:footnote|脚注)\s+(\d+)\s+([^\]]+)\]/g,'$2')
    .replace(/@\[(?:label|标签)\s+([^\]]+)\]/g,'$1')
    .replace(/@\[(?:ref|引用)\s+([^\]]+)\]/g,'$1')
    .replace(/_((?:.|])*?)_/g,'$1');
  return unescTokens(s);
}
function fmtH(t){
  var s=escHtml(t);
  s=escTokens(s);
  // 行内命令;中文名(字体/大小/颜色/底纹/下划线…)是同一命令的方言写法(规范 §6.14)
  // 闭合式 @[u]xx@[/u];行内数学 @[m]…@[/m];「@[font "X"] 文字」单行作用域(无闭合,生效到行尾)
  s=s.replace(/@\[(?:u|下划线|下划)\]((?:.|])*?)@\[\/(?:u|下划线|下划)\]/g,'<u>$1</u>');
  s=s.replace(/@\[(?:sup|上标)\]((?:.|])*?)@\[\/(?:sup|上标)\]/g,'<sup>$1</sup>');
  s=s.replace(/@\[(?:sub|下标)\]((?:.|])*?)@\[\/(?:sub|下标)\]/g,'<sub>$1</sub>');
  s=s.replace(/@\[(?:m|math|数学)\]((?:.|])*?)@\[\/(?:m|math|数学)\]/g,'<span class="inline-math" data-cmd="@[m]" data-close="@[/m]" style="font-family:Georgia,\'Times New Roman\',serif;font-style:italic">$1</span>');
  s=s.replace(/@\[(?:mark|底纹)\s+([^\]]+)\]((?:.|])*?)@\[\/(?:mark|底纹)\]/g,'<span data-cmd="@[mark $1]" data-close="@[/mark]" style="background:$1">$2</span>');
  s=s.replace(/@\[(?:color|颜色)\s+([^\]]+)\]((?:.|])*?)@\[\/(?:color|颜色)\]/g,'<span data-cmd="@[color $1]" data-close="@[/color]" style="color:$1">$2</span>');
  s=s.replace(/@\[(?:size|大小|字号)\s+([^\]]+)\]((?:.|])*?)@\[\/(?:size|大小|字号)\]/g,'<span data-cmd="@[size $1]" data-close="@[/size]" style="font-size:$1pt">$2</span>');
  s=s.replace(/@\[(?:link|链接)\s+([^\]]+?)\s+url:\s*"?([^"\]]+)"?\]/g,'<a href="$2" target="_blank" style="color:#2a4a66;text-decoration:underline">$1</a>');
  s=s.replace(/@\[(?:footnote|脚注)\s+(\d+)\s+([^\]]+)\]/g,function(m,n,txt){
    // data-self:自闭合命令,序列化只回写原命令(显示体是编号,内容在 data-cmd 里)
    return '<sup class="fn" data-cmd="'+escAttrQ(m)+'" data-self="1" title="'+txt.replace(/"/g,'')+'" style="color:#2a4a66;cursor:help">'+n+'</sup>';
  });
  s=s.replace(/@\[(?:font|字体)\s+([^\]]+)\]((?:.|])*?)@\[\/(?:font|字体)\]/g,function(m,f,inner){
    f=f.replace(/"/g,'');
    return'<span data-cmd=\'@[font "' + f + '"]\' data-close="@[/font]" style="font-family:\'' + f + '\',serif">' + inner + '</span>';
  });
  // 单行作用域(无闭合):@[font "SimSun"] 文字 → 生效到行尾(与 lexer 段内行内命令语义一致)
  s=s.replace(/@\[(font|字体)\s+([^\]\[]+)\]((?:.|])*?)$/g,function(m,name,rest,inner){
    if(inner.indexOf('@[')>=0)return m;
    var f=rest.replace(/"/g,'');
    return'<span data-cmd=\'@[' + name + ' "' + f + '"]\' style="font-family:\'' + f + '\',serif">' + inner + '</span>';
  });
  s=s.replace(/@\[(size|大小|字号|color|颜色)\s+([^\]\[]+)\]((?:.|])*?)$/g,function(m,name,rest,inner){
    if(inner.indexOf('@[')>=0)return m;
    var val=rest.replace(/"/g,'');
    var st=(name==='size'||name==='大小'||name==='字号')?('font-size:'+val+'pt'):('color:'+val);
    return'<span data-cmd="@[' + name + ' ' + rest + ']" style="' + st + '">' + inner + '</span>';
  });
  s=s.replace(/\*\*((?:.|])*?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/~~((?:.|])*?)~~/g,'<del>$1</del>');
  s=s.replace(/`((?:.|])*?)`/g,'<code>$1</code>');
  s=s.replace(/_((?:.|])*?)_/g,'<em>$1</em>');
  s=s.replace(/@\[(?:label|标签)\s+([^\]]+)\]/g,function(m){
    return '<span class="inline-label" data-cmd="'+escAttrQ(m)+'" data-self="1" title="标签">📌'+escAttrQ(m).replace(/@\[(?:label|标签)\s+/,'').replace(/\]$/,'')+'</span>';
  });
  s=s.replace(/@\[(?:ref|引用)\s+([^\]]+)\]/g,function(m){
    return '<span class="inline-ref" data-cmd="'+escAttrQ(m)+'" data-self="1" title="引用">↦'+escAttrQ(m).replace(/@\[(?:ref|引用)\s+/,'').replace(/\]$/,'')+'</span>';
  });
  s=unescTokens(s);
  return s;
}
// 多行作用域命令参数 → CSS(kind:"font"/"size"/"color";param 为源码参数原文)
function scopeCss(kind,param){
  var v=param.replace(/^"(.*)"$/,'$1').trim();
  if(kind==='font')return'font-family:\''+v+'\',serif;';
  if(kind==='size'){ var n=parseFloat(v); return'font-size:'+(isNaN(n)?v:(/^\d+(\.\d+)?$/.test(v)?n+'pt':v))+';' }
  if(kind==='color')return'color:'+v+';';
  return'';
}

// 命令闭合 ] 的配平扫描(对齐 native ex_scan_balanced):从起始 [ 起数嵌套,返回闭合 ] 索引或 -1
function scanCmdClose(s,from){
  var depth=0;
  for(var i=from;i<s.length;i++){
    var c=s.charAt(i);
    if(c==='[')depth++;
    else if(c===']'){ depth--; if(depth===0)return i }
  }
  return -1;
}


// ── native blocks JSON → 引擎节点(桌面版权威解析结果的入口)──
// native 记录:{kind, level, srcStart, srcEnd, text}(text=原始源码行 \n 连接,
// 含块定界行)。这里按引擎行区间约定规整 text 与行区间,保证下游
// blockHtml/layoutPages/serializeAll 与本地解析路径零差异。
// 单条引擎块记录 → 模型节点(字段派生只依赖记录本身;全文/增量共用)
function recToNode(nb){
  var raw=(nb.text||'').split('\n');
  var b={kind:nb.kind,level:nb.level||0,srcStart:nb.srcStart,srcEnd:nb.srcEnd};
  var k=nb.kind;
  if(k==='heading'){
    b.text=raw.join(' ').replace(/^\s*#+\s*/,'');
  }else if(k==='para'){
    b.text=raw.map(function(l){return l.trim()}).filter(function(l){return l!==''}).join(' ');
  }else if(k==='ul'||k==='ol'){
    // 层级必须从【原始行】的前导空格计算(trim 后信息即丢失)
    var items=raw.filter(function(l){return l.trim()!==''});
    b.level=items.length?Math.floor((items[0].length-items[0].replace(/^\s+/,'').length)/2):0;
    b.text=items.map(function(l){return l.trim().replace(k==='ul'?/^[-*] /:/^\d+\. /,'')}).join(' ');
  }else if(k==='quote'){
    b.text=raw.map(function(l){return l.trim()}).filter(function(l){return l!==''})
      .map(function(l){return l.replace(/^>\s*/,'')}).join(' ');
  }else if(k==='table'){
    // 行区间含 @[table]…@[/table] 定界行:只取 | 行;open 行取原生第一行
    b.rows=raw.map(function(l){return l.trim()}).filter(function(l){return l.charAt(0)==='|'});
    var openLine='';
    for(var oi=0;oi<raw.length;oi++){ if(/^@\[table/.test(raw[oi].trim())){openLine=raw[oi].trim();break} }
    b.open=openLine||'@[table demo]';
  }else if(k==='code'){
    b.lang=(raw[0]||'').replace(/^@\[c (\w+)\].*/,'$1');
    b.text=raw.filter(function(l){return !/^@\[c (\w+)\]/.test(l.trim())&&l.trim()!=='@[/c]'}).join('\n');
  }else if(k==='math'){
    b.text=raw.filter(function(l){return l.trim()!=='@[m]'&&l.trim()!=='@[math]'&&l.trim()!=='@[/m]'&&l.trim()!=='@[/math]'}).join('\n');
  }else{
    // obj/comment/docset/label/ref/hr/scope:整段原文保真
    // native 不区分 docset/label/ref/toc(obj 大类),按内容前缀再分类
    var one=(nb.text||'').split('\n')[0].trim();
    if(/^@\[toc/.test(one)){
      b.kind='toc'; b.text=one;
    }else if(/^@\[(?:page|页面|margin|边距|font|字体|size|大小|字号|line-spacing|行距|first-line|首行缩进|首行|theme|主题|numbering|编号|toc|目录|para-spacing|段距|段落间距)\s/.test(one)){
      b.kind='docset'; b.text=one;
    }else if(/^@\[label\s/.test(one)){
      b.kind='label'; b.text=one.replace(/^@\[label\s+/,'').replace(/\]$/,'');
    }else if(/^@\[ref\s/.test(one)){
      b.kind='ref'; b.text=one.replace(/^@\[ref\s+/,'').replace(/\]$/,'');
    }else{
      b.text=(nb.text||'');
    }
  }
  return b;
}
// 行区间修剪:掐掉两端空行(空段除外——空段的 span 本身就是空行对,是
// 缓存分段的定位依据,修剪会让它塌缩丢失位置)
function trimSpanB(b,srcLines){
  if(b.kind==='para'&&b.text==='')return b;
  var s=b.srcStart,e=b.srcEnd;
  while(s<e&&(srcLines[s]===undefined||srcLines[s].trim()===''))s++;
  while(e>s&&(srcLines[e-1]===undefined||srcLines[e-1].trim()===''))e--;
  b.srcStart=s; b.srcEnd=e; return b;
}
function ingestNative(blocks,src){
  var srcLines=src.split('\n'), out=[];
  for(var i=0;i<blocks.length;i++){
    out.push(trimSpanB(recToNode(blocks[i]),srcLines));
  }
  return out;
}
// 增量:脏段的引擎记录 → 节点(span 平移回全文行基)
function segRecsToNodes(blocks,baseLine){
  return blocks.map(function(nb){
    var b=recToNode(nb);
    b.srcStart=(nb.srcStart||0)+baseLine;
    b.srcEnd=(nb.srcEnd||0)+baseLine;
    return b;
  });
}

// ── 表格 HTML(对齐 + widths 列宽扩展;open 行经 data-open 保真)──
// 单元格内 @[cell 属性...]内容@[/cell](规范 §表格:span/background/border-bottom)
function parseCell(raw){
  var m=raw.match(/^@\[cell\s+([^\]]+)\]([\s\S]*?)@\[\/cell\]\s*$/);
  if(!m)return{inner:raw,cmd:null,span:1,style:''};
  var cmd=m[1];
  var out={inner:m[2],cmd:'@[cell '+cmd+']',span:1,style:''};
  var sm=cmd.match(/span:\s*(\d+)/);
  if(sm)out.span=Math.max(1,parseInt(sm[1])||1);
  var bm=cmd.match(/background:\s*("[^"]*"|#[0-9a-fA-F]{3,8}|\S+)/);
  if(bm)out.style+='background-color:'+bm[1].replace(/"/g,'')+';';
  var dm=cmd.match(/border-bottom:\s*([^;]+?)\s*(?:"([^"]*)")?\s*$/);
  if(dm){
    var color=(dm[2]||'').replace(/"/g,'');
    out.style+='border-bottom:'+(dm[1].replace(/"[^"]*"/,'').trim()+(color?' '+color:''))+';';
  }
  return out;
}
function tableHtml(b){
  var rows=b.rows||[];
  function cells(r){return r.replace(/^\||\|$/g,'').split('|').map(function(c){return c.trim()})}
  // 分隔行 → 对齐数组:left/center/right
  var aligns=null;
  for(var i=0;i<rows.length;i++){
    var cs=cells(rows[i]);
    if(cs.length&&cs.every(function(c){return /^:?-{2,}:?$/.test(c)})){
      aligns=cs.map(function(c){
        var L=c.charAt(0)===':',R=c.charAt(c.length-1)===':';
        return(L&&R)?'center':R?'right':'left';
      });
      break;
    }
  }
  // widths 参数(编辑器扩展):@[table 名 widths: 30,40,30]
  var openLine=b.open||'@[table demo]';
  var wm=openLine.match(/widths:?\s*([\d.,\s%]+)/);
  var widths=null;
  if(wm){
    widths=wm[1].split(',').map(function(x){return parseFloat(x)}).filter(function(x){return!isNaN(x)&&x>0});
    if(!widths.length)widths=null;
  }
  var h='<table data-open="'+escAttr(openLine)+'"';
  if(aligns)h+=' data-aligns="'+escAttr(aligns.join(','))+'"';
  h+='>';
  if(widths){
    h+='<colgroup>';
    for(var w=0;w<widths.length;w++)h+='<col style="width:'+widths[w]+'%">';
    h+='</colgroup>';
  }
  for(var r=0;r<rows.length;r++){
    var cells2=cells(rows[r]);
    if(cells2.every(function(c){return /^:?-{2,}:?$/.test(c)}))continue;
    var isHead=(r===0);
    h+='<tr>';
    for(var c3=0;c3<cells2.length;c3++){
      var ci=parseCell(cells2[c3]);
      var al=(aligns&&aligns[c3]&&aligns[c3]!=='left')?'text-align:'+aligns[c3]+';':'';
      var st=al+ci.style;
      h+=(isHead?'<th':'<td')+(ci.span>1?' colspan="'+ci.span+'"':'')
        +(st?' style="'+escAttrQ(st)+'"':'')
        +(ci.cmd?' data-cell-cmd="'+escAttrQ(ci.cmd)+'"':'')
        +'>'+fmtH(ci.inner)+(isHead?'</th>':'</td>');
    }
    h+='</tr>';
  }
  return h+'</table>';
}

// ── 图片 / figure(双方言参数)──
function objHtml(b){
  var full=b.text||'';
  var first=full.split('\n')[0];
  var m=first.match(/^@\[(image|figure|图片)(?:\s+([^\]]*))?\]/);
  if(m){
    var params=m[2]||'';
    var um=params.match(/"([^"]+)"/)||params.match(/(media\/[^\s\]]+)/)||params.match(/(data:[^\s\]]+|https?:\/\/[^\s\]]+)/);
    var url=um?um[1]:'';
    var wm=params.match(/width:?\s*(\d+(?:\.\d+)?)\s*%/);
    var hm=params.match(/height:?\s*(\d+(?:\.\d+)?)\s*(mm|cm|%|px)?/);
    var am=params.match(/align:?\s*(\w+)/);
    var style='';
    if(wm)style+='width:'+wm[1]+'%;';
    if(hm)style+='height:'+hm[1]+(hm[2]||'mm')+';';
    if(am){
      if(am[1]==='center')style+='margin-left:auto;margin-right:auto;';
      else if(am[1]==='right')style+='margin-left:auto;margin-right:0;';
      else if(am[1]==='left')style+='margin-right:auto;margin-left:0;';
    }
    if(url&&/^(data:|https?:|media\/)/.test(url)){
      // 包内 media/ 引用 → asset 协议 URL(容器解包后的媒体目录)
      var src=url;
      if(src.indexOf('media/')===0&&window.awenMediaDir&&window.Bridge&&Bridge.mediaSrc){
        src=Bridge.mediaSrc(src);
      }
      return'<img src="'+escAttr(src)+'" alt="图片" style="max-width:100%;display:block;margin:8px auto;'+style+'">';
    }
    // 文件路径图片:占位框,但 width/align 依然可视化
    return'<div class="img-ph" contenteditable="false" style="'+style+'">'+escHtml(url||first)+'</div>';
  }
  return'<div class="img-ph" contenteditable="false">'+escHtml(first)+'</div>';
}

// ── 块 → HTML ──
function blockHtml(b){
  switch(b.kind){
    case 'heading':return'<h'+b.level+'>'+fmtH(b.text)+'</h'+b.level+'>';
    case 'hr':return'<hr>';
    case 'ul':return'<ul'+(b.level?' style="margin-left:'+(b.level*2)+'em"':'')+'><li>'+fmtH(b.text)+'</li></ul>';
    case 'ol':return'<ol'+(b.level?' style="margin-left:'+(b.level*2)+'em"':'')+'><li>'+fmtH(b.text)+'</li></ol>';
    case 'quote':return'<blockquote><p>'+fmtH(b.text)+'</p></blockquote>';
    case 'table':return tableHtml(b);
    case 'obj':return objHtml(b);
    case 'code':return'<div class="codeblock" contenteditable="false"><div class="code-lang">'+escHtml(b.lang||'')+'</div><pre><code>'+escHtml(b.text)+'</code></pre></div>';
    case 'math':return'<div class="mathblock" contenteditable="false"><div class="math-label">数学</div><div class="math-content">'+escHtml(b.text)+'</div></div>';
    case 'label':return'<div class="lblref-block" contenteditable="false">## 标签: '+escHtml(b.text)+'</div>';
    case 'ref':return'<div class="ref-block" contenteditable="false">→ 引用: '+escHtml(b.text)+'</div>';
    case 'scope':{
      var css=scopeCss(b.style,b.param||'');
      var open=b.open||('@['+b.style+' '+(b.param||'')+']');
      var close='@[/'+b.style+']';
      var innerLines=String(b.text||'').split('\n');
      var inner=innerLines.map(function(l){return'<div>'+fmtH(l)+'</div>'}).join('');
      return'<div data-kind="scope" data-cmd="'+escAttr(open)+'" data-close="'+escAttr(close)+'" style="'+escAttr(css)+'">'+inner+'</div>';
    }
    default:return'<p>'+fmtH(b.text)+'</p>';
  }
}

// ── 排版分页(A′ 引擎全权:aine op=parse 附带的 pages/recs 落块)──
// 前端不再有第二套测量/分页策略;页号由引擎 page_flow 决定,整块渲染不劈段。
function layoutCfg(){
  return {pw:cfg.PAGE_W, ph:cfg.PAGE_H, mg:cfg.MARGIN, fp:cfg.FONT_PT, ls:cfg.LINE_H};
}
function layoutFromEngine(nodes,res){
  var n=(res&&res.pages)||0;
  var pages=[];
  for(var i=0;i<n;i++)pages.push([]);
  var recs=(res&&res.recs)||[];
  for(var k=0;k<nodes.length;k++){
    nodes[k].bid=k;   // bid=节点下标(光标恢复/TOC/增量替换按它寻址,旧 layoutPages 同契约)
    var pg=recs[k];
    if(typeof pg!=='number'||pg<0)pg=0;
    if(pg>=n)pg=n>0?n-1:0;
    pages[pg].push({b:nodes[k],whole:true,h:0});
  }
  return pages;
}

// ── DOM → 源码序列化(纸面原生编辑,DOM 是输入,源码是权威)──
function inlineSource(el){
  var out='';
  el.childNodes.forEach(function(n){
    if(n.nodeType===3){ out+=n.textContent; return }
    if(n.nodeType!==1)return;
    var tag=n.tagName, inner=inlineSource(n);
    // 自闭合命令(footnote/label/ref):显示体不是内容,只回写原命令
    if(n.dataset&&n.dataset.self&&n.dataset.cmd){ out+=n.dataset.cmd; return }
    if(tag==='STRONG'||tag==='B')out+='**'+inner+'**';
    else if(tag==='EM'||tag==='I')out+='_'+inner+'_';
    else if(tag==='DEL'||tag==='S'||tag==='STRIKE')out+='~~'+inner+'~~';
    else if(tag==='U')out+='@[u]'+inner+'@[/u]';
    else if(tag==='SUP')out+='@[sup]'+inner+'@[/sup]';
    else if(tag==='SUB')out+='@[sub]'+inner+'@[/sub]';
    else if(tag==='A')out+='@[link '+inner+' url: '+n.getAttribute('href')+']';
    else if(tag==='CODE')out+='`'+inner+'`';
    else if(tag==='FONT'){
      if(n.getAttribute('color'))out+='@[color '+n.getAttribute('color')+']'+inner+'@[/color]';
      else if(n.getAttribute('face'))out+='@[font "'+n.getAttribute('face')+'"]'+inner+'@[/font]';
      else if(n.getAttribute('size'))out+='@[size '+n.getAttribute('size')+']'+inner+'@[/size]';
      else out+=inner;
    }
    else if(tag==='SPAN'){
      if(n.dataset.cmd)out+=n.dataset.cmd+inner+(n.dataset.close||'');
      else out+=inner;
    }
    else if(tag==='BR')out+='\n';
    else out+=inner;
  });
  return out;
}
function blockPrefix(kind,level){
  if(kind==='heading')return'#'.repeat(level||1)+' ';
  if(kind==='ul')return'- ';
  if(kind==='ol')return'1. ';
  if(kind==='quote')return'> ';
  return'';
}
// 单个块元素 → 源码行数组(块内可能被浏览器塞进多个子块)
function serializeBlockEl(el){
  var kind=el.dataset.kind, lines=[];
  if(kind==='heading'&&/^H[1-6]$/.test(el.tagName)){
    lines.push('#'.repeat(+el.tagName.charAt(1))+' '+inlineSource(el).trim());
  }
  else if(kind==='hr'){
    lines.push('---');
  }
  else if(kind==='obj'&&el.dataset.raw){
    // 多行对象(figure 等)整段保真
    el.dataset.raw.split('\n').forEach(function(l){lines.push(l)});
  }
  else if(kind==='code'||kind==='math'){
    // Raw 块:内容行从 dataset.raw 保真,定界符按类型重建(语言/数学)
    var raw=(el.dataset.raw!==undefined?el.dataset.raw:el.textContent).split('\n');
    if(kind==='math'){
      lines.push('@[m]');
      raw.forEach(function(l){lines.push(l)});
      lines.push('@[/m]');
    }else{
      lines.push(el.dataset.lang?'@[c '+el.dataset.lang+']':'@[c]');
      raw.forEach(function(l){lines.push(l)});
      lines.push('@[/c]');
    }
  }
  else if(kind==='toc'){
    // 目录块原样回写
    lines.push(el.dataset.raw||el.textContent.trim());
  }
  else if(kind==='label'||kind==='ref'){
    // 块级 label/ref:渲染时把原始参数存入 data-raw,原样回写
    lines.push('@['+kind+' '+(el.dataset.raw||'')+']');
  }
  else if(kind==='scope'&&el.dataset.cmd){
    // 多行作用域回写:开命令 + 各内行 + 收尾命令(缺口修复)
    lines.push(el.dataset.cmd);
    var kids=el.children, hasKids=false;
    for(var ki=0;ki<kids.length;ki++){
      if(kids[ki].classList.contains('gap'))continue;
      hasKids=true;
      var l2=inlineSource(kids[ki]).replace(/\n+$/,'');
      lines.push(l2.trim()===''?'':l2);
    }
    if(!hasKids){
      var t3=inlineSource(el).replace(/\n+$/,'');
      if(t3.trim()!=='')lines.push(t3);
    }
    lines.push(el.dataset.close||('@[/'+(el.dataset.scopeKind||'font')+']'));
  }
  else if(kind==='para'&&el.tagName==='P'){
    var t=inlineSource(el).replace(/\n+$/,'');
    lines.push(t);
  }
  else if(kind==='ul'||kind==='ol'){
    var items=el.querySelectorAll('li');
    if(items.length===0)items=[el];
    var lvl=parseInt(el.dataset.level||'0',10)||0;
    var indent=new Array(lvl+1).join('  ');
    items.forEach(function(li){ lines.push(indent+blockPrefix(kind)+inlineSource(li).trim()) });
  }
  else if(kind==='quote'){
    var qs=el.querySelectorAll('p,div');
    if(qs.length===0)qs=[el];
    qs.forEach(function(q){ lines.push('> '+inlineSource(q).trim()) });
  }
  else if(kind==='table'){
    var open=el.dataset.open||'@[table demo]';
    lines.push(open);
    var aligns=el.dataset.aligns?el.dataset.aligns.split(','):null;
    var first=true;
    el.querySelectorAll('tr').forEach(function(tr){
      var cellsArr=[];
      tr.querySelectorAll('th,td').forEach(function(c){
        var txt=inlineSource(c).trim();
        // @[cell ...] 属性单元格回写原命令包装
        var cc=c.getAttribute('data-cell-cmd');
        cellsArr.push(cc?cc+txt+'@[/cell]':txt);
      });
      lines.push('| '+cellsArr.join(' | ')+' |');
      if(first){
        first=false;
        var delim=cellsArr.map(function(_,ci){
          var a=(aligns&&aligns[ci])||'left';
          if(a==='center')return' :---: ';
          if(a==='right')return' ---: ';
          return' --- ';
        });
        lines.push('|'+delim.join('|')+'|');
      }
    });
    lines.push('@[/table]');
  }
  else{
    var t2=inlineSource(el).replace(/\n+$/,'');
    lines.push(t2);
  }
  return lines;
}
// 段级序列化:与 serializeAll 同一遍历,同时产出段元数据。
// lines:源码行数组(空行规则 P-02 + 空段配平:1 空段=一对空行,文末空段
//   额外补一行抵消 split 幻影——引擎以「去幻影后的空行数 floor/2」算空段)。
// segs:[{bid,kind,text,l0,l1}] 增量刷新的脏段对比与提交都用它。
function serializeSegments(){
  var lines=[], segs=[];
  var papers=document.querySelectorAll('#display-pane .paper');
  papers.forEach(function(paper){
    var prevKind='';
    paper.childNodes.forEach(function(el){
      if(el.nodeType!==1)return;
      if(el.classList.contains('gap'))return;
      if(el.classList.contains('docset')){
        if(lines.length&&lines[lines.length-1].trim()!==''&&prevKind!=='docset')lines.push('');
        segs.push({bid:el.dataset.bid?+el.dataset.bid:null,kind:'docset',l0:lines.length,l1:0,text:''});
        lines.push(el.textContent);
        segs[segs.length-1].l1=lines.length;
        segs[segs.length-1].text=el.textContent;
      }
      else if(el.classList.contains('comment-src')){
        if(lines.length&&lines[lines.length-1].trim()!==''&&prevKind!=='comment')lines.push('');
        segs.push({bid:el.dataset.bid?+el.dataset.bid:null,kind:'comment',l0:lines.length,l1:0,text:''});
        lines.push(el.dataset.raw||el.textContent);
        segs[segs.length-1].l1=lines.length;
        segs[segs.length-1].text=el.dataset.raw||el.textContent;
      }
      else{
        // 原生 Enter 拆出的新块没有 data-bid,按通用规则识别类型
        var kind=el.dataset.kind||(/^H[1-6]$/.test(el.tagName)?'heading':el.tagName==='UL'?'ul':el.tagName==='OL'?'ol':el.tagName==='BLOCKQUOTE'?'quote':el.tagName==='TABLE'?'table':el.tagName==='HR'?'hr':'para');
        el.dataset.kind=kind;
        if(!el.dataset.bid){
          var maxBid=0;
          document.querySelectorAll('#display-pane [data-bid]').forEach(function(x){maxBid=Math.max(maxBid,+x.dataset.bid)});
          el.dataset.bid=maxBid+1;
        }
        var ls=serializeBlockEl(el);
        // 空段:自带一对空行(2 空行=1 空段),不再吃分隔行
        var isEmptyPara=(kind==='para'&&ls.length===1&&ls[0]==='');
        // 空行保真:除连续列表项外,顶层块之间保持空行(P-02)
        var isList=(kind==='ul'||kind==='ol');
        var prevIsList=(prevKind==='ul'||prevKind==='ol');
        if(!isEmptyPara&&lines.length>0&&lines[lines.length-1].trim()!==''&&!(isList&&prevIsList))lines.push('');
        var s={bid:+el.dataset.bid,kind:kind,l0:lines.length,l1:0,text:''};
        segs.push(s);
        if(isEmptyPara){lines.push('');lines.push('')}
        else ls.forEach(function(l){lines.push(l)});
        s.l1=lines.length;
        s.text=lines.slice(s.l0,s.l1).join('\n');
      }
      prevKind=segs[segs.length-1]?segs[segs.length-1].kind:'';
    });
  });
  // 文末空段补偿:引擎/缓存分段都会剪掉结尾 \n 的幻影行,这里多补一行
  if(segs.length&&segs[segs.length-1].kind==='para'&&segs[segs.length-1].text==='')lines.push('');
  return {lines:lines,segs:segs};
}
// 全文序列化:遍历每页纸的顶层块
function serializeAll(){
  return serializeSegments().lines.join('\n');
}


// ── 导出 ──
window.AwenEngine={
  // 配置
  getConfig:function(){return cfg},
  PAPER_SIZES:PAPER_SIZES,
  setPage:function(o){ if('PAGE_W'in o)cfg.PAGE_W=o.PAGE_W; if('PAGE_H'in o)cfg.PAGE_H=o.PAGE_H; if('MARGIN'in o)cfg.MARGIN=o.MARGIN; if('LINE_H'in o)cfg.LINE_H=o.LINE_H; recalc() },
  applyDocsets:applyDocsets,
  // 解析
  ingestNative:ingestNative,
  // 行内 / 块渲染
  escHtml:escHtml, escAttr:escAttr, displayText:displayText, fmtH:fmtH, scopeCss:scopeCss,
  tableHtml:tableHtml, objHtml:objHtml, blockHtml:blockHtml,
  // 分页(A′ 引擎权威;前端只落块)
  layoutCfg:layoutCfg, layoutFromEngine:layoutFromEngine,
  // 序列化
  inlineSource:inlineSource, blockPrefix:blockPrefix,
  serializeBlockEl:serializeBlockEl, serializeAll:serializeAll,
  serializeSegments:serializeSegments, segRecsToNodes:segRecsToNodes
};
})();
