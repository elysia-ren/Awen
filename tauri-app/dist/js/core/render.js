// 渲染:每张 A4 纸一个整体可编辑区(render 走 Bridge.parse 权威解析)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 渲染:每张 A4 纸一个整体可编辑区(原生 Enter/Delete)═══
var gSrc='', gPages=[], gNodes=[];
// 渲染入口(异步):源码 → Aine 权威解析 → ingest → 分页 → DOM
// seq 防过期:新请求发出后,旧响应丢弃
var renderSeq=0;
// renderPending=true 表示权威渲染在途,纸面 DOM 还是旧结构——
// 期间 serializeAll 只会拿到旧内容,applySyncNow 必须推迟而不是覆盖 gSrc
var renderPending=false;
function render(src,caret,done){
  gSrc=src;
  renderPending=true;
  var seq=++renderSeq;
  Bridge.parse(src).then(function(res){
    if(seq!==renderSeq)return;
    // 纸面有未落盘的编辑(节流定时器挂着):放弃本次重建,避免权威结果
    // 把 DOM 里的新编辑抹掉——待处理编辑落盘后会自行再触发渲染。
    // pending 标志必须清掉:本次请求已结束,否则后续 flush 永远误判"在途"
    // 打字会话进行中(800ms 内有纸面输入):绝不重建——重建会把光标恢复到
    // 旧快照位置,后续输入错位(用户看到的"输入回退")
    if(repagTimer||refreshTimer||Date.now()-(window.lastPaperInputAt||0)<800){
      renderPending=false;
      return;
    }
    renderPending=false;
    gNodes=Engine.ingestNative(res.blocks||[],gSrc);
    Engine.applyDocsets(gNodes);   // 文档级 @[page/margin/...] 设置生效(源码即权威)
    CFG=Engine.getConfig();
    gPages=Engine.layoutPages(gNodes);
    renderNodes();
    nativeDiags={src:gSrc,ds:res.diags||[]};
    updateDiagBar();
    if(caret)restoreCaret(caret);
    if(done)done();
  }).catch(function(e){
    renderPending=false;
    document.getElementById('st-diag').textContent='解析失败';
    console.error(e);
  });
}
// 只重排+重渲(不重新解析/不重应用文档设置)——横向等会话级覆盖用
function renderKeep(){
  gPages=Engine.layoutPages(gNodes);
  renderNodes();
}
// 用现有 gNodes/gPages 重建纸面 DOM(本地解析与原生权威解析共用出口)
function renderNodes(){
  var pane=document.getElementById('display-pane');
  pane.innerHTML='';
  for(var p=0;p<gPages.length;p++){
    var sheet=document.createElement('div');
    sheet.className='sheet';
    sheet.style.width=CFG.PAGE_W+'mm';
    sheet.style.minHeight=CFG.PAGE_H+'mm';
    sheet.style.padding=CFG.MARGIN+'mm';
    var paper=document.createElement('div');
    paper.className='paper';
    paper.contentEditable='true';
    paper.style.lineHeight=CFG.LINE_H;
    if(CFG.FONT)paper.style.fontFamily='\''+CFG.FONT+'\',serif';
    paper.style.setProperty('--fl',CFG.FIRSTLINE||'0em');
    paper.style.setProperty('--ps',CFG.PARA_SPACING||'0em');
    paper.dataset.page=p;
    for(var k=0;k<gPages[p].length;k++){
      var item=gPages[p][k], b=item.b;
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
    var folio=document.createElement('div');
    folio.className='folio'; folio.contentEditable='false'; folio.textContent='— '+(p+1)+' —';
    sheet.appendChild(paper); sheet.appendChild(folio);
    pane.appendChild(sheet);
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
