// 自动保存/崩溃恢复(localStorage 快照)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 自动保存/崩溃恢复(localStorage 快照)═══
var autosaveTimer=null;
function scheduleAutosave(){
  try{ if(localStorage.getItem('awen-set-autosave')==='off')return }catch(e){}
  if(autosaveTimer)clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(doAutosave,2000);
}
function doAutosave(){
  try{
    localStorage.setItem('awen-autosave',JSON.stringify({
      name:document.getElementById('docname').value||'未命名文档',
      src:gSrc,time:Date.now(),
      media_dir:window.awenMediaDir||null
    }));
  }catch(e){}
}
function loadAutosave(){
  try{ return JSON.parse(localStorage.getItem('awen-autosave')||'null') }catch(e){ return null }
}
function clearAutosave(){ try{localStorage.removeItem('awen-autosave')}catch(e){} }
// 恢复草稿时连同媒体目录一起恢复,否则 media/ 引用失去基址全部破图
function restoreAutosaveMedia(media_dir){
  if(!media_dir)return;
  window.awenMediaDir=media_dir;
  if(activeFile>=0&&openFiles[activeFile])openFiles[activeFile].media_dir=media_dir;
}
function discardAutosaveDraft(){
  clearAutosave();
  document.getElementById('docname').value='未命名文档';
  setSrc('# 未命名文档\n\n');
  markClean();
}
