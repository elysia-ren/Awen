function render(src){
  gSrc=src;
  gNodes=Engine.parse(src);
  Engine.applyDocsets(gNodes);   // 文档级 @[page/margin/...] 设置生效(源码即权威)
  CFG=Engine.getConfig();
  gPages=Engine.layoutPages(gNodes);
  renderNodes();
}

function renderKeep(){
  gPages=Engine.layoutPages(gNodes);
  renderNodes();
}

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
        var d=document.createElement('div'); d.className='docset'; d.contentEditable='false'; d.textContent=b.text;
        paper.appendChild(d);
        paper.appendChild(gapEl()); continue;
      }
      if(b.kind==='comment'){
        var cm=document.createElement('div'); cm.className='comment-src'; cm.contentEditable='false';
        cm.textContent=b.text; cm.dataset.raw=b.text;
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

function nodeByBid(bid){
  for(var i=0;i<gNodes.length;i++){ if(gNodes[i].bid==bid)return gNodes[i] }
  return null;
}
