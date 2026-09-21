function fname(ext){
  var e=document.getElementById('export-name');
  var d=document.getElementById('docname');
  var n=(e&&e.value.trim())?e.value.trim():(d.value||'未命名文档');
  n=n.replace(/[\\/:*?"<>|]/g,'_').replace(/\.(awen|txt|md|html?|docx?)$/i,'');
  return n+'.'+ext;
}

function saveWithPicker(name,content){
  Bridge.saveDialog(name,content).then(function(r){ if(r.saved)markClean() });
}

function markClean(){
  docDirty=false;
  if(activeFile>=0&&openFiles[activeFile])openFiles[activeFile].dirty=false;
  clearAutosave();          // 已落盘,草稿快照不再需要
  updateTitle();
  renderFileTabs();
}

function updateTitle(src){
  var inp=document.getElementById('docname');
  var en=document.getElementById('export-name');
  var n=inp.value||'未命名文档';
  var dm=document.getElementById('dirty-mark');
  if(dm)dm.style.display=docDirty?'inline':'none';
  if(src!=='docname'&&document.activeElement!==inp)inp.value=n;
  if(src!=='export'&&en&&document.activeElement!==en){
    en.value=n.replace(/\.[a-z0-9]+$/i,'');
  }
}

function doSave(){
  var content=buildAwenHeader()+gSrc;
  if(currentFilePath){
    Bridge.savePath(currentFilePath,content).then(function(ok){ if(ok)markClean(); else doSaveDialog(); });
  }else doSaveDialog();
}

function doSaveDialog(){
  Bridge.saveDialog(fname('awen'),buildAwenHeader()+gSrc).then(function(r){
    if(r.saved){ if(r.path)currentFilePath=r.path; markClean() }
  });
}

function doSaveAs(){ currentFilePath=null; doSaveDialog(); }

function buildAwenHeader(){
  var n=gNodes.length;
  return '# awen v0.4\n# nodes: '+n+'\n# next_id: '+(n+1)+'\n# res: 0\n# ---\n';
}

function newDoc(){
  if(docDirty&&!window.confirm('当前文档未保存,确定新建?'))return;
  // 多文件模型:新建=新标签;当前已是干净空白文档则复用
  var cur=openFiles[activeFile];
  if(cur&&cur.name==='未命名文档'&&!docDirty){
    document.getElementById('docname').value='未命名文档';
    setSrc('# 未命名文档\n\n');
    markClean();
    return;
  }
  if(activeFile>=0){
    applySyncNow();
    openFiles[activeFile].src=gSrc;
    openFiles[activeFile].dirty=docDirty;
  }
  document.getElementById('docname').value='未命名文档';
  setSrc('# 未命名文档\n\n');
  addFileTab('未命名文档');
  markClean();
}

function openDocument(res){
  var name=res.name.replace(/\.(awen(\.txt)?|txt|md|markdown)$/i,'');
  var reuse=false;
  if(activeFile>=0){
    applySyncNow();
    var cur=openFiles[activeFile];
    reuse=(cur.name==='未命名文档'&&!docDirty);
    if(!reuse){ cur.src=gSrc; cur.dirty=docDirty }
  }
  document.getElementById('docname').value=name;
  setSrc(res.src);
  if(reuse){
    openFiles[activeFile]={name:name,src:gSrc,dirty:false,path:res.path||null};
    renderFileTabs();
  }else{
    addFileTab(name,res.path||null);
  }
  currentFilePath=res.path||null;
  updateTitle();
  markClean();
  pushRecentFile(name,res.path||null);
  adoptNativeBlocks();
}

function openFileClick(){
  Bridge.openDialog().then(function(res){ if(res)openDocument(res); });
}
