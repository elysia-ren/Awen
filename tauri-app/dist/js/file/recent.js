// 最近文件(localStorage;桌面版带路径可直开)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 最近文件(localStorage;桌面版带路径可直开,浏览器版仅记录名称)═══
function getRecent(){
  try{
    var l=JSON.parse(localStorage.getItem('awen-recent-files')||'[]');
    if(Array.isArray(l))return l;
  }catch(e){}
  return [];
}
function pushRecentFile(name,path){
  var list=getRecent().filter(function(x){return x.path?x.path!==path:x.name!==name});
  list.unshift({name:name,path:path||null,time:Date.now()});
  if(list.length>10)list=list.slice(0,10);
  try{localStorage.setItem('awen-recent-files',JSON.stringify(list))}catch(e){}
}
function renderRecentList(){
  var el=document.getElementById('recent-list');
  if(!el)return;
  var list=getRecent();
  el.innerHTML='';
  if(!list.length){
    el.innerHTML='<span style="color:#9aa0a6;font-size:12px">暂无</span>';
    return;
  }
  list.forEach(function(f){
    var d=document.createElement('div');
    d.className='recent-item';
    d.textContent=f.name;
    d.title=(f.path||f.name)+(f.path?'':'（浏览器版仅记录名称,点击重新选择文件）');
    if(!f.path){
      d.style.color='#9aa0a6';
      d.style.fontStyle='italic';
    }
    d.onclick=function(){
      if(f.path&&Bridge.native) Bridge.openPath(f.path).then(function(res){ if(res)openDocument(res) });
      else openFileClick();
    };
    el.appendChild(d);
  });
}
