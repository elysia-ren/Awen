// 多文件标签管理(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 多文件管理 ═══
var openFiles=[];
var activeFile=-1;
function renderFileTabs(){
  var bar=document.getElementById('filetabs');
  bar.innerHTML='';
  openFiles.forEach(function(f,i){
    var t=document.createElement('div');
    t.className='ftab'+(i===activeFile?' active':'')+(f.dirty?' dirty':'');
    t.title=f.name+'（中键或 ✕ 关闭）';
    t.innerHTML='<span class="fdirty"></span><span>'+f.name.replace(/</g,'&lt;')+'</span><span class="fclose" data-i="'+i+'">✕</span>';
    t.onclick=function(ev){
      if(ev.target.classList.contains('fclose')){closeFile(i);return}
      switchFile(i);
    };
    t.onauxclick=function(ev){ if(ev.button===1)closeFile(i) };   // 中键关闭
    t.ondblclick=function(ev){
      if(ev.target.classList.contains('fclose'))return;
      var n=window.prompt('修改文档名',openFiles[i].name);
      if(n&&n.trim()){ openFiles[i].name=n.trim(); document.getElementById('docname').value=n.trim(); updateTitle(); renderFileTabs() }
    };
    bar.appendChild(t);
  });
}
function switchFile(i){
  if(i===activeFile||!openFiles[i])return;
  applySyncNow();
  if(activeFile>=0){
    openFiles[activeFile].src=gSrc;
    openFiles[activeFile].dirty=docDirty;
  }
  activeFile=i;
  var f=openFiles[i];
  currentFilePath=f.path||null;
  // 每个文档自己的包内媒体目录(media/ 引用按此解析)
  window.awenMediaDir=f.media_dir||'';
  document.getElementById('docname').value=f.name;
  setSrc(f.src);
  docDirty=f.dirty;
  // 撤销栈按文件隔离:切换后从当前内容重开历史,避免跨文件串档
  hist=[f.src]; histIdx=0; histTime=0;
  updateUndoButtons();
  updateTitle();
  renderFileTabs();
}
function closeFile(i){
  if(openFiles[i].dirty&&!window.confirm('「'+openFiles[i].name+'」未保存,确定关闭?'))return;
  openFiles.splice(i,1);
  if(activeFile>=i)activeFile--;
  if(activeFile<0)activeFile=0;
  if(activeFile>=openFiles.length)activeFile=openFiles.length-1;
  if(!openFiles.length){ newDoc(); return }
  var f=openFiles[activeFile];
  currentFilePath=f.path||null;
  document.getElementById('docname').value=f.name;
  setSrc(f.src);
  docDirty=f.dirty;
  updateTitle();
  renderFileTabs();
}
function addFileTab(name,path){
  openFiles.push({name:name,src:gSrc,dirty:docDirty,path:path||null});
  activeFile=openFiles.length-1;
  renderFileTabs();
}
