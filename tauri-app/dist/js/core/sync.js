function onPaperInput(e){
  if(repagTimer)clearTimeout(repagTimer);
  // 标点成步:句末标点立即落一步,且下一笔必开新语义步
  var punct=e&&e.data&&/[。？！，、；：.?!]/.test(e.data.slice(-1));
  if(punct){ applySyncNow(); histTime=0; return }
  repagTimer=setTimeout(applySyncNow,300);
}

function applySyncNow(){
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
  if(lastEditSource==='syntax'||currentMode==='syntax'){
    // 语法视图/语法侧编辑:输入框即源码权威(§85),不再从纸面 DOM 反写
    var ta=document.getElementById('syntax-src');
    var taVal=ta?ta.value:'';
    if(taVal===gSrc)return;
    gSrc=taVal;
    if(currentMode==='split')render(gSrc);
    updateDiagBar();
    scheduleNativeDiags();
    return;
  }
  // 纸面编辑:DOM 序列化回写(含跨页片段合并)
  var newSrc=Engine.serializeAll();
  if(newSrc===gSrc)return;
  gSrc=newSrc;
  var ta=document.getElementById('syntax-src');
  if(ta)ta.value=gSrc;
  recordHist(gSrc,true);
  var caret=saveCaret();
  var before=gPages.length+'|'+gPages.map(function(p){return p.length?p[0].b.bid:-1}).join(',');
  gNodes=Engine.parse(gSrc);
  Engine.applyDocsets(gNodes);
  CFG=Engine.getConfig();
  gPages=Engine.layoutPages(gNodes);
  var after=gPages.length+'|'+gPages.map(function(p){return p.length?p[0].b.bid:-1}).join(',');
  if(before!==after){ renderNodes(); restoreCaret(caret) }
  else { renderOutline(); renderStatus() }
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
  render(lines.join('\n'));
  restoreCaret(caret);
  recordHist(gSrc,false);
}

document.getElementById('display-pane').addEventListener('input',function(e){
  lastEditSource='paper';
  onPaperInput(e);
});
