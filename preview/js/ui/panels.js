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

function openImagePanel(bid){
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

function showWordCount(){
  var chars=0, charsSp=0, paras=0, words=0;
  var paper=document.querySelector('#display-pane .paper');
  if(paper){
    var txt=paper.textContent;
    charsSp=txt.replace(/\s{2,}/g,' ').trim().length;
    chars=txt.replace(/\s/g,'').length;
    paras=gNodes.filter(function(n){return n.kind==='para'||n.kind==='heading'}).length;
  }
  var pop=document.getElementById('diagpop');
  pop.innerHTML='<div style="font-weight:600;margin-bottom:6px">字数统计</div>'
    +'<div>字数(不计空格): <b>'+chars+'</b></div>'
    +'<div>字符数(计空格): <b>'+charsSp+'</b></div>'
    +'<div>段落数: <b>'+paras+'</b></div>'
    +'<div>页数: <b>'+gPages.length+'</b></div>';
  pop.style.display='block';
  setTimeout(function(){pop.style.display='none'},4000);
}
