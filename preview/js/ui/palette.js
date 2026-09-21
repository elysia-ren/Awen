function pushRecent(c){
  recentColors=recentColors.filter(function(x){return x!==c});
  recentColors.unshift(c);
  if(recentColors.length>8)recentColors.pop();
  try{localStorage.setItem('awen-recent-colors',JSON.stringify(recentColors))}catch(e){}
}

function applyPal(kind,c){
  if(kind==='fore'){curFore=c;applyColor(c)}
  else{curMark=c;applyMark(c)}
  pushRecent(c);
}

function palSwatch(parent,c){
  var sw=document.createElement('div');
  sw.className='sw'; sw.style.background=c; sw.title=c;
  sw.onmousedown=function(ev){ev.preventDefault()};   // 保住文字选区
  sw.onclick=function(){applyPal(kindOfPal,c);closePal()};
  parent.appendChild(sw);
}

function togglePal(e,kind){
  e.stopPropagation();
  var pal=document.getElementById('float-pal');
  var wasOpen=_palOpenKind===kind&&pal.classList.contains('open');
  closePal();
  if(wasOpen)return;
  kindOfPal=kind;
  pal.innerHTML='';
  var t=document.createElement('div');
  t.className='cp-title';
  t.textContent=kind==='fore'?'字体颜色':'底纹颜色';
  pal.appendChild(t);
  // 最近使用(有记录才显示)
  if(recentColors.length){
    var rt=document.createElement('div');
    rt.className='cp-title'; rt.style.margin='0 0 4px';
    rt.textContent='最近使用';
    pal.appendChild(rt);
    var rg=document.createElement('div');
    rg.className='cp-grid'; rg.style.marginBottom='10px';
    recentColors.forEach(function(c){ palSwatch(rg,c) });
    pal.appendChild(rg);
    var sep=document.createElement('div');
    sep.style.cssText='border-top:1px solid #ececee;margin:0 0 10px';
    pal.appendChild(sep);
  }
  var g=document.createElement('div');
  g.className='cp-grid';
  PAL_MAIN.forEach(function(c){
    palSwatch(g,c);
  });
  pal.appendChild(g);
  var more=document.createElement('div');
  more.className='cp-more';
  var pickSpan=document.createElement('span');
  pickSpan.setAttribute('data-icon','pick');
  more.appendChild(pickSpan);
  more.appendChild(document.createTextNode('其他颜色…'));
  var inp=document.createElement('input');
  inp.type='color';
  inp.style.cssText='position:absolute;inset:0;opacity:0;cursor:pointer';
  inp.onchange=function(){applyPal(kind,inp.value);closePal()};
  more.style.position='relative';
  more.appendChild(inp);
  pal.appendChild(more);
  [...pal.querySelectorAll('[data-icon]')].forEach(function(el){
    if(!el.innerHTML)el.innerHTML=ICONS[el.dataset.icon]||'';
  });
  var anchor=e.target.closest('.colordrop')||e.target;
  var r=anchor.getBoundingClientRect();
  pal.style.left=Math.max(8,Math.min(r.left,window.innerWidth-260))+'px';
  pal.style.top=(r.bottom+8)+'px';
  pal.style.display='flex';
  pal.classList.add('open');
  _palOpenKind=kind;
}

function closePal(){
  _palOpenKind=null;
  var fp=document.getElementById('float-pal');
  if(fp){fp.classList.remove('open');fp.style.display='none'}
}

document.addEventListener('click',function(e){
  if(_palOpenKind&&!e.target.closest('#float-pal')&&!e.target.closest('.half-caret')&&!e.target.closest('.splitbtn .rbtn')){
    closePal();
  }
});
