// 入口:初始化(图标注入/草稿恢复/初渲染/多文件/打开转发)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 初始化 ═══
(function init(){
  document.querySelectorAll('[data-icon]').forEach(function(el){
    el.innerHTML=ICONS[el.dataset.icon]||'';
  });
  var src=DEFAULT_SRC;
  // 崩溃恢复:存在自动保存草稿则直接恢复
  var auto=loadAutosave();
  if(auto&&typeof auto.src==='string'&&auto.src.trim()!==''){
    src=auto.src;
    if(auto.name)document.getElementById('docname').value=auto.name;
    setTimeout(function(){
      var d=document.getElementById('diagpop');
      if(!d)return;
      d.innerHTML='<div style="display:flex;gap:8px;align-items:center"><span style="color:#8a6d1a">检测到未保存的草稿已恢复</span>'
        +'<button class="sbtn" style="height:22px" onclick="discardAutosaveDraft();document.getElementById(\'diagpop\').style.display=\'none\'">放弃草稿</button>'
        +'<button class="sbtn" style="height:22px" onclick="document.getElementById(\'diagpop\').style.display=\'none\'">继续</button></div>';
      d.style.display='block';
      setTimeout(function(){ if(d.dataset.kind!=='labels')d.style.display='none' },8000);
    },600);
  }

  buildSyntaxPane();
  setSrc(src);
  // 多文件模型:启动即有一个空白(或注入)文档标签
  addFileTab('未命名文档');
  if(gSrc.indexOf('@[first-line')>=0){ var b=document.getElementById('btn-firstline'); if(b)b.classList.add('on') }
  markClean(); updateUndoButtons(); updateDiagBar(); updateCaretPos();
  document.getElementById('docname').addEventListener('input',function(){updateTitle('docname')});
  var en=document.getElementById('export-name');
  if(en)en.addEventListener('input',function(){
    updateTitle('export');
    var dn=document.getElementById('docname');
    if(document.activeElement===en&&en.value.trim())dn.value=en.value.trim();
  });
  // 仅桌面版:非 Tauri 环境显示阻断层
  if(!Bridge.native){
    document.body.innerHTML='<div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--sans);color:#5a5c60">'
      +'<div style="font-size:20px;font-weight:700;color:#1a1c1f;margin-bottom:10px">Awen 编辑器</div>'
      +'<div>请在 Awen 桌面版中编辑文档。</div>'
      +'</div>';
    return;
  }
  // 单实例/命令行转发的打开请求:先拉启动参数暂存,再监听后续转发
  function openByPath(path){ Bridge.openPath(path).then(function(res){ if(res)openDocument(res) }) }
  Bridge.takePendingPaths().then(function(paths){ (paths||[]).forEach(openByPath) });
  Bridge.listenOpenPath(openByPath);
})();
