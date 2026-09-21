// 自动保存/崩溃恢复(localStorage 快照)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 自动保存/崩溃恢复(localStorage 快照)═══
var autosaveTimer=null;
function scheduleAutosave(){
  if(autosaveTimer)clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(doAutosave,2000);
}
function doAutosave(){
  try{
    localStorage.setItem('awen-autosave',JSON.stringify({
      name:document.getElementById('docname').value||'未命名文档',
      src:gSrc,time:Date.now()
    }));
  }catch(e){}
}
function loadAutosave(){
  try{ return JSON.parse(localStorage.getItem('awen-autosave')||'null') }catch(e){ return null }
}
function clearAutosave(){ try{localStorage.removeItem('awen-autosave')}catch(e){} }
function discardAutosaveDraft(){
  clearAutosave();
  document.getElementById('docname').value='未命名文档';
  setSrc('# 未命名文档\n\n');
  markClean();
}
