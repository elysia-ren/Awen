// 浮动面板:诊断/标签/符号/功能区显隐/图片属性/折叠(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 诊断(原生优先 → 核心 JSON 注入 → 本地快速检查)═══
function updateDiagBar(){
  var ds=allDiags();
  var errs=ds.filter(function(d){return d.sev==='err'}).length;
  var warns=ds.length-errs;
  var el=document.getElementById('st-diag');
  if(!el)return;
  if(!ds.length){el.textContent='诊断 ✓';el.style.background='transparent'}
  else{el.textContent='诊断 '+errs+' 错误 '+warns+' 警告';el.style.background=errs?'#a33d2f':'#8a6d1a'}
  window._diagList=ds;
}
function toggleDiagPop(){
  var pop=document.getElementById('diagpop');
  if(!pop)return;
  if(pop.style.display==='block'&&pop.dataset.kind!=='labels'){pop.style.display='none';return}
  pop.dataset.kind='diags';
  var ds=window._diagList||[];
  pop.innerHTML=ds.length?ds.map(function(d){
    return '<div class="dline" onclick="gotoLine('+d.line+')"><span class="diag-'+d.sev+'">'+(d.sev==='err'?'错误':'警告')+'</span> 第 '+d.line+' 行 — '+(d.msg||'')+'</div>';
  }).join(''):'<div style="color:#4a8a4a">没有诊断问题</div>';
  pop.style.display='block';
}
// 标签清单弹层:列出全部标签块,点击跳转
function toggleLabelPop(){
  var pop=document.getElementById('diagpop');
  if(!pop)return;
  if(pop.style.display==='block'&&pop.dataset.kind==='labels'){pop.style.display='none';return}
  renderLabelList();
  pop.style.display='block';
}
function renderLabelList(){
  var pop=document.getElementById('diagpop');
  var labels=gNodes.filter(function(n){return n.kind==='label'});
  pop.dataset.kind='labels';
  pop.innerHTML=(labels.length?labels.map(function(l){
    return '<div class="dline" style="display:flex;align-items:center;gap:6px">'
      +'<span style="cursor:pointer;flex:1" onclick="var t=document.querySelector(\'#display-pane [data-bid=&quot;'+l.bid+'&quot;]\');if(t)t.scrollIntoView({behavior:\'smooth\',block:\'start\'})">📌 '+renamelabel_esc(l.text)+' — 第 '+(l.srcStart+1)+' 行</span>'
      +'<button class="sbtn" style="height:20px;padding:0 6px;font-size:11px" onclick="renameLabelStart('+l.bid+',this)">改名</button>'
      +'</div>';
  }).join(''):'<div style="color:#4a8a4a">文档中没有标签</div>')
  +'<div style="margin-top:6px;font-size:11px;color:#8a8c90">点击名称跳转;「改名」同步更新全部引用</div>';
}
function renamelabel_esc(s){return String(s||'').replace(/</g,'&lt;')}
function renameLabelStart(bid,btn){
  var b=nodeByBid(bid);
  if(!b)return;
  var line=btn?btn.parentNode:document.querySelector('#diagpop .dline');
  if(!line)return;
  line.innerHTML='<input id="rl-input" value="'+renamelabel_esc(b.text)+'" style="flex:1;min-width:0;height:22px;border:1px solid #4b6f8d;border-radius:4px;font-size:12px;padding:0 6px">'
    +'<button class="sbtn" style="height:22px;padding:0 6px;font-size:11px;background:#d7e2ec" onclick="renameLabelApply('+bid+')">确定</button>';
  var inp=document.getElementById('rl-input');
  inp.focus(); inp.select();
  inp.onkeydown=function(e){ if(e.key==='Enter')renameLabelApply(bid); if(e.key==='Escape')renderLabelList() };
}
function renameLabelApply(bid){
  var b=nodeByBid(bid);
  var inp=document.getElementById('rl-input');
  var newName=(inp&&inp.value||'').trim().replace(/[\[\]]/g,'');
  if(!b||!newName||newName===b.text){ renderLabelList(); return }
  var old=b.text;
  var count=0;
  var reLabel=new RegExp('(@\\[label\\s+)'+old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\])','g');
  var reRef=new RegExp('(@\\[ref\\s+)'+old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\])','g');
  var lines=gSrc.split('\n');
  for(var i=0;i<lines.length;i++){
    var nl=lines[i].replace(reLabel,'$1'+newName+'$2').replace(reRef,'$1'+newName+'$2');
    if(nl!==lines[i]){lines[i]=nl;count++}
  }
  if(count)setSrc(lines.join('\n'));
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
  renderLabelList();
}
function gotoLine(n){
  var ta=document.getElementById('syntax-src');
  if(!ta)return;
  setMode('syntax');
  var pos=0,lines=gSrc.split('\n');
  for(var i=0;i<Math.min(n-1,lines.length);i++)pos+=lines[i].length+1;
  ta.focus();
  ta.setSelectionRange(pos,pos+(lines[n-1]?lines[n-1].length:0));
  setGutterCur(n);
}

// ═══ 特殊符号面板 ═══
var SYMBOLS='©®™±×÷≈≠≤≥℃㎡①②③④⑤⑥⑦⑧⑨⑩→←↑↓↔⇒∴∵§¶†‡•…°′″¥€£'.split('');
function toggleSymbolPanel(btn){
  var old=document.getElementById('symbol-pop');
  if(old){old.remove();return}
  var pop=document.createElement('div');
  pop.id='symbol-pop';
  pop.style.cssText='position:fixed;z-index:210;background:#fff;border:1px solid #c9cbce;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:8px;display:grid;grid-template-columns:repeat(8,30px);gap:3px';
  var r=btn.getBoundingClientRect();
  pop.style.left=Math.min(r.left,window.innerWidth-280)+'px';
  pop.style.top=(r.bottom+6)+'px';
  SYMBOLS.forEach(function(ch){
    var d=document.createElement('div');
    d.textContent=ch;
    d.style.cssText='text-align:center;cursor:pointer;padding:3px 0;border-radius:4px;font-size:14px';
    d.onmouseenter=function(){d.style.background='#eef4f8'};
    d.onmouseleave=function(){d.style.background=''};
    d.onclick=function(){ insertAtSelection(ch); onPaperInput(); pop.remove() };
    pop.appendChild(d);
  });
  document.body.appendChild(pop);
  setTimeout(function(){
    document.addEventListener('click',function hider(ev){
      if(!pop.contains(ev.target)&&ev.target!==btn&&!btn.contains(ev.target)){pop.remove();document.removeEventListener('click',hider)}
    });
  },0);
}

function showRibbon(page){
  // 折叠状态下点击标签=展开功能区
  if(ribbonCollapsed)toggleRibbonCollapse();
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.page===page)});
  document.querySelectorAll('.ribbon-page').forEach(function(p){p.classList.toggle('active',p.dataset.page===page)});
}

// ═══ 占位功能统一提示(功能区规划中未实现项,按钮带红点角标)═══
var todoTimer=null;
function todo(name,why){
  var t=document.getElementById('todo-toast');
  if(!t){
    t=document.createElement('div');
    t.id='todo-toast';
    document.body.appendChild(t);
  }
  t.textContent='「'+name+'」功能规划中'+(why?'('+why+')':'');
  t.style.display='block';
  if(todoTimer)clearTimeout(todoTimer);
  todoTimer=setTimeout(function(){t.style.display='none'},2200);
}

// ═══ 上下文选项卡:选中表格/图片时显示对应工具选项卡(不自动切换页)═══
function updateCtxTabs(){
  var b=caretBlock();
  var inTable=b&&b.closest&&b.closest('table');
  var blk=b&&b.closest?b.closest('[data-bid]'):null;
  // 图片块容器可能就是 IMG 本身(objHtml 返回裸 img,dataset 设在其上)
  var inImg=!!blk&&(!!blk.querySelector('img,.img-ph')||blk.tagName==='IMG'||blk.classList.contains('img-ph'));
  var tt=document.getElementById('tableToolsTab');
  var it=document.getElementById('imageToolsTab');
  if(tt)tt.style.display=inTable?'flex':'none';
  if(it)it.style.display=inImg?'flex':'none';
  // 当前激活的是被隐藏的上下文选项卡(焦点离开对象)→ 回到开始页
  var active=document.querySelector('.tab.active');
  if(active&&(!active.offsetParent||getComputedStyle(active).display==='none'))showRibbon('start');
}

// ═══ 文件下拉菜单 / 设置抽屉 / 遮罩 ═══
function toggleFileMenu(ev){
  if(ev)ev.stopPropagation();
  var m=document.getElementById('file-menu');
  var ov=document.getElementById('overlay');
  var sd=document.getElementById('settings-drawer');
  sd.classList.remove('show');
  var show=!m.classList.contains('show');
  m.classList.toggle('show',show);
  ov.classList.toggle('show',show);
  if(show)renderRecentList();
}
function toggleSettings(){
  var sd=document.getElementById('settings-drawer');
  var m=document.getElementById('file-menu');
  var ov=document.getElementById('overlay');
  m.classList.remove('show');
  var show=!sd.classList.contains('show');
  sd.classList.toggle('show',show);
  ov.classList.toggle('show',show);
}
function closeAllPopups(){
  document.getElementById('file-menu').classList.remove('show');
  document.getElementById('settings-drawer').classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
}
// ═══ 设置项 ═══
// 自动保存开关(存 localStorage,autosave.js 落盘前检查)
function setAutosavePref(on){
  try{localStorage.setItem('awen-set-autosave',on?'on':'off')}catch(e){}
}
// 编辑标记开关与功能区按钮双向同步
function syncMarks(checked){
  var on=document.body.classList.contains('show-marks');
  if(on!==checked)toggleMarks();
}
// 主题:浅色 / 护眼 / 深色(深色只压暗界面铬层,纸面保持白底)
function setTheme(t){
  var app=document.querySelector('.app');
  app.classList.toggle('eyecare',t==='eyecare');
  app.classList.toggle('dark',t==='dark');
  try{localStorage.setItem('awen-theme',t)}catch(e){}
  var l=document.getElementById('tc-light'),e=document.getElementById('tc-eye'),d=document.getElementById('tc-dark');
  if(l)l.classList.toggle('on',t!=='eyecare'&&t!=='dark');
  if(e)e.classList.toggle('on',t==='eyecare');
  if(d)d.classList.toggle('on',t==='dark');
}

// ═══ 阅读视图:隐藏编辑铬层,只留纸面(Esc 或再点退出)═══
function toggleReading(){
  var app=document.querySelector('.app');
  var on=app.classList.toggle('reading');
  var b=document.getElementById('btn-reading');
  if(b)b.classList.toggle('on',on);
}

// ═══ 界面缩放:只缩放铬层(标题栏/功能区/侧栏/状态栏),纸面走页宽缩放 ═══
function applyUiZoom(pct){
  var z=pct/100;
  var app=document.querySelector('.app');
  ['.titlebar','.ribbon','.sidebar','.statusbar','.tabbar'].forEach(function(sel){
    app.querySelectorAll(sel).forEach(function(el){ el.style.zoom=z });
  });
  try{localStorage.setItem('awen-uizoom',String(pct))}catch(e){}
}
function setUiZoom(pct){
  applyUiZoom(pct);
  try{localStorage.setItem('awen-uizoom-pct',String(pct))}catch(e){}
}

// ═══ 页宽缩放:缩放显示视图纸面 ═══
function setPageZoom(pct){
  var pane=document.getElementById('display-pane');
  if(pane)pane.style.zoom=pct/100;
  try{localStorage.setItem('awen-pagezoom',String(pct))}catch(e){}
}
function togglePageZoom(){
  var cur=parseFloat(getComputedStyle(document.getElementById('display-pane')).zoom||1);
  var next=cur>=1.5?0.8:(cur>=1.2?1.5:(cur>=0.8?1.2:0.8));
  setPageZoom(Math.round(next*100));
}

// ═══ 侧栏收起/展开 ═══
function toggleSidebar(){
  var sb=document.getElementById('sidebar');
  var ob=document.getElementById('sb-open');
  sb.classList.toggle('collapsed');
  ob.style.display=sb.classList.contains('collapsed')?'block':'none';
}

// ═══ 图片属性面板(E2-5):点击图片→改宽度/对齐→写回源码行 ═══
var btn_anchor=null;
function openImagePanel(bid){
  // 无参调用(图片工具选项卡按钮):取当前光标所在图片块
  if(bid===undefined){
    var blk=caretBlock();
    if(!blk)return;
    var el=blk.closest?blk.closest('[data-bid]'):null;
    if(!el)return;
    bid=el.dataset.bid;
  }
  var b=nodeByBid(bid);
  if(!b||b.kind!=='obj')return;
  var first=(b.text||'').split('\n')[0];
  var m=first.match(/^@\[(image|figure|图片)(?:\s+([^\]]*))?\]/);
  if(!m){ document.getElementById('findmsg').textContent='该对象暂不支持属性编辑'; return }
  var params=m[2]||'';
  var wm=params.match(/width:?\s*(\d+(?:\.\d+)?)\s*%/);
  var am=params.match(/align:?\s*(\w+)/);
  var old=document.getElementById('image-pop');
  if(old)old.remove();
  var pop=document.createElement('div');
  pop.id='image-pop';
  pop.style.cssText='position:fixed;z-index:210;background:#fff;border:1px solid #c9cbce;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:12px;width:230px';
  var el=document.querySelector('#display-pane [data-bid="'+bid+'"]');
  var r=el?el.getBoundingClientRect():{left:100,bottom:100};
  pop.style.left=Math.min(r.left,window.innerWidth-260)+'px';
  pop.style.top=(r.bottom+8)+'px';
  pop.innerHTML='<div style="font-weight:600;font-size:12px;margin-bottom:8px">图片属性</div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
    +'<label style="font-size:12px;flex:none">宽度</label>'
    +'<input type="number" id="img-w" min="5" max="100" step="5" value="'+(wm?wm[1]:'100')+'" style="width:70px;height:24px;border:1px solid #c9cbce;border-radius:4px;font-size:12px">'
    +'<span style="font-size:12px">%</span></div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">'
    +'<label style="font-size:12px;flex:none">对齐</label>'
    +'<select id="img-a" style="height:24px;font-size:12px;border:1px solid #c9cbce;border-radius:4px">'
    +'<option value="center">居中</option><option value="left">左对齐</option><option value="right">右对齐</option>'
    +'</select></div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end">'
    +'<button class="sbtn" id="img-cancel">取消</button>'
    +'<button class="sbtn" id="img-ok" style="background:#d7e2ec;border-color:#4b6f8d">应用</button></div>';
  document.body.appendChild(pop);
  var aSel=pop.querySelector('#img-a');
  aSel.value=(am?am[1].toLowerCase():'center');
  if(['center','left','right'].indexOf(aSel.value)<0)aSel.value='center';
  btn_anchor=el||document.body;
  pop.querySelector('#img-cancel').onclick=function(){ pop.remove() };
  pop.querySelector('#img-ok').onclick=function(){
    var w=parseFloat(pop.querySelector('#img-w').value);
    if(!(w>=5&&w<=100)){ document.getElementById('findmsg').textContent='宽度需在 5-100 之间'; return }
    var al=aSel.value;
    var np=params;
    if(wm)np=np.replace(/width:?\s*\d+(?:\.\d+)?\s*%/,'width '+w+'%');
    else np=(np+' width '+w+'%').trim();
    if(am)np=np.replace(/align:?\s*\w+/,'align '+al);
    else np=(np+' align '+al).trim();
    var newLine='@['+m[1]+' '+np.trim()+']';
    var lines=gSrc.split('\n');
    for(var i=0;i<lines.length;i++){
      if(lines[i].indexOf(first)===0){ lines[i]=newLine; setSrc(lines.join('\n')); break }
    }
    pop.remove();
  };
  setTimeout(function(){
    document.addEventListener('click',function hider(ev){
      if(!pop.contains(ev.target)&&!btn_anchor.contains(ev.target)){pop.remove();document.removeEventListener('click',hider)}
    });
  },0);
}

document.querySelectorAll('.ribbon,.tabbar,#minibar,#float-pal').forEach(function(root){
  if(!root)return;
  root.addEventListener('mousedown',function(e){
    if(e.target.closest('button,label,.sw'))e.preventDefault();
  });
});

// ═══ 功能区折叠 ═══
var ribbonCollapsed=false;
function toggleRibbonCollapse(){
  ribbonCollapsed=!ribbonCollapsed;
  var r=document.querySelector('.ribbon');
  r.style.display=ribbonCollapsed?'none':'block';
  document.getElementById('btn-collapse').style.transform=ribbonCollapsed?'rotate(180deg)':'';
}
