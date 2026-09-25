// 渲染:每张 A4 纸一个整体可编辑区(render 走 Bridge.parse 权威解析)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 渲染:每张 A4 纸一个整体可编辑区(原生 Enter/Delete)═══
var gSrc='', gPages=[], gNodes=[];
// 当前文档标识(daemon 增量排版状态按文档隔离;多标签互不覆盖)
function currentDocId(){
  if(typeof activeFile!=='undefined'&&activeFile>=0&&typeof openFiles!=='undefined'&&openFiles[activeFile]){
    if(!openFiles[activeFile].id)openFiles[activeFile].id='doc-'+Date.now()+'-'+Math.floor(Math.random()*1000000);
    return openFiles[activeFile].id;
  }
  return 'doc-singleton';
}
// 渲染入口(异步):源码 → Aine 权威解析 → ingest → 分页 → DOM
// seq 防过期:新请求发出后,旧响应丢弃
var renderSeq=0;
// renderPending=true 表示权威渲染在途,纸面 DOM 还是旧结构——
// 期间 serializeAll 只会拿到旧内容,applySyncNow 必须推迟而不是覆盖 gSrc
var renderPending=false;
// 超长 data URI 送引擎解析前替换为占位引用(aine 解释器对几百 KB 的
// 行内字符串会长时间无响应),块结构不受影响;解析返回后按映射把原文
// 恢复进块文本供渲染。gSrc 不做替换。
function parseSafe(src,cfg,doc){
  if(src.length<20000||src.indexOf('"data:image/')<0)return Bridge.parse(src,cfg,doc);
  var out=src,map={},n=0;
  var re=/"data:image\/[^;"]{400,}"/g;
  out=out.replace(re,function(m){
    var k='media/awen-elided-'+(n++);
    map[k]=m.slice(1,-1);
    return '"'+k+'"';
  });
  if(n===0)return Bridge.parse(src,cfg,doc);
  return Bridge.parse(out,cfg,doc).then(function(res){
    (res.blocks||[]).forEach(function(b){
      if(!b.text)return;
      Object.keys(map).forEach(function(k){
        if(b.text.indexOf(k)>=0)b.text=b.text.split(k).join(map[k]);
      });
    });
    return res;
  });
}
function render(src,caret,done){
  gSrc=src;
  renderPending=true;
  incrSeq++;                      // 使在途的增量刷新过期
  var seq=++renderSeq;
  var cfgReq=Engine.layoutCfg();
  if(window.__orient==='landscape'){var t=cfgReq.pw;cfgReq.pw=cfgReq.ph;cfgReq.ph=t}
      if(window.gWidths&&window.gWidths.font===(CFG.FONT||'')){cfgReq.widths=window.gWidths.data;cfgReq.widths.k=(window.gWidths.data.w||[]).join(',')}   // undefined 键不会写入 JSON(null 会送 daemon 崩)
  parseSafe(src,cfgReq,currentDocId()).then(function(res){
    if(seq!==renderSeq)return;
    // 打字会话进行中或有未落盘编辑、或光标停在空段上:不重建纸面(重建会把
    // 光标恢复到旧快照位置,窗口期内的输入错位——即"输入回退")。改为"纸面为准":
    // 立即序列化当前 DOM 与 gSrc 比对,有差异就推进 gSrc 并重新调度解析;
    // 完全一致(纯排版刷新)才安全重建,重建前后保住光标。
    var emptyHold=emptyParaUnderCaret();
    if(repagTimer||refreshTimer||window.composing||emptyHold||Date.now()-(window.lastPaperInputAt||0)<800){
      renderPending=false;
      if(!emptyHold){
        var curSrc=Engine.serializeAll();
        if(curSrc!==gSrc){
          gSrc=curSrc;
          recordHist(curSrc,true);
          // 显→语同步:守卫期推进的 gSrc 也要落语法框(此前只等全量渲染,分屏下语法侧滞后)
          var taH=document.getElementById('syntax-src');
          if(taH&&currentMode!=='display'&&taH.value!==gSrc)taH.value=gSrc;
          scheduleNativeRefresh(saveCaret());
        }
      }
      return;
    }
    renderPending=false;
    var caretNow=saveCaret();
    gNodes=Engine.ingestNative(res.blocks||[],gSrc);
    gSegCache=buildSegCache(gSrc,gNodes);
    Engine.applyDocsets(gNodes,res.docsets);   // 文档级设置生效(引擎结构化下发,十语种别名归一)
    CFG=Engine.getConfig();
    if(window.__orient==='landscape')Engine.setPage({PAGE_W:CFG.PAGE_H,PAGE_H:CFG.PAGE_W});
    ensureFontWidths();   // 字体变了异步刷新宽表(下一轮渲染生效)
    // A′ 引擎全权排版:页号来自 aine page_flow(与解析同一响应),整块落页不劈段
    gPages=Engine.layoutFromEngine(gNodes,res);
    renderNodes();
    nativeDiags={src:gSrc,ds:res.diags||[]};
    updateDiagBar();
    if(caretNow)restoreCaret(caretNow);
    if(done)done();
  }).catch(function(e){
    renderPending=false;
    document.getElementById('st-diag').textContent='解析失败';
    console.error(e);
  });
}
// 会话级覆盖(横向等)用:cfg 变了须交引擎按新页面模型重新分页,
// 故走全量 render(重新解析+引擎排版),不再有本地第二套分页
function renderKeep(){
  render(gSrc);
}
// 用现有 gNodes/gPages 重建纸面 DOM(本地解析与原生权威解析共用出口)
function renderNodes(){
  var pane=document.getElementById('display-pane');
  var scrollKeep=pane.scrollTop;
  pane.innerHTML='';
  // 空文档也显示一张空白纸(Word 行为),不再是空空如也
  var pageList=gPages.length?gPages:[[]];
  for(var p=0;p<pageList.length;p++){
    var sheet=document.createElement('div');
    sheet.className='sheet';
    sheet.style.width=CFG.PAGE_W+'mm';
    sheet.style.minHeight=CFG.PAGE_H+'mm';
    sheet.style.padding=CFG.MARGIN+'mm';
    var paper=document.createElement('div');
    paper.className='paper';
    paper.contentEditable=window.restrictEdit?'false':'true';
    paper.style.lineHeight=CFG.LINE_H;
    if(CFG.FONT)paper.style.fontFamily='\''+CFG.FONT+'\',serif';
    paper.style.setProperty('--fl',CFG.FIRSTLINE||'0em');
    paper.style.setProperty('--ps',CFG.PARA_SPACING||'0em');
    paper.dataset.page=p;
    for(var k=0;k<pageList[p].length;k++){
      var item=pageList[p][k], b=item.b;
      if(b.kind==='toc'){
        // 目录块:按标题节点生成,深度取 depth 参数,点击跳转
        var dep=parseInt((b.text.match(/depth:\s*(\d+)/)||[0,6])[1]);
        var toc=document.createElement('div');
        toc.className='tocblock'; toc.contentEditable='false';
        toc.dataset.bid=b.bid; toc.dataset.kind='toc'; toc.dataset.raw=b.text;
        var inner='<div class="toc-title">目录</div>';
        var tocCount=0;
        for(var ti=0;ti<gNodes.length;ti++){
          var hn=gNodes[ti];
          if(hn.kind!=='heading'||hn.level>dep)continue;
          tocCount++;
          inner+='<div class="toc-item lv'+hn.level+'" data-bid="'+hn.bid+'">'+Engine.escHtml(Engine.displayText(hn.text||''))+'</div>';
        }
        if(!tocCount)inner+='<div style="color:#9aa0a6;font-size:10pt">暂无标题,写作过程中自动生成</div>';
        toc.innerHTML=inner;
        toc.onclick=function(ev){
          var it=ev.target.closest('.toc-item');
          if(!it)return;
          var t=document.querySelector('#display-pane [data-bid="'+it.dataset.bid+'"]');
          if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
        };
        paper.appendChild(toc);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='obj'){
        var obj=makeBlock(b,item);
        obj.style.cursor='pointer';
        obj.title='点击设置图片属性(宽度/对齐)';
        (function(bb){
          obj.addEventListener('click',function(){ openImagePanel(bb.bid) });
        })(b);
        paper.appendChild(obj);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='docset'){
        var d=document.createElement('div'); d.className='docset'; d.contentEditable='false'; d.textContent=b.text; d.title='文档设置(源码): '+b.text;
        paper.appendChild(d);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='comment'){
        var cm=document.createElement('div'); cm.className='comment-src'; cm.contentEditable='false';
        cm.textContent=b.text; cm.dataset.raw=b.text; cm.title='批注(不参与渲染): '+b.text;
        paper.appendChild(cm);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='code'){
        var pre=document.createElement('div');
        pre.className='codeblock';
        pre.contentEditable='false';
        pre.dataset.bid=b.bid; pre.dataset.kind='code';
        pre.dataset.raw=b.text; pre.dataset.lang=b.lang||'';
        pre.innerHTML='<div class="code-lang">'+Engine.escHtml(b.lang)+'</div><pre><code>'+Engine.escHtml(b.text)+'</code></pre>';
        paper.appendChild(pre);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='math'){
        var mm=document.createElement('div');
        mm.className='mathblock'; mm.contentEditable='false';
        mm.dataset.bid=b.bid; mm.dataset.kind='math';
        mm.dataset.raw=b.text;
        mm.innerHTML='<div class="math-label">数学</div><div class="math-content">'+Engine.escHtml(b.text)+'</div>';
        paper.appendChild(mm);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='label'){
        var lb=document.createElement('div'); lb.className='lblref-block';
        lb.contentEditable='false'; lb.dataset.bid=b.bid; lb.dataset.kind='label';
        lb.dataset.raw=b.text;
        lb.textContent='📌 标签: '+b.text;
        paper.appendChild(lb);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='ref'){
        var rf=document.createElement('div'); rf.className='ref-block';
        rf.contentEditable='false'; rf.dataset.bid=b.bid; rf.dataset.kind='ref';
        rf.dataset.raw=b.text;
        rf.textContent='↦ 引用: '+b.text;
        paper.appendChild(rf);
        paper.appendChild(gapEl()); continue;
      }
      paper.appendChild(makeBlock(b,item));
      paper.appendChild(gapEl());
    }
    // 页眉/页脚条(文档级 @[header]/@[footer] 设置;%p = 页码)
    if((CFG.LINENUMBERS||'')==='on')sheet.classList.add('linenums');
    var hdr=CFG.HEADER||'', ftr=CFG.FOOTER||'', pno=p+1;
    if(hdr){
      var hEl=document.createElement('div');
      hEl.className='hdr'; hEl.contentEditable='false';
      hEl.style.top=Math.max(2,CFG.MARGIN*0.35)+'mm';
      hEl.innerHTML=Engine.fmtH(String(hdr).replace(/%p/g,pno));
      sheet.appendChild(hEl);
    }
    if(ftr){
      var fEl=document.createElement('div');
      fEl.className='ftr'; fEl.contentEditable='false';
      fEl.style.bottom=Math.max(2,CFG.MARGIN*0.35)+'mm';
      fEl.innerHTML=Engine.fmtH(String(ftr).replace(/%p/g,pno));
      sheet.appendChild(fEl);
    } else {
      var folio=document.createElement('div');
      folio.className='folio'; folio.contentEditable='false'; folio.textContent='— '+(p+1)+' —';
      sheet.appendChild(folio);
    }
    sheet.appendChild(paper);
    pane.appendChild(sheet);
    if(scrollKeep>0)pane.scrollTop=scrollKeep;   // 重建保持滚动位置
  }
  renderOutline();
  renderStatus();
  updateGutter();
  var ta=document.getElementById('syntax-src');
  if(ta&&ta.value!==gSrc)ta.value=gSrc;
  // 同步文档级设置控件(每次渲染后,切文档/改源码均保持一致)
  var fl=document.getElementById('btn-firstline');
  if(fl)fl.classList.toggle('on',gSrc.indexOf('@[first-line')>=0);
  var ps=document.getElementById('sel-parasp');
  if(ps){
    var m=gSrc.match(/^@\[para-spacing\s+([^\]]+)\]/m);
    var v=m?m[1].trim():'0';
    var has=false;
    [].forEach.call(ps.options,function(o){ if(o.value===v)has=true });
    if(!has){
      var o=document.createElement('option');
      o.value=v; o.textContent=v;
      ps.insertBefore(o,ps.options[ps.options.length-1]);
    }
    ps.value=v;
  }
}
function gapEl(){ var g=document.createElement('div'); g.className='gap'; g.contentEditable='false'; return g }
function makeBlock(b,item){
  var html;
  if(item.whole||item.l0===undefined){
    html=Engine.blockHtml(b);
    var wrap=document.createElement('div');
    wrap.innerHTML=html;
    var inner=wrap.firstElementChild;
    inner.dataset.bid=b.bid;
    inner.dataset.kind=b.kind;
    if(b.level)inner.dataset.level=b.level;
    if(b.kind==='obj')inner.dataset.raw=b.text;
    return inner;
  }
  var text=item.partLines.slice(item.l0,item.l1).join('');
  var el=document.createElement('p');
  el.dataset.bid=b.bid;
  el.dataset.kind='para';
  el.dataset.l0=item.l0; el.dataset.l1=item.l1;
  if(item.l0>0)el.style.textIndent='0';  el.innerHTML=Engine.fmtH(text);
  return el;
}
function renderOutline(){
  var ol=document.getElementById('outline');
  ol.innerHTML='';
  for(var i=0;i<gNodes.length;i++){
    var n=gNodes[i];
    if(n.kind!=='heading')continue;
    (function(n){
      var d=document.createElement('div');
      d.className='outline-item lv'+n.level;
      d.textContent=Engine.displayText(n.text);
      d.onclick=function(){
        var t=document.querySelector('#display-pane [data-bid="'+n.bid+'"]');
        if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
      };
      ol.appendChild(d);
    })(n);
  }
}
function renderStatus(){
  var chars=0, labels=0;
  for(var i=0;i<gNodes.length;i++){
    if(gNodes[i].kind==='obj')continue;
    if(gNodes[i].text)chars+=Engine.displayText(gNodes[i].text).replace(/\s/g,'').length;
    if(gNodes[i].text&&gNodes[i].text.indexOf('label')>=0)labels++;
  }
  document.getElementById('st-words').textContent=chars+' 字';
  document.getElementById('st-labels').textContent='标签 '+labels;
  document.getElementById('st-page').textContent='共 '+gPages.length+' 页';
}

// 光标是否停在"空段落"上(回车产生、尚无内容的块):
// 空段是用户准备输入的位置,权威渲染不得将其收走
function emptyParaUnderCaret(){
  var b=caretBlock();
  if(!b)return false;
  if(b.dataset.kind!=='para')return false;
  var hasMedia=b.querySelector('img,[data-media]');
  if(hasMedia)return false;
  return b.textContent.replace(/\u200B/g,'').trim()==='';
}

// ═══ 块级增量刷新(真增量:O(脏段) 解析,替代全量 parse+重建)═══
// 输入暂停后:scheduleNativeRefresh → incrRefresh:
//   1. serializeSegments 取当前段列表,与 gSegCache 按位对比 → 脏段
//   2. 脏段交 daemon op=parse_blocks(引擎每段独立权威解析,与全文一致)
//   3. 段的节点数/kind 全部不变 → gNodes 原位拼接 + 逐块原位替换 DOM
//      (只有被编辑的块重渲,其余纸面 DOM 不动——光标/滚动/选中全部无扰)
//   4. 任何结构变化(段数/节点数/kind 变)或分页数变 → 返回 false 走全量
var gSegCache=[];      // [{text,start,count}] 与 gNodes 对齐(全文渲染后重建)
var incrSeq=0;         // 增量会话序号:全量 render/新增量都会使其过期

// gSrc → 段列表(与引擎 blank_run 语义一致:K 空行 → floor(K/2) 空段;
// 结尾 \n 的幻影行剪掉,与 lexer 对齐),再把 gNodes 按行基归段:
// start=段首行号(分段定位用),nodeStart=段内首节点的 gNodes 下标(拼接用)
function buildSegCache(src,nodes){
  var lines=src.split('\n');
  if(lines.length&&src.length>0&&lines[lines.length-1]==='')lines.pop();
  var isBlank=function(l){return l.trim()===''};
  var segs=[],i=0;
  while(i<lines.length){
    if(isBlank(lines[i])){
      var rs=i;
      while(i<lines.length&&isBlank(lines[i]))i++;
      var pairs=Math.floor((i-rs)/2);
      for(var j=0;j<pairs;j++)segs.push({text:'',start:rs+2*j,nodeStart:-1,count:0});
    }else{
      var st=i;
      while(i<lines.length&&!isBlank(lines[i]))i++;
      segs.push({text:lines.slice(st,i).join('\n'),start:st,nodeStart:-1,count:0});
    }
  }
  var si=0;
  for(var k=0;k<nodes.length;k++){
    var ns=nodes[k].srcStart;
    if(ns==null||ns<0)continue;
    while(si<segs.length-1&&ns>=((si+1<segs.length)?segs[si+1].start:Infinity))si++;
    if(si<segs.length){
      if(segs[si].count===0)segs[si].nodeStart=k;
      segs[si].count++;
    }
  }
  return segs;
}

// 单块原位替换:按 bid 找到元素,用新节点重渲后原地换掉。
// 跨页截断段(l0/l1)与非块元素不处理 → 返回 false 触发全量。
function replaceSegBlock(idx,node){
  var el=document.querySelector('#display-pane [data-bid="'+idx+'"]');
  if(!el||el.classList.contains('gap'))return false;
  if(el.dataset.l0!==undefined)return false;
  var nel;
  try{ nel=makeBlock(node,{whole:true}) }catch(e){ return false }
  if(!nel||nel.nodeType!==1)return false;
  nel.dataset.bid=String(idx);
  el.replaceWith(nel);
  return true;
}

// ── 字体度量宽表(A′:真实字形宽度,Rust 从字体文件提取)──
// 文档字符集(去重,上限 4000)→ 引擎二分查宽;按字体缓存
function ensureFontWidths(){
  var font=CFG.FONT||'';
  if(window.gWidths&&window.gWidths.font===font)return;
  if(window.gWidthsLoading===font)return;
  window.gWidthsLoading=font;
  var chars=[],seen={};
  for(var i=0;i<gSrc.length&&chars.length<4000;i++){
    var c=gSrc.charAt(i);
    var cc=gSrc.charCodeAt(i);
    if(cc===10||cc===13||seen[c])continue;
    seen[c]=1; chars.push(c);
  }
  if(!chars.length)return;
  Bridge.fontWidths(font||'Microsoft YaHei',chars).then(function(data){
    if(!data)return;
    window.gWidths={font:font,data:data};
    scheduleNativeRefresh(saveCaret());   // 宽表到位后刷新一轮分页
  }).catch(function(){});
}

// ── 增量排版自愈:增量解析不重分页,分页漂移由后台 relayout 修复 ──
// 编辑停顿 1.5s 后:引擎复用上一轮未变前缀只重排尾段(快),
// 页分配有变化才重建纸面(0.5s 级,带滚动/光标保持);用户继续输入则放弃
var relayoutTimer=null;
function scheduleRelayout(){
  if(relayoutTimer)clearTimeout(relayoutTimer);
  relayoutTimer=setTimeout(applyRelayout,1500);
}
function applyRelayout(){
  relayoutTimer=null;
  if(window.composing||Date.now()-(window.lastPaperInputAt||0)<800)return;
  var cfgReq=Engine.layoutCfg();
  if(window.__orient==='landscape'){var t=cfgReq.pw;cfgReq.pw=cfgReq.ph;cfgReq.ph=t}
      if(window.gWidths&&window.gWidths.font===(CFG.FONT||'')){cfgReq.widths=window.gWidths.data;cfgReq.widths.k=(window.gWidths.data.w||[]).join(',')}   // undefined 键不会写入 JSON(null 会送 daemon 崩)
  Bridge.relayout(gSrc,cfgReq,currentDocId()).then(function(res){
    if(window.composing||Date.now()-(window.lastPaperInputAt||0)<800)return;
    var newPages=Engine.layoutFromEngine(gNodes,res);
    // 对比页分配是否变化(bid 序列逐页比对)
    var changed=newPages.length!==gPages.length;
    if(!changed){
      for(var p=0;p<gPages.length&&!changed;p++){
        if(gPages[p].length!==newPages[p].length){changed=true;break}
        for(var k=0;k<gPages[p].length;k++){
          if(gPages[p][k].b.bid!==newPages[p][k].b.bid){changed=true;break}
        }
      }
    }
    gPages=newPages;
    if(changed){
      var caret=saveCaret();
      renderNodes();
      if(caret)restoreCaret(caret);
    }
    renderOutline();
    renderStatus();
  }).catch(function(){ /* relayout 失败静默,下次全量自然修正 */ });
}

// 增量刷新入口。返回 true=增量完成;false=需要全量 render。
function incrRefresh(freshCaret){
  if(!document.querySelector('#display-pane .paper'))return false;
  var sg=Engine.serializeSegments();
  var lines=sg.lines,segs=sg.segs;
  var cache=gSegCache;
  if(!cache.length||cache.length!==segs.length)return false;
  var dirty=[];
  for(var i=0;i<segs.length;i++){ if(segs[i].text!==cache[i].text)dirty.push(i) }
  if(!dirty.length)return true;
  // 空段本地合成(空段引擎解析结果为空,不进请求)
  var reqs=[],localMap={};
  dirty.forEach(function(di){
    if(segs[di].text===''){
      // 空段:span 就是空行对,节点本地合成(引擎对空文本返回空 blocks)
      localMap[di]=[{kind:'para',level:0,srcStart:segs[di].l0,srcEnd:segs[di].l1,text:'',lang:''}];
    }else reqs.push({bid:String(di),text:segs[di].text});
  });
  var seq=++incrSeq;
  var finish=function(map){
    if(seq!==incrSeq)return false;
    var caret=saveCaret();
    var ops=[];
    for(var d=0;d<dirty.length;d++){
      var di=dirty[d],nodes=map[di],c=cache[di];
      if(!c||!nodes||nodes.length!==c.count||c.nodeStart<0)return false;
      for(var k=0;k<nodes.length;k++){
        if(nodes[k].kind!==gNodes[c.nodeStart+k].kind)return false;
      }
      ops.push({start:c.nodeStart,nodes:nodes});
    }
    for(var o=ops.length-1;o>=0;o--){
      [].splice.apply(gNodes,[ops[o].start,ops[o].nodes.length].concat(ops[o].nodes));
    }
    // 提交后推进缓存,避免下个空闲周期重复解析同一段
    for(var d2=0;d2<dirty.length;d2++){cache[dirty[d2]].text=segs[dirty[d2]].text}
    scheduleRelayout();   // 分页自愈:增量解析后后台重排(引擎增量,用户无感)
    for(var o2=0;o2<ops.length;o2++){
      for(var k2=0;k2<ops[o2].nodes.length;k2++){
        if(!replaceSegBlock(ops[o2].start+k2,ops[o2].nodes[k2]))return false;
      }
    }
    // 分页权威在引擎:文本级编辑不重分页(页数变化待下次全量刷新自然修正)
    renderOutline();
    renderStatus();
    if(caret)restoreCaret(caret);
    return true;
  };
  if(!reqs.length){
    return finish(localMap);
  }
  Bridge.parseBlocks(reqs).then(function(res){
    var map=localMap;
    (res&&res.nodes||[]).forEach(function(n){
      var di=+n.bid;
      if(!segs[di])return;
      map[di]=Engine.segRecsToNodes(n.res&&n.res.blocks||[],segs[di].l0);
    });
    if(!finish(map))render(gSrc);
  }).catch(function(){
    render(gSrc);
  });
  return true;
}
