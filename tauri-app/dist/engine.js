// ═══════════════════════════════════════════════════════════════
// engine.js —— Awen 浏览器近似引擎(预览用途,非权威)
//
// 从 template.html 拆出的文档处理层。职责:
//   解析(miniParse/ingestNative) → HTML 渲染(fmtH/blockHtml/tableHtml/objHtml)
//   → 分页(layoutPages) → DOM 序列化(serializeAll) → 快速诊断(quickDiags)
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
function applyDocsets(nodes){
  var m;
  cfg.PAGE_W=210; cfg.PAGE_H=297; cfg.MARGIN=20; cfg.LINE_H=1.9;
  cfg.FONT_PT=11; cfg.FONT=''; cfg.FIRSTLINE=''; cfg.PARA_SPACING='0em';
  for(var i=0;i<nodes.length;i++){
    if(nodes[i].kind!=='docset')continue;
    var t=nodes[i].text||'';
    if(m=t.match(/^@\[page\s+(\w+)\s*\]/)){ var sz=PAPER_SIZES[m[1]]; if(sz){cfg.PAGE_W=sz[0];cfg.PAGE_H=sz[1]} }
    else if(m=t.match(/^@\[margin\s+([\d.]+)\s*(?:mm)?\s*\]/)){ cfg.MARGIN=parseFloat(m[1]) }
    else if(m=t.match(/^@\[line-spacing\s+([\d.]+)\s*\]/)){ cfg.LINE_H=parseFloat(m[1]) }
    else if(m=t.match(/^@\[size\s+([\d.]+)\s*(?:pt)?\s*\]/)){ cfg.FONT_PT=parseFloat(m[1]) }
    else if(m=t.match(/^@\[font\s+"([^"]+)"\s*\]/)){ cfg.FONT=m[1] }
    else if(m=t.match(/^@\[first-line\s+([\d.]+em)\s*\]/)){ cfg.FIRSTLINE=m[1] }
    else if(m=t.match(/^@\[para-spacing\s+([\d.]+em|\d+)\s*\]/)){ cfg.PARA_SPACING=m[1].match(/em$/)?m[1]:m[1]+'em' }
  }
  recalc();
}

// ── 断行度量(镜像 layout_width.aine)──
function isIdeo(c){return /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(c)}
function isLatn(c){return /[A-Za-z0-9]/.test(c)}
function isCloseP(c){return /[。，、；？！」』）】》〉〕］｝]/.test(c)}
function isOpenP(c){return /[「『（《【〈〔［｛]/.test(c)}

function measureEm(text){
  var w=0, prev='';
  for(var i=0;i<text.length;i++){
    var c=text[i], cw;
    if(isIdeo(c))cw=1;
    else if(isCloseP(c))cw=(prev&&isCloseP(prev))?0.5:1;
    else if(isOpenP(c))cw=1;
    else if(isLatn(c))cw=0.5;
    else if(c===' ')cw=0.3;
    else cw=0.5;
    if(i>0&&((isIdeo(prev)||isCloseP(prev))&&isLatn(c)||(isLatn(prev)&&(isIdeo(c)||isCloseP(c)))))w+=0.125;
    w+=cw; prev=c;
  }
  return w;
}
function tokenize(text){
  var toks=[], cur='';
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(isLatn(c)){ cur+=c; continue }
    if(cur){ toks.push(cur); cur='' }
    toks.push(c);
  }
  if(cur)toks.push(cur);
  return toks;
}
// 贪心断行 + 禁则修正(镜像 layout_line_break;D-3 词边界)
function breakLines(text){
  var toks=tokenize(text), lines=[], cur='', curW=0;
  for(var i=0;i<toks.length;i++){
    var t=toks[i], tw=measureEm(t);
    var isClose=t.length===1&&isCloseP(t);
    var isOpen=t.length===1&&isOpenP(t);
    if(curW+tw<=MAX_EM||cur===''){ cur+=t; curW+=tw }
    else if(isClose){ cur+=t; lines.push(cur); cur=''; curW=0 }
    else if(isOpen&&cur.length>1){
      var last=cur.charAt(cur.length-1);
      lines.push(cur.slice(0,-1));
      cur=last+t; curW=measureEm(cur);
    }else{ lines.push(cur); cur=t; curW=tw }
  }
  if(cur)lines.push(cur);
  return lines.length?lines:[''];
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
    .replace(/@\[link\s+([^\]]+?)\s+url:\s*([^\]]+)\]/g,'$1')
    .replace(/@\[footnote\s+(\d+)\s+([^\]]+)\]/g,'$2')
    .replace(/@\[label\s+([^\]]+)\]/g,'$1')
    .replace(/@\[ref\s+([^\]]+)\]/g,'$1')
    .replace(/_((?:.|])*?)_/g,'$1');
  return unescTokens(s);
}
function fmtH(t){
  var s=escHtml(t);
  s=escTokens(s);
  s=s.replace(/@\[u\]((?:.|])*?)@\[\/u\]/g,'<u>$1</u>');
  s=s.replace(/@\[sup\]((?:.|])*?)@\[\/sup\]/g,'<sup>$1</sup>');
  s=s.replace(/@\[sub\]((?:.|])*?)@\[\/sub\]/g,'<sub>$1</sub>');
  s=s.replace(/@\[mark\s+([^\]]+)\]((?:.|])*?)@\[\/mark\]/g,'<span data-cmd="@[mark $1]" data-close="@[/mark]" style="background:$1">$2</span>');
  s=s.replace(/@\[color\s+([^\]]+)\]((?:.|])*?)@\[\/color\]/g,'<span data-cmd="@[color $1]" data-close="@[/color]" style="color:$1">$2</span>');
  s=s.replace(/@\[size\s+([^\]]+)\]((?:.|])*?)@\[\/size\]/g,'<span data-cmd="@[size $1]" data-close="@[/size]" style="font-size:$1pt">$2</span>');
  s=s.replace(/@\[link\s+([^\]]+?)\s+url:\s*"?([^"\]]+)"?\]/g,'<a href="$2" target="_blank" style="color:#2a4a66;text-decoration:underline">$1</a>');
  s=s.replace(/@\[footnote\s+(\d+)\s+([^\]]+)\]/g,function(m,n,txt){
    // data-self:自闭合命令,序列化只回写原命令(显示体是编号,内容在 data-cmd 里)
    return '<sup class="fn" data-cmd="'+escAttrQ(m)+'" data-self="1" title="'+txt.replace(/"/g,'')+'" style="color:#2a4a66;cursor:help">'+n+'</sup>';
  });
  s=s.replace(/@\[font\s+([^\]]+)\]((?:.|])*?)@\[\/font\]/g,function(m,f,inner){
    f=f.replace(/"/g,'');
    return'<span data-cmd=\'@[font "' + f + '"]\' data-close="@[/font]" style="font-family:\'' + f + '\',serif">' + inner + '</span>';
  });
  s=s.replace(/\*\*((?:.|])*?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/~~((?:.|])*?)~~/g,'<del>$1</del>');
  s=s.replace(/`((?:.|])*?)`/g,'<code>$1</code>');
  s=s.replace(/_((?:.|])*?)_/g,'<em>$1</em>');
  s=s.replace(/@\[label\s+([^\]]+)\]/g,function(m){
    return '<span class="inline-label" data-cmd="'+escAttrQ(m)+'" data-self="1" title="标签">📌'+escAttrQ(m).replace(/@\[label\s+/,'').replace(/\]$/,'')+'</span>';
  });
  s=s.replace(/@\[ref\s+([^\]]+)\]/g,function(m){
    return '<span class="inline-ref" data-cmd="'+escAttrQ(m)+'" data-self="1" title="引用">↦'+escAttrQ(m).replace(/@\[ref\s+/,'').replace(/\]$/,'')+'</span>';
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

// ── 块级解析(带源码行区间;srcStart 0 基,srcEnd 半开 [start,end))──
function miniParse(src){
  var lines=src.split('\n'), nodes=[], para=null;
  function flush(ei){ if(para){ para.srcEnd=ei; nodes.push(para); para=null } }
  for(var i=0;i<lines.length;i++){
    var t=lines[i].trim();
    if(t===''){ flush(i); continue }
    if(/^#{1,6}\s/.test(t)){
      flush(i);
      nodes.push({kind:'heading',level:t.match(/^#+/)[0].length,text:t.replace(/^#+\s*/,''),srcStart:i,srcEnd:i+1});
      continue;
    }
    if(t==='---'){ flush(i); nodes.push({kind:'hr',text:'',srcStart:i,srcEnd:i+1}); continue }
    if(/^[-*] /.test(t)){ flush(i); nodes.push({kind:'ul',level:Math.floor((lines[i].length-lines[i].replace(/^\s+/,'').length)/2),text:t.replace(/^[-*] /,''),srcStart:i,srcEnd:i+1}); continue }
    if(/^\d+\. /.test(t)){ flush(i); nodes.push({kind:'ol',level:Math.floor((lines[i].length-lines[i].replace(/^\s+/,'').length)/2),text:t.replace(/^\d+\. /,''),srcStart:i,srcEnd:i+1}); continue }
    if(/^> /.test(t)){ flush(i); nodes.push({kind:'quote',text:t.replace(/^>\s*/,''),srcStart:i,srcEnd:i+1}); continue }
    if(t.charAt(0)==='|'&&t.charAt(t.length-1)==='|'){
      flush(i);
      var j=i, rows=[];
      while(j<lines.length&&lines[j].trim().charAt(0)==='|'){ rows.push(lines[j].trim()); j++ }
      nodes.push({kind:'table',open:'@[table demo]',rows:rows,srcStart:i,srcEnd:j});
      i=j-1; continue;
    }
    if(/^@\[comment/.test(t)){
      flush(i);
      // 单行自闭合:本行有配平 ] 且命令内含非空内容(corpus 41 行式);
      // 裸 @[comment] 一律视为块级开头,向后找 @[/comment](corpus 47 行式)
      var cb=t.indexOf('[');
      var closeBr=cb>=0?scanCmdClose(t,cb):-1;
      var nameEnd=cb+1+'comment'.length;
      if(closeBr>nameEnd&&t.slice(nameEnd,closeBr).trim()!==''){
        var restC=t.substring(closeBr+1).trim();
        nodes.push({kind:'comment',text:t,srcStart:i,srcEnd:i+1});
        if(restC)nodes.push({kind:'para',text:restC,srcStart:i+1,srcEnd:i+2});
        continue;
      }
      // 块级:向后找 @[/comment] 收尾
      var ci=i+1;
      while(ci<lines.length&&lines[ci].indexOf('@[/comment]')<0&&lines[ci].trim()!==']')ci++;
      ci=Math.min(ci+1,lines.length);
      nodes.push({kind:'comment',text:lines.slice(i,ci).join('\n'),srcStart:i,srcEnd:ci});
      i=ci-1; continue;
    }
    if(/^@\[(table|figure)\s/.test(t)||t==='@[table]'){
      flush(i);
      var closeTag='@[/'+t.match(/^@\[(\w+)/)[1]+']';
      var isFigure=t.indexOf('figure')>=0;
      var fi;
      if(t.indexOf(closeTag)>=0){ fi=i; }
      else{
        fi=i+1;
        while(fi<lines.length&&lines[fi].indexOf(closeTag)<0&&lines[fi].trim()!==']')fi++;
      }
      if(fi>=lines.length&&!isFigure&&t.indexOf(closeTag)<0&&t!=='@[table]'){
        // 未闭合的 @[figure …](单行对象,规范允许):不吞后文
        nodes.push({kind:'obj',text:t,srcStart:i,srcEnd:i+1});
        continue;
      }
      // fi=收尾行索引;rest=收尾行中 closeTag 之后的文字
      var cl=fi<lines.length?lines[fi]:'';
      var ci2=cl.indexOf(closeTag);
      var rest=ci2>=0?cl.substring(ci2+closeTag.length).trim():'';
      var trows=[];
      for(var ri=i+1;ri<fi;ri++){ if(lines[ri].trim().charAt(0)==='|')trows.push(lines[ri].trim()) }
      if(isFigure){
        nodes.push({kind:'obj',text:lines.slice(i,Math.min(fi+1,lines.length)).join('\n'),srcStart:i,srcEnd:Math.min(fi+1,lines.length)});
      }else{
        nodes.push({kind:'table',open:t,rows:trows,srcStart:i,srcEnd:Math.min(fi+1,lines.length)});
      }
      if(rest)nodes.push({kind:'para',text:rest,srcStart:fi+1,srcEnd:fi+2});
      i=Math.min(fi,lines.length-1); continue;
    }
    if(/^@\[c (\w+)\]/.test(t)){
      flush(i);
      var lang=t.match(/^@\[c (\w+)\]/)[1];
      var cc=i+1;
      var cClose='@[/c]';
      while(cc<lines.length&&lines[cc].indexOf(cClose)<0)cc++;
      var codeLines=[];
      for(var li=i+1;li<cc;li++)codeLines.push(lines[li]);
      nodes.push({kind:'code',lang:lang,text:codeLines.join('\n'),srcStart:i,srcEnd:Math.min(cc+1,lines.length)});
      i=Math.min(cc,lines.length-1); continue;
    }
    if(t==='@[m]'){
      flush(i);
      var mi=i+1; var mLines=[];
      while(mi<lines.length&&lines[mi].indexOf('@[/m]')<0){mLines.push(lines[mi]);mi++}
      nodes.push({kind:'math',text:mLines.join('\n'),srcStart:i,srcEnd:Math.min(mi+1,lines.length)});
      i=Math.min(mi,lines.length-1); continue;
    }
    if(/^@\[label\s+/.test(t)){ flush(i); nodes.push({kind:'label',text:t.replace(/^@\[label\s+/,'').replace(/\]$/,''),srcStart:i,srcEnd:i+1}); continue }
    if(/^@\[ref\s+/.test(t)){ flush(i); nodes.push({kind:'ref',text:t.replace(/^@\[ref\s+/,'').replace(/\]$/,''),srcStart:i,srcEnd:i+1}); continue }
    // 多行作用域:开行 `@[font|size|color 参数]` 后无行内内容,且后面存在以
    // `@[/同名]` 开头的收尾行(行内 `文字@[/font]。` 不以 @[/ 开头,不误判;
    // doc 级 `@[font "X"]` 后无行首收尾行,仍走 docset 分支)
    var mScope=t.match(/^@\[(font|size|color)\s+([^\]]*)\]\s*$/);
    if(mScope){
      var kind2=mScope[1];
      var close2='@[/'+kind2+']';
      var si=i+1, found=false;
      while(si<lines.length){ if(lines[si].trim().indexOf(close2)===0){found=true;break} si++ }
      if(found){
        flush(i);
        var innerLines=[];
        for(var li2=i+1;li2<si;li2++)innerLines.push(lines[li2]);
        var param=mScope[2].trim();
        var openCmd='@['+kind2+' '+param+']';
        nodes.push({kind:'scope',style:kind2,param:param,open:openCmd,text:innerLines.join('\n'),srcStart:i,srcEnd:si+1});
        // 收尾行 ] 之后的内容归入后续段落
        var restS=lines[si].trim().substring(close2.length).trim();
        if(restS)nodes.push({kind:'para',text:restS,srcStart:si+1,srcEnd:si+2});
        i=si; continue;
      }
      // 未找到收尾行 → 视为 doc 级设置,落入 docset 分支
    }
    if(/^@\[toc/.test(t)){
      // 目录块:渲染期由标题节点生成(深度取 depth 参数),序列化原样回写
      flush(i);
      nodes.push({kind:'toc',text:t,srcStart:i,srcEnd:i+1});
      continue;
    }
    if(/^@\[image/.test(t)){ flush(i); nodes.push({kind:'obj',text:t,srcStart:i,srcEnd:i+1}); continue }
    if(/^@\[(page|margin|font|size|line-spacing|first-line|theme|numbering|para-spacing)\s/.test(t)){
      flush(i); nodes.push({kind:'docset',text:t,srcStart:i,srcEnd:i+1}); continue;
    }
    if(!para)para={kind:'para',text:'',srcStart:i};
    para.text=para.text?(para.text+' '+t):t;
  }
  flush(lines.length);
  return nodes;
}

// ── native blocks JSON → 引擎节点(桌面版权威解析结果的入口)──
// native 记录:{kind, level, srcStart, srcEnd, text}(text=原始源码行 \n 连接,
// 含块定界行)。这里按 miniParse 同一套规则规整 text 与行区间,保证下游
// blockHtml/layoutPages/serializeAll 与本地解析路径零差异。
function ingestNative(blocks,src){
  var srcLines=src.split('\n'), out=[];
  function trimSpan(b){
    var s=b.srcStart,e=b.srcEnd;
    while(s<e&&(srcLines[s]===undefined||srcLines[s].trim()===''))s++;
    while(e>s&&(srcLines[e-1]===undefined||srcLines[e-1].trim()===''))e--;
    b.srcStart=s; b.srcEnd=e; return b;
  }
  for(var i=0;i<blocks.length;i++){
    var nb=blocks[i];
    var raw=(nb.text||'').split('\n');
    var b={kind:nb.kind,level:nb.level||0,srcStart:nb.srcStart,srcEnd:nb.srcEnd};
    var k=nb.kind;
    if(k==='heading'){
      b.text=raw.join(' ').replace(/^\s*#+\s*/,'');
    }else if(k==='para'){
      b.text=raw.map(function(l){return l.trim()}).filter(function(l){return l!==''}).join(' ');
    }else if(k==='ul'||k==='ol'){
      var items=raw.map(function(l){return l.trim()}).filter(function(l){return l!==''});
      b.level=items.length?Math.floor((items[0].length-items[0].replace(/^\s+/,'').length)/2):0;
      b.text=items.map(function(l){return l.replace(k==='ul'?/^[-*] /:/^\d+\. /,'')}).join(' ');
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
      }else if(/^@\[(page|margin|font|size|line-spacing|first-line|theme|numbering|para-spacing)\s/.test(one)){
        b.kind='docset'; b.text=one;
      }else if(/^@\[label\s/.test(one)){
        b.kind='label'; b.text=one.replace(/^@\[label\s+/,'').replace(/\]$/,'');
      }else if(/^@\[ref\s/.test(one)){
        b.kind='ref'; b.text=one.replace(/^@\[ref\s+/,'').replace(/\]$/,'');
      }else{
        b.text=(nb.text||'');
      }
    }
    out.push(trimSpan(b));
  }
  return out;
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
    var um=params.match(/"([^"]+)"/)||params.match(/(data:[^\s\]]+|https?:\/\/[^\s\]]+)/);
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
    if(url&&/^(data:|https?:)/.test(url)){
      return'<img src="'+escAttr(url)+'" alt="图片" style="max-width:100%;display:block;margin:8px auto;'+style+'">';
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

// ── 排版分页(像素级实测;依赖 DOM)──
var _pxPerMm=null;
function pxPerMm(){
  if(_pxPerMm)return _pxPerMm;
  var d=document.createElement('div');
  d.style.cssText='position:absolute;visibility:hidden;height:100mm';
  document.body.appendChild(d);
  _pxPerMm=d.getBoundingClientRect().height/100;
  document.body.removeChild(d);
  return _pxPerMm;
}
function layoutPages(blocks){
  var mm=pxPerMm();
  var capacity=(cfg.PAGE_H-2*cfg.MARGIN-8)*mm;
  var m=document.createElement('div');
  m.style.cssText='position:absolute;visibility:hidden;left:-9999px;top:0;width:'+(cfg.PAGE_W-2*cfg.MARGIN)+'mm;font-family:var(--serif);font-size:'+cfg.FONT_PT+'pt;line-height:'+cfg.LINE_H+';color:#303238';
  document.body.appendChild(m);
  var items=[];
  for(var i=0;i<blocks.length;i++){
    var b=blocks[i]; b.bid=i;
    var el;
    if(b.kind==='para'){
      el=document.createElement('p');
      el.innerHTML=fmtH(b.text);
    }else{
      var wrap=document.createElement('div');
      wrap.innerHTML=blockHtml(b);
      el=wrap.firstElementChild;
    }
    m.appendChild(el);
    var h=el.getBoundingClientRect().height;
    var pl=(b.kind==='para'||b.kind==='ul'||b.kind==='ol'||b.kind==='quote')?breakLines(displayText(b.text)):null;
    items.push({b:b,h:h,lines:pl,lineH:h/Math.max(pl?pl.length:1,1)});
    m.removeChild(el);
  }
  document.body.removeChild(m);
  var pages=[],cur=[],used=0;
  var gapPxEach=0.55*cfg.FONT_PT*(96/72);
  for(var k=0;k<items.length;k++){
    var it=items[k];
    if(it.h>capacity&&it.b.kind==='para'){
      if(cur.length){pages.push(cur);cur=[]}
      var linesCount=Math.max(1,Math.round(it.h/it.lineH));
      var perPage=Math.max(1,Math.floor(capacity/it.lineH));
      var pos=0;
      while(pos<linesCount){
        var take=Math.min(perPage,linesCount-pos);
        cur.push({b:it.b,l0:pos,l1:pos+take,partLines:it.lines,h:take*it.lineH});
        pos+=take;
        if(pos<linesCount){pages.push(cur);cur=[]}
      }
      continue;
    }
    if(used>0&&used+it.h>capacity){pages.push(cur);cur=[];used=0}
    cur.push({b:it.b,whole:true,h:it.h});
    used+=it.h+gapPxEach;
  }
  if(cur.length)pages.push(cur);
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
// 全文序列化:遍历每页纸的顶层块
function serializeAll(){
  var out=[];
  var papers=document.querySelectorAll('#display-pane .paper');
  papers.forEach(function(paper){
    var prevKind='';
    paper.childNodes.forEach(function(el){
      if(el.nodeType!==1)return;
      if(el.classList.contains('gap'))return;
      if(el.classList.contains('docset')){ if(out.length&&out[out.length-1].trim()!==''&&prevKind!=='docset')out.push(''); out.push(el.textContent); prevKind='docset'; return }
      if(el.classList.contains('comment-src')){ if(out.length&&out[out.length-1].trim()!==''&&prevKind!=='comment')out.push(''); out.push(el.dataset.raw||el.textContent); prevKind='comment'; return }
      // 原生 Enter 拆出的新块没有 data-bid,按通用规则识别类型
      var kind=el.dataset.kind||(/^H[1-6]$/.test(el.tagName)?'heading':el.tagName==='UL'?'ul':el.tagName==='OL'?'ol':el.tagName==='BLOCKQUOTE'?'quote':el.tagName==='TABLE'?'table':el.tagName==='HR'?'hr':'para');
      el.dataset.kind=kind;
      if(!el.dataset.bid){
        var maxBid=0;
        document.querySelectorAll('#display-pane [data-bid]').forEach(function(x){maxBid=Math.max(maxBid,+x.dataset.bid)});
        el.dataset.bid=maxBid+1;
      }
      var lines=serializeBlockEl(el);
      // 空行保真:除连续列表项外,顶层块之间保持空行(P-02)
      var isList=(kind==='ul'||kind==='ol');
      var prevIsList=(prevKind==='ul'||prevKind==='ol');
      if(out.length>0&&out[out.length-1].trim()!==''&&!(isList&&prevIsList))out.push('');
      lines.forEach(function(l){out.push(l)});
      prevKind=kind;
    });
  });
  return out.join('\n');
}

// ── 快速诊断(浏览器降级;桌面版以 Bridge 原生诊断为准)──
function quickDiags(src){
  var out=[],lines=src.split('\n');
  var tOpen=0,cOpen=0;
  for(var i=0;i<lines.length;i++){
    var t=lines[i];
    if(t.indexOf('@[table')===0)tOpen++;
    if(t.indexOf('@[/table]')>=0)tOpen--;
    var trimT=t.trim();
    if(t.indexOf('@[comment')===0&&trimT.charAt(trimT.length-1)!==']')cOpen++;
    if(t.indexOf('@[/comment]')>=0)cOpen--;
    var m=t.match(/^@\[([a-z-]+)[\s\]]/i);
    if(m){
      var known='table,figure,image,comment,link,footnote,toc,first-line,page,margin,font,size,line-spacing,para-spacing,theme,toc,numbering,u,color,mark,sup,sub,label,ref,cell,b,bold,m,math,c,code'.split(',');
      if(known.indexOf(m[1].toLowerCase())<0)out.push({sev:'warn',msg:'未识别的命令: @['+m[1],line:i+1});
    }
  }
  if(tOpen>0)out.push({sev:'err',msg:'表格 @[table] 缺少 @[/table] 收尾',line:lines.length});
  if(cOpen>0)out.push({sev:'err',msg:'批注 @[comment] 缺少 @[/comment] 收尾',line:lines.length});
  return out;
}

// ── 导出 ──
window.AwenEngine={
  // 配置
  getConfig:function(){return cfg},
  PAPER_SIZES:PAPER_SIZES,
  setPage:function(o){ if('PAGE_W'in o)cfg.PAGE_W=o.PAGE_W; if('PAGE_H'in o)cfg.PAGE_H=o.PAGE_H; if('MARGIN'in o)cfg.MARGIN=o.MARGIN; if('LINE_H'in o)cfg.LINE_H=o.LINE_H; recalc() },
  applyDocsets:applyDocsets,
  // 解析
  parse:miniParse,
  ingestNative:ingestNative,
  quickDiags:quickDiags,
  // 行内 / 块渲染
  escHtml:escHtml, escAttr:escAttr, displayText:displayText, fmtH:fmtH, scopeCss:scopeCss,
  tableHtml:tableHtml, objHtml:objHtml, blockHtml:blockHtml,
  // 分页(依赖 DOM 测量)
  breakLines:breakLines, measureEm:measureEm, layoutPages:layoutPages,
  // 序列化
  inlineSource:inlineSource, blockPrefix:blockPrefix,
  serializeBlockEl:serializeBlockEl, serializeAll:serializeAll
};
})();
