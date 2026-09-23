// 编辑同步入口:纸面输入 → 序列化 → 节流权威解析;键盘块级操作(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 编辑同步:输入 → 序列化 → 必要时重排 ═══
var repagTimer=null,lastEditSource=null;
// 中文输入法组合期间:挂起序列化与权威重建——组合中间态(拼音串)一旦
// 进入源码并触发纸面重建,会把输入法正在组词的文本拦腰清掉(用户看到的
// "输入回退")。compositionend 后再走正常节流同步。
var composing=false;
document.addEventListener('compositionstart',function(){
  composing=true;
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
});
document.addEventListener('compositionend',function(){
  composing=false;
  window.lastPaperInputAt=Date.now();
});
function onPaperInput(e){
  window.lastPaperInputAt=Date.now();
  if(composing)return;   // 组合中间态不进源码
  if(repagTimer)clearTimeout(repagTimer);
  // 标点成步:句末标点立即落一步,且下一笔必开新语义步
  var punct=e&&e.data&&/[。？！，、；：.?!]/.test(e.data.slice(-1));
  if(punct){ applySyncNow(); histTime=0; return }
  repagTimer=setTimeout(applySyncNow,300);
}
function swapSplit(){
  var ws=document.querySelector('.workspace');
  var dp=document.getElementById('display-pane');
  var sp=document.getElementById('syntax-pane');
  var st=document.getElementById('splitter');
  if(!dp||!sp||!ws)return;
  // 语法窗格当前在显示窗格之前 → 换回显示在前;否则换语法在前
  if(sp.compareDocumentPosition(dp)&Node.DOCUMENT_POSITION_FOLLOWING){
    ws.insertBefore(dp,sp);
    if(st)ws.insertBefore(st,sp);
  }else{
    ws.insertBefore(sp,dp);
    if(st)ws.insertBefore(st,dp);
  }
}

function onPaperKey(e){
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='b'){ e.preventDefault(); fmtCmd('bold'); return }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='i'){ e.preventDefault(); fmtCmd('italic'); return }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='u'){ e.preventDefault(); fmtCmd('underline'); return }
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){ e.preventDefault(); doSave(); return }
  if(e.key==='Enter'&&e.target.closest&&e.target.closest('table')){ e.preventDefault(); return }
  // 普通段落内的回车:手动拆块,不交给浏览器——浏览器拆分会克隆整块 DOM
  // (包括 data-bid),产生重复 bid;后续光标按旧 bid 恢复会跳回前一段,
  // 用户看到的就是"回车换行后输入回退"
  if(e.key==='Enter'&&!e.shiftKey&&e.target.closest&&e.target.closest('#display-pane .paper')){
    e.preventDefault();
    var sel=window.getSelection();
    if(!sel.rangeCount)return;
    var r0=sel.getRangeAt(0);
    var curBlk=r0.startContainer.nodeType===1
      ?(r0.startContainer.closest?r0.startContainer.closest('#display-pane [data-bid]'):null)
      :(r0.startContainer.parentElement?r0.startContainer.parentElement.closest('#display-pane [data-bid]'):null);
    if(!curBlk)return;
    var r=sel.getRangeAt(0).cloneRange();
    if(!r.collapsed)r.deleteContents();
    var tailFrag=r.cloneContents();
    var maxBid=0;
    document.querySelectorAll('#display-pane [data-bid]').forEach(function(x){maxBid=Math.max(maxBid,+x.dataset.bid||0)});
    var newB=document.createElement('p');
    newB.contentEditable='true';
    while(tailFrag.firstChild)newB.appendChild(tailFrag.firstChild);
    if(!newB.firstChild)newB.appendChild(document.createTextNode(''));
    newB.dataset.bid=String(maxBid+1);
    newB.dataset.kind='para';
    var gap=curBlk.nextElementSibling;
    if(!(gap&&gap.classList.contains('gap'))){
      gap=document.createElement('div'); gap.className='gap'; gap.contentEditable='false';
      curBlk.parentNode.insertBefore(gap,curBlk.nextSibling);
    }
    gap.parentNode.insertBefore(newB,gap.nextSibling);
    var nr=document.createRange();nr.setStart(newB,0);nr.collapse(true);
    sel.removeAllRanges();sel.addRange(nr);
    onPaperInput();
    return;
  }
  if(e.key==='Backspace'){
    var c=saveCaret();
    if(c&&c.off===0){
      var el=document.querySelector('#display-pane [data-bid="'+c.bid+'"]');
      var paper=el&&el.closest('.paper');
      if(paper){
        var first=paper.querySelector('[data-bid]');
        if(first===el&&+c.bid>0){
          var prev=nodeByBid(+c.bid-1);
          if(prev&&prev.kind!=='table'&&prev.kind!=='obj'){ e.preventDefault(); mergeBlocks(+c.bid-1,+c.bid) }
        }
      }
    }
  }
  else if(e.key==='Delete'){
    var c2=saveCaret();
    if(c2){
      var el2=document.querySelector('#display-pane [data-bid="'+c2.bid+'"]');
      var paper2=el2&&el2.closest('.paper');
      if(paper2){
        var blocks=paper2.querySelectorAll('[data-bid]');
        var lastEl=blocks[blocks.length-1];
        var len=textLen(lastEl);
        if(lastEl===el2&&c2.off>=len){
          var next=nodeByBid(+c2.bid+1);
          if(next&&next.kind!=='table'&&next.kind!=='obj'){ e.preventDefault(); mergeBlocks(+c2.bid,+c2.bid+1) }
        }
      }
    }
  }
}
function textLen(el){ return (el.textContent||'').length }
function nodeByBid(bid){
  for(var i=0;i<gNodes.length;i++){ if(gNodes[i].bid==bid)return gNodes[i] }
  return null;
}
function mergeBlocks(keepBid,goneBid){
  var keep=nodeByBid(keepBid), gone=nodeByBid(goneBid);
  if(!keep||!gone)return;
  var keepEl=document.querySelector('#display-pane [data-bid="'+keepBid+'"]');
  var goneEl=document.querySelector('#display-pane [data-bid="'+goneBid+'"]');
  var keepText=keepEl?Engine.inlineSource(keepEl).trim():Engine.displayText(keep.text);
  var goneText=goneEl?Engine.inlineSource(goneEl).trim():Engine.displayText(gone.text);
  var junction=keepText.length;
  var lines=gSrc.split('\n');
  var mergedLine=Engine.blockPrefix(keep.kind,keep.level)+(keepText+' '+goneText).replace(/\s+/g,' ').trim();
  lines.splice(keep.srcStart,gone.srcEnd-keep.srcStart,mergedLine);
  var caret={bid:keepBid,off:junction+1};
  // render 异步:光标经 caret 参数在权威解析回调里恢复(同步 restoreCaret 会扑空)
  render(lines.join('\n'),caret);
  recordHist(gSrc,false);
}
