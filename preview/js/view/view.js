function swapSplit(){
  var ws=document.querySelector('.workspace');
  var dp=document.getElementById('display-pane');
  var sp=document.getElementById('syntax-pane');
  var st=document.getElementById('splitter');
  if(!dp||!sp)return;
  if(dp.nextElementSibling===sp){ ws.insertBefore(sp,dp); }
  else{ ws.insertBefore(dp,sp); }
  // 分隔条保持在两窗格之间
  if(st){ ws.insertBefore(st,sp); }
}

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

function applyZoomCustom(v,which){
  var x=parseFloat(v);
  if(!(x>=30&&x<=300))return;
  var val=String(Math.round(x)/100);
  var otherInp=document.getElementById(which==='sel-zoom-view'?'zoom-view-custom':'zoom-custom');
  if(otherInp)otherInp.style.display='none';
  applyZoom(val);
}

window.addEventListener('resize',function(){ applyZoom(document.getElementById('sel-zoom').value) });

function showRibbon(page){
  // 折叠状态下点击标签=展开功能区
  if(ribbonCollapsed)toggleRibbonCollapse();
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.page===page)});
  document.querySelectorAll('.ribbon-page').forEach(function(p){p.classList.toggle('active',p.dataset.page===page)});
  if(page==='file')renderRecentList();
}

function toggleSidebar(){
  var sb=document.getElementById('sidebar');
  var ob=document.getElementById('sb-open');
  sb.classList.toggle('collapsed');
  ob.style.display=sb.classList.contains('collapsed')?'block':'none';
}

function toggleRibbonCollapse(){
  ribbonCollapsed=!ribbonCollapsed;
  var r=document.querySelector('.ribbon');
  r.style.display=ribbonCollapsed?'none':'block';
  document.getElementById('btn-collapse').style.transform=ribbonCollapsed?'rotate(180deg)':'';
}

function toggleMarks(){
  var on=document.body.classList.toggle('show-marks');
  var b=document.getElementById('btn-marks');
  if(b)b.classList.toggle('on',on);
}

function toggleFocus(){
  var app=document.querySelector('.app');
  app.classList.toggle('focus');
  if(!app.classList.contains('focus')){
    var sb=document.getElementById('sidebar');
    if(sb.classList.contains('collapsed'))toggleSidebar();
  }
}

function zoomEntry(v,which){
  if(v==='custom'){
    var inp=document.getElementById(which==='sel-zoom-view'?'zoom-view-custom':'zoom-custom');
    inp.style.display='inline-block'; inp.focus();
    return;
  }
  applyZoom(v);
}

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
