// 视图:语法视图 / 模式与缩放 / 专注模式 / 全局快捷键 / 大纲跟随(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 语法视图(同一 A4 纸张几何)═══
function buildSyntaxPane(){
  if(document.getElementById('syntax-src'))return;
  var pane=document.getElementById('syntax-pane');
  var sheet=document.createElement('div');
  sheet.className='sheet';
  var src=document.createElement('div');
  src.className='src-wrap';
  var gutter=document.createElement('div');
  gutter.id='gutter'; gutter.className='gutter';
  var ta=document.createElement('textarea');
  ta.id='syntax-src'; ta.spellcheck=false;
  ta.style.cssText='flex:1;height:'+(CFG.PAGE_H-2*CFG.MARGIN-2)+'mm;border:0;outline:0;resize:none;background:transparent;font:inherit;color:inherit;white-space:pre;overflow:auto';
  src.appendChild(gutter);
  src.appendChild(ta);
  sheet.appendChild(src);
  pane.appendChild(sheet);
  // 分屏拖拽分隔条(插在两窗格之间)
  var ws=document.querySelector('.workspace');
  var dp=document.getElementById('display-pane');
  var splitter=document.createElement('div');
  splitter.id='splitter'; splitter.className='splitter'; splitter.style.display='none';
  ws.insertBefore(splitter, pane);
  splitter.addEventListener('mousedown',function(e){
    e.preventDefault();
    var move=function(ev){
      var rect=ws.getBoundingClientRect();
      var pct=Math.min(85,Math.max(15,((ev.clientX-rect.left)/rect.width)*100));
      if(dp.nextElementSibling===pane){ dp.style.flex='1 1 auto'; pane.style.flex='0 0 '+(100-pct)+'%' }
      else{ dp.style.flex='1 1 auto'; pane.style.flex='0 0 '+pct+'%' }
    };
    var up=function(){ document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up) };
    document.addEventListener('mousemove',move);
    document.addEventListener('mouseup',up);
  });
  ta.addEventListener('scroll',function(){
    gutter.scrollTop=ta.scrollTop;
    if(!window.scrollSyncLock&&currentMode==='split'){
      window.scrollSyncLock='ta';
      var pane=document.getElementById('display-pane');
      var ratio=ta.scrollTop/Math.max(1,ta.scrollHeight-ta.clientHeight);
      pane.scrollTop=ratio*Math.max(1,pane.scrollHeight-pane.clientHeight);
      setTimeout(function(){window.scrollSyncLock=null},50);
    }
  });
  document.getElementById('display-pane').addEventListener('scroll',function(){
    if(currentMode!=='split'||window.scrollSyncLock)return;
    window.scrollSyncLock='dp';
    var ta2=document.getElementById('syntax-src');
    if(!ta2)return;
    var pane2=document.getElementById('display-pane');
    var ratio=pane2.scrollTop/Math.max(1,pane2.scrollHeight-pane2.clientHeight);
    ta2.scrollTop=ratio*Math.max(1,ta2.scrollHeight-ta2.clientHeight);
    gutter.scrollTop=ta2.scrollTop;
    setTimeout(function(){window.scrollSyncLock=null},50);
  });
  ta.addEventListener('input',function(){
    lastEditSource='syntax';
    recordHist(ta.value,true);
    setGutterCur(caretLineNumber());
    if(repagTimer)clearTimeout(repagTimer);
    repagTimer=setTimeout(applySyncNow,300);
  });
  // 光标移动跟随行高亮
  ['keyup','click'].forEach(function(ev){
    ta.addEventListener(ev,function(){ setGutterCur(caretLineNumber()) });
  });
}
function insertSyntax(text){
  var ta=document.getElementById('syntax-src');
  if(!ta)return;
  var s=ta.selectionStart;
  ta.value=ta.value.substring(0,s)+text+ta.value.substring(ta.selectionEnd);
  ta.selectionStart=ta.selectionEnd=s+text.length;
  ta.focus();
  setSrc(ta.value);
}
function wrapSyntax(open,close){
  var ta=document.getElementById('syntax-src');
  if(!ta)return;
  var s=ta.selectionStart,e=ta.selectionEnd;
  var sel=ta.value.substring(s,e)||'文本';
  ta.focus();
  ta.value=ta.value.substring(0,s)+open+sel+close+ta.value.substring(e);
  ta.selectionStart=s+open.length;
  ta.selectionEnd=s+open.length+sel.length;
  setSrc(ta.value);
}

// ═══ 视图切换 ═══
var modeBtns=document.querySelectorAll('.view-tabs button');
var currentMode='display';
for(var i=0;i<modeBtns.length;i++){
  (function(b){b.addEventListener('click',function(){setMode(b.dataset.mode)})})(modeBtns[i]);
}
function setMode(mode){
  currentMode=mode;
  for(var i=0;i<modeBtns.length;i++)modeBtns[i].classList.toggle('active',modeBtns[i].dataset.mode===mode);
  var dp=document.getElementById('display-pane');
  var sp=document.getElementById('syntax-pane');
  var st=document.getElementById('splitter');
  buildSyntaxPane();
  if(mode==='syntax'){ dp.style.display='none'; dp.style.flex='none'; sp.style.display='flex'; sp.style.flex='1 1 auto' }
  else if(mode==='split'){ dp.style.display='flex'; dp.style.flex='1 1 50%'; sp.style.display='flex'; sp.style.flex='1 1 50%' }
  else{ dp.style.display='flex'; dp.style.flex='1 1 auto'; sp.style.display='none' }
  if(st)st.style.display=(mode==='split')?'block':'none';
  var ta=document.getElementById('syntax-src');
  if(ta)ta.value=gSrc;
  // 视图页模式按钮激活态
  ['display','syntax','split'].forEach(function(m){
    var b=document.getElementById('vb-'+m);
    if(b)b.classList.toggle('on',mode===m);
  });
  // 从语法切回显示/分屏时,按最新源码刷新显示窗格
  if(mode!=='syntax')render(gSrc);
  applyZoom(document.getElementById('sel-zoom').value);
}
function fitZoom(base){
  var v=parseFloat(base)||1;
  if(currentMode==='split'){
    var w=document.getElementById('display-pane').clientWidth;
    v*=Math.min(1,(w-48)/840);
  }
  return v;
}
// 双缩放控件(状态栏+视图页)同步;自定义动态档位两边都补
function syncZoomSelects(v){
  ['sel-zoom','sel-zoom-view'].forEach(function(id){
    var sel=document.getElementById(id);
    if(!sel)return;
    var has=[].some.call(sel.options,function(o){return o.value===v});
    if(!has){
      var o=document.createElement('option');
      o.value=v; o.textContent=Math.round(parseFloat(v)*100)+'%';
      sel.insertBefore(o,sel.querySelector('option[value="custom"]'));
    }
    sel.value=v;
  });
}
function applyZoom(v){
  if(v==='custom'){
    var inp=document.getElementById('zoom-custom');
    inp.style.display='inline-block'; inp.focus();
    return;
  }
  ['zoom-custom','zoom-view-custom'].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp)inp.style.display='none';
  });
  var z=fitZoom(v);
  document.getElementById('display-pane').style.zoom=z;
  document.getElementById('syntax-pane').style.zoom=z;
  syncZoomSelects(v);
}
// 自定义缩放百分比:30-300;which=发起控件(其自定义输入框收起,另一控件联动)
function applyZoomCustom(v,which){
  var x=parseFloat(v);
  if(!(x>=30&&x<=300))return;
  var val=String(Math.round(x)/100);
  var otherInp=document.getElementById(which==='sel-zoom-view'?'zoom-view-custom':'zoom-custom');
  if(otherInp)otherInp.style.display='none';
  applyZoom(val);
}
window.addEventListener('resize',function(){ applyZoom(document.getElementById('sel-zoom').value) });

document.getElementById('display-pane').addEventListener('input',function(e){
  lastEditSource='paper';
  onPaperInput(e);
});
document.getElementById('display-pane').addEventListener('keydown',onPaperKey);

// ═══ 编辑标记显示开关 ═══
function toggleMarks(){
  var on=document.body.classList.toggle('show-marks');
  var b=document.getElementById('btn-marks');
  if(b)b.classList.toggle('on',on);
}
// ═══ 专注模式:隐藏功能区/侧栏/状态栏,Esc 或按钮退出 ═══
function toggleFocus(){
  var app=document.querySelector('.app');
  app.classList.toggle('focus');
  if(!app.classList.contains('focus')){
    var sb=document.getElementById('sidebar');
    if(sb.classList.contains('collapsed'))toggleSidebar();
  }
}
// ═══ 全局快捷键(对照 Word)═══
document.addEventListener('keydown',function(e){
  var mod=e.ctrlKey||e.metaKey;
  if(e.key==='Escape'){
    var app=document.querySelector('.app');
    if(app.classList.contains('focus')){ app.classList.remove('focus'); toggleSidebar(); }
    if(brushSticky||brushCmd)stopBrush();
    return;
  }
  if(e.altKey&&mod&&!e.shiftKey){
    var k2=(e.key||'');
    if(/^[0-6]$/.test(k2)){ e.preventDefault(); applyStyle(k2==='0'?'':k2); return }
  }
  if(mod&&e.shiftKey){
    var k3=(e.key||'');
    if(k3==='.'||k3==='<'){ e.preventDefault(); stepSize(1); return }
    if(k3===','||k3==='>'){ e.preventDefault(); stepSize(-1); return }
  }
  if(!mod)return;
  var k=(e.key||'').toLowerCase();
  if(k==='f'){e.preventDefault();toggleFind();return}
  if(k==='h'){e.preventDefault();toggleFind();var rb=document.getElementById('replacebox');if(rb)rb.focus();return}
  if(k==='p'){e.preventDefault();doPrint();return}
  if(k==='s'){e.preventDefault();doSave();return}
  if(k==='e'){e.preventDefault();if(inDisplayMode()){document.execCommand('justifyCenter');onPaperInput()}return}
  if(k==='l'){e.preventDefault();if(inDisplayMode()){document.execCommand('justifyLeft');onPaperInput()}return}
  if(k==='r'&&!e.shiftKey){e.preventDefault();if(inDisplayMode()){document.execCommand('justifyRight');onPaperInput()}return}
  if(k==='j'){e.preventDefault();if(inDisplayMode()){document.execCommand('justifyFull');onPaperInput()}return}
});
// 缩放入口:发起控件选'自定义'时展开它自己的输入框
function zoomEntry(v,which){
  if(v==='custom'){
    var inp=document.getElementById(which==='sel-zoom-view'?'zoom-view-custom':'zoom-custom');
    inp.style.display='inline-block'; inp.focus();
    return;
  }
  applyZoom(v);
}
// 选区字号步进:同步字号下拉显示

// ═══ 大纲滚动高亮跟随 ═══
var spyTimer=null;
document.getElementById('display-pane').addEventListener('scroll',function(){
  document.getElementById('minibar').style.display='none';
  if(spyTimer)clearTimeout(spyTimer);
  spyTimer=setTimeout(spyOutline,160);
});
function spyOutline(){
  var heads=document.querySelectorAll('#display-pane [data-kind="heading"]');
  var pane=document.getElementById('display-pane');
  var top=pane.getBoundingClientRect().top;
  var threshold=pane.clientHeight*0.3;
  var cur=null;
  heads.forEach(function(h){
    var r=h.getBoundingClientRect();
    if(r.top-top<=threshold)cur=h;
  });
  document.querySelectorAll('.outline-item').forEach(function(o){o.classList.remove('active')});
  if(cur){
    var bid=cur.dataset.bid;
    document.querySelectorAll('.outline-item').forEach(function(o){
      if(o.dataset.bid==bid)o.classList.add('active');
    });
  }
}
// 大纲条目记录对应 bid(渲染时)
var _oldRenderOutline=renderOutline;
renderOutline=function(){
  _oldRenderOutline();
  document.querySelectorAll('.outline-item').forEach(function(o,i){
    var heads=gNodes.filter(function(n){return n.kind==='heading'});
    if(heads[i])o.dataset.bid=heads[i].bid;
  });
  spyOutline();
};
