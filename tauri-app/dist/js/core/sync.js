// 编辑同步入口:纸面输入 → 序列化 → 节流权威解析;键盘块级操作(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 编辑同步:输入 → 序列化 → 必要时重排 ═══
var repagTimer=null,lastEditSource=null;
function onPaperInput(e){
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
