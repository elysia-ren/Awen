function inDisplayMode(){ return currentMode!=='syntax' }

function fmtCmd(cmd){
  if(inDisplayMode()){
    document.execCommand(cmd,false,null);
    onPaperInput();
  }else{
    var map={bold:['**','**'],italic:['_','_'],underline:['@[u]','@[/u]'],strikeThrough:['~~','~~'],superscript:['@[sup]','@[/sup]'],subscript:['@[sub]','@[/sub]']};
    if(map[cmd])wrapSyntax(map[cmd][0],map[cmd][1]);
  }
}

function fmtCmdInline(){
  if(inDisplayMode()){
    var s=window.getSelection();
    if(!s.rangeCount||s.isCollapsed)return;
    var r=s.getRangeAt(0);
    var b1=(r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement).closest('[data-bid]');
    var b2=(r.endContainer.nodeType===1?r.endContainer:r.endContainer.parentElement).closest('[data-bid]');
    if(!b1||b1!==b2){ document.getElementById('findmsg').textContent='行内代码不能跨段落'; return }
    var code=document.createElement('code');
    code.appendChild(r.extractContents());
    r.insertNode(code);
    onPaperInput();
  }
  else wrapSyntax('`','`');
}

function wrapSpan(open, close, style, native){
  var s=window.getSelection();
  if(!s.rangeCount||s.isCollapsed)return false;
  var r=s.getRangeAt(0);
  var b1=(r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement).closest('[data-bid]');
  var b2=(r.endContainer.nodeType===1?r.endContainer:r.endContainer.parentElement).closest('[data-bid]');
  if(!b1||b1!==b2){ document.getElementById('findmsg').textContent='该格式不能跨段落选择'; return false }
  var wrap=document.createElement(native?'code':'span');
  if(!native){
    wrap.dataset.cmd=open; wrap.dataset.close=close;
  }
  if(style)for(var k in style)wrap.style[k]=style[k];
  wrap.appendChild(r.extractContents());
  r.insertNode(wrap);
  s.removeAllRanges();
  var nr=document.createRange(); nr.selectNodeContents(wrap); s.addRange(nr);
  return true;
}

function applyColor(v){
  if(inDisplayMode()){ document.execCommand('foreColor',false,v); onPaperInput() }
  else wrapSyntax('@[color '+v+']','@[/color]');
}

function applyMark(v){
  if(inDisplayMode()){
    var s=window.getSelection();
    if(!s.rangeCount||s.isCollapsed)return;
    if(wrapSpan('@[mark '+v+']','@[/mark]',{background:v},false))onPaperInput();
  }
  else wrapSyntax('@[mark '+v+']','@[/mark]');
}

function applySize(v){
  if(!v)return;
  if(inDisplayMode()){
    var s=window.getSelection();
    if(!s.rangeCount||s.isCollapsed){ document.getElementById('findmsg').textContent='请先选中要设置字号的文字'; return }
    if(wrapSpan('@[size '+v+']','@[/size]',{fontSize:v+'pt'},false))onPaperInput();
  }
  else wrapSyntax('@[size '+v+']','@[/size]');
}

function applyFont(v){
  if(!v)return;
  if(inDisplayMode()){
    var s=window.getSelection();
    if(!s.rangeCount||s.isCollapsed)return;
    if(wrapSpan('@[font "'+v+'"]','@[/font]',{fontFamily:"'"+v+"',serif"},false))onPaperInput();
  }
  else wrapSyntax('@[font "'+v+'"]','@[/font]');
  document.getElementById('sel-font').selectedIndex=0;
}

function toggleCase(){
  var sel=window.getSelection();
  if(!sel.rangeCount||sel.isCollapsed){ document.getElementById('findmsg').textContent='请先选中英文文字'; return }
  var t=sel.toString();
  if(!/[a-zA-Z]/.test(t)){ document.getElementById('findmsg').textContent='选中内容不含英文字母'; return }
  var allUp=t===t.toUpperCase(), allLow=t===t.toLowerCase();
  var next;
  if(!allUp&&!allLow)next=t.toUpperCase();
  else if(allLow)next=t.charAt(0).toUpperCase()+t.slice(1).toLowerCase();
  else if(allUp)next=t.toLowerCase();
  else next=t.toLowerCase();
  // 记录选区,替换后重设——保持选中以便连续点击循环
  var rng=sel.getRangeAt(0);
  document.execCommand('insertText',false,next);
  var sel2=window.getSelection();
  if(sel2.rangeCount){
    var r2=sel2.getRangeAt(0);
    try{ r2.setStart(r2.endContainer,r2.endOffset-t.length); r2.setEnd(r2.endContainer,r2.endOffset); sel2.removeAllRanges(); sel2.addRange(r2) }catch(e){}
  }
  onPaperInput();
}

function brushDouble(){
  brushClick();
  if(brushCmd){ brushSticky=true; document.getElementById('findmsg').textContent='连续格式刷:逐段选中文字应用;Esc 退出' }
}

function brushClick(){
  if(brushCmd){ stopBrush(); return }   // 再点取消刷模式
  var sel=window.getSelection();
  var node=sel.rangeCount?sel.getRangeAt(0).startContainer:null;
  var el=node&&(node.nodeType===1?node:node.parentElement);
  var src=el&&el.closest?el.closest('[data-cmd],b,strong,i,em,u,del,s,strike,code'):null;
  if(!src){ document.getElementById('findmsg').textContent='光标处无可吸取的格式'; return }
  if(src.dataset&&src.dataset.cmd){
    brushCmd={cmd:src.getAttribute('data-cmd'),close:src.getAttribute('data-close')||'',native:false};
  }else{
    var tag=src.tagName;
    if(tag==='B'||tag==='STRONG')brushCmd={cmd:'**',close:'**',native:false};
    else if(tag==='I'||tag==='EM')brushCmd={cmd:'_',close:'_',native:false};
    else if(tag==='U')brushCmd={cmd:'@[u]',close:'@[/u]',native:false};
    else if(tag==='DEL'||tag==='S'||tag==='STRIKE')brushCmd={cmd:'~~',close:'~~',native:false};
    else if(tag==='CODE')brushCmd={cmd:'`',close:'`',native:true};
    else{ document.getElementById('findmsg').textContent='光标处无可吸取的格式'; return }
  }
  document.getElementById('btn-brush').classList.add('on');
  document.getElementById('findmsg').textContent='格式刷已吸取:选中要应用的文字即可';
  document.body.style.cursor='crosshair';
}

function stopBrush(){
  brushCmd=null;
  brushSticky=false;
  var b=document.getElementById('btn-brush');
  if(b)b.classList.remove('on');
  document.body.style.cursor='';
}

document.addEventListener('selectionchange',function(){
  if(!brushCmd)return;
  var sel=window.getSelection();
  if(!sel.rangeCount||sel.isCollapsed)return;
  var node=sel.getRangeAt(0).startContainer;
  var el=node&&(node.nodeType===1?node:node.parentElement);
  if(!el||!el.closest||!el.closest('.paper'))return;
  var cmd=brushCmd, sticky=brushSticky;
  if(!sticky)stopBrush();
  if(wrapSpan(cmd.cmd,cmd.close,null,cmd.native))onPaperInput();
});

document.getElementById('display-pane').addEventListener('keydown',onPaperKey);

function stepSize(d){
  var sel=document.getElementById('sel-size');
  var cur=parseFloat(sel.value)||10.5;
  var v;
  if(d>0){
    v=SIZE_LADDER.find(function(x){return x>cur+0.01});
    if(v===undefined)v=SIZE_LADDER[SIZE_LADDER.length-1];
  }else{
    v=null;
    for(var i=SIZE_LADDER.length-1;i>=0;i--){ if(SIZE_LADDER[i]<cur-0.01){v=SIZE_LADDER[i];break} }
    if(v===null)v=SIZE_LADDER[0];
  }
  var has=[].some.call(sel.options,function(o){return parseFloat(o.value)===v});
  if(!has){
    var o=document.createElement('option');
    o.value=String(v); o.textContent=(v===Math.round(v)?v:v.toFixed(1))+' 号';
    sel.appendChild(o);
  }
  sel.value=String(v);
  applySize(String(v));
}
