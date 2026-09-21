// 撤销/重做历史与 setSrc 主入口(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 撤销/重做 ═══
var hist=[],histIdx=-1,histTime=0;
var docDirty=false;
// 语义步撤销:窗口(<500ms)内的连续输入覆写栈顶;第一笔与新语义步压栈(基线保留在
// hist[histIdx] 不被覆写)——修复"撤销第一步无效/粒度不可预期"。标点由 onPaperInput
// 置 histTime=0 强制成步。
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
  // render 异步(Bridge.parse):撤销精确恢复历史源码,不做纸面序列化规范化——
  // 规范化读到的还是旧 DOM,会反向 render(旧内容)把撤销顶掉
  render(text,caret);
  updateDiagBar();
  updateUndoButtons();
  document.getElementById('st-diag').title='历史 '+histIdx+'/'+(hist.length-1);
}
function setSrc(s,caret){
  var ta=document.getElementById('syntax-src');
  if(ta)ta.value=s;
  recordHist(s,false);
  render(s,caret);
  scheduleAutosave();
}
