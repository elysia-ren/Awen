function recordHist(text,merge){
  var now=Date.now();
  if(merge&&histIdx>=0&&histIdx===hist.length-1&&now-histTime<500){
    hist[histIdx]=text; histTime=now; markDirty(); return
  }
  hist=hist.slice(0,histIdx+1);
  hist.push(text);
  if(hist.length>300)hist.shift();
  histIdx=hist.length-1;
  histTime=now;
  markDirty();
}

function markDirty(){
  docDirty=true;
  updateTitle();
  updateUndoButtons();
  updateDiagBar();
  scheduleNativeDiags();
}

function updateUndoButtons(){
  document.querySelectorAll('button[onclick="doUndo()"]').forEach(function(b){b.disabled=histIdx<=0});
  document.querySelectorAll('button[onclick="doRedo()"]').forEach(function(b){b.disabled=histIdx>=hist.length-1});
}

function doUndo(){
  applySyncNow();
  if(histIdx<=0)return;
  histIdx--;
  applyHistory(hist[histIdx]);
}

function doRedo(){
  applySyncNow();
  if(histIdx>=hist.length-1)return;
  histIdx++;
  applyHistory(hist[histIdx]);
}

function applyHistory(text){
  var caret=saveCaret();
  var ta=document.getElementById('syntax-src');
  if(ta)ta.value=text;
  render(text);
  // 与 setSrc 相同的序列化规范化(但 undo 不入史)
  var norm=Engine.serializeAll();
  if(norm!==gSrc){ render(norm); }
  restoreCaret(caret);
  updateDiagBar();
  updateUndoButtons();
  document.getElementById('st-diag').title='历史 '+histIdx+'/'+(hist.length-1);
}
