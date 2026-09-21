function cycleLineSpacing(){
  var cur=Engine.getConfig().LINE_H;
  var idx=0;
  for(var i=0;i<LSP.length;i++){ if(LSP[i]>=cur-0.01){idx=i;break} }
  var v=LSP[(idx+1)%LSP.length];
  setDocsetLine(/^@\[line-spacing\s/,'@[line-spacing '+v+']');
  var btn=event&&event.target?event.target.closest('button'):null;
  if(btn)btn.title='行距(当前 '+v+' 倍,点击切换)';
}

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
  setDocsetLine(/^@\[margin\s/,'@[margin '+v+'mm]');
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

function toggleOrientation(){
  // 横向为会话级覆盖(规范暂无横向语法):只重排,不写回源码
  Engine.setPage({PAGE_W:CFG.PAGE_H,PAGE_H:CFG.PAGE_W});
  renderKeep();
  document.getElementById('btn-orient').textContent=CFG.PAGE_W>CFG.PAGE_H?'横向':'纵向';
}

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
