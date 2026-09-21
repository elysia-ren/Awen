// 页面设置:纸型/页边距/行距/方向/首行缩进(写回文档级设置行)(自单文件版拆出;传统 script,全局变量直接共享)
var LSP=[1.15,1.5,1.9,2,2.5];
function cycleLineSpacing(){
  var cur=Engine.getConfig().LINE_H;
  var idx=0;
  for(var i=0;i<LSP.length;i++){ if(LSP[i]>=cur-0.01){idx=i;break} }
  var v=LSP[(idx+1)%LSP.length];
  setDocsetLine(/^@\[line-spacing\s/,'@[line-spacing '+v+']');
  var btn=event&&event.target?event.target.closest('button'):null;
  if(btn)btn.title='行距(当前 '+v+' 倍,点击切换)';
}

// ═══ 页面设置(写回文档级设置行,源码即权威)═══
function setDocsetLine(matchRe,newLine){
  var lines=gSrc.split('\n');
  for(var i=0;i<lines.length;i++){
    if(matchRe.test(lines[i])){
      if(newLine===null)lines.splice(i,1); else lines[i]=newLine;
      setSrc(lines.join('\n'));
      return;
    }
  }
  // 未找到:插入文件头 @[...] 设置区末尾
  var at=0;
  while(at<lines.length&&lines[at].indexOf('@[')===0)at++;
  lines.splice(at,0,newLine);
  setSrc(lines.join('\n'));
}
function applyPaper(v){
  var sz=Engine.PAPER_SIZES[v]; if(!sz)return;
  setDocsetLine(/^@\[page\s/,'@[page '+v+']');
}
function applyMargin(v){
  if(v==='custom'){
    var inp=document.getElementById('margin-custom');
    inp.style.display='block'; inp.focus();
    return;
  }
  var x=parseFloat(v);
  if(x>0) setDocsetLine(/^@\[margin\s/,'@[margin '+x+'mm]');
}
function applyMarginCustom(v){
  var x=parseFloat(v);
  if(x>=5&&x<=60) setDocsetLine(/^@\[margin\s/,'@[margin '+x+'mm]');
}
function applyLineSpacing(v){
  if(v==='custom'){
    var inp=document.getElementById('linesp-custom');
    inp.style.display='block'; inp.focus();
    return;
  }
  setDocsetLine(/^@\[line-spacing\s/,'@[line-spacing '+v+']');
}
function applyLineSpacingCustom(v){
  var x=parseFloat(v);
  if(x>=1&&x<=4) setDocsetLine(/^@\[line-spacing\s/,'@[line-spacing '+x+']');
}
// 段间距(段后 @[para-spacing];0 = 移除该设置行)
function applyParaSpacing(v){
  var inp=document.getElementById('parasp-custom');
  if(inp)inp.style.display=(v==='custom')?'block':'none';
  if(v==='custom')return;
  var lines=gSrc.split('\n');
  for(var i=0;i<lines.length;i++){
    if(lines[i].indexOf('@[para-spacing')===0){
      if(v==='0')lines.splice(i,1); else lines[i]='@[para-spacing '+v+']';
      setSrc(lines.join('\n'));
      return;
    }
  }
  if(v!=='0'){
    var at=0;
    for(var j=0;j<lines.length;j++){ if(lines[j].indexOf('@[')===0)at=j+1; else break }
    lines.splice(at,0,'@[para-spacing '+v+']');
    setSrc(lines.join('\n'));
  }
}
function applyParaSpacingCustom(v){
  var t=(v||'').trim();
  if(!t)return;
  if(/^\d/.test(t)&&t.indexOf('em')<0&&t.indexOf('mm')<0)t=t+'em';
  applyParaSpacing(t);
  var sel=document.getElementById('sel-parasp');
  if(sel){
    var has=[].some.call(sel.options,function(o){return o.value===t});
    if(!has){
      var o=document.createElement('option');
      o.value=t; o.textContent=t;
      sel.insertBefore(o,sel.options[sel.options.length-1]);
    }
    sel.value=t;
  }
}
function toggleOrientation(){
  // 横向为会话级覆盖(规范暂无横向语法):只重排,不写回源码
  Engine.setPage({PAGE_W:CFG.PAGE_H,PAGE_H:CFG.PAGE_W});
  renderKeep();
  document.getElementById('btn-orient').textContent=CFG.PAGE_W>CFG.PAGE_H?'横向':'纵向';
}

// ═══ 首行缩进开关(@[first-line 2em] 文档级)═══
function toggleFirstLine(){
  var lines=gSrc.split('\n');
  var idx=-1;
  for(var i=0;i<lines.length;i++){ if(lines[i].indexOf('@[first-line')===0){idx=i;break} }
  if(idx>=0){ lines.splice(idx,1); document.getElementById('btn-firstline').classList.remove('on') }
  else{
    var at=0;
    for(var j=0;j<lines.length;j++){ if(lines[j].indexOf('@[')===0)at=j+1; else break }
    lines.splice(at,0,'@[first-line 2em]');
    document.getElementById('btn-firstline').classList.add('on');
  }
  setSrc(lines.join('\n'));
}
