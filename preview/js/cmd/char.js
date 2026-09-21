// 字符格式命令:粗斜下划/上下标/颜色/字号/字体/样式/列表(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 工具栏命令 ═══
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
// 保格式包裹:保留选区内嵌套标记,跨段落拒绝
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
function applyStyle(lv){
  if(lv==='')return;
  var bel=caretBlock();
  var bid;
  if(bel)bid=+bel.dataset.bid;
  else{
    var ta=document.getElementById('syntax-src');
    if(!ta)return;
    var pos=ta.value.substring(0,ta.selectionStart).split('\n').length-1;
    for(var i=0;i<gNodes.length;i++){ if(pos>=gNodes[i].srcStart&&pos<gNodes[i].srcEnd){ bid=gNodes[i].bid; break } }
    if(bid===undefined)return;
  }
  var b=nodeByBid(bid);
  if(!b)return;
  var el=document.querySelector('#display-pane [data-bid="'+bid+'"]');
  var body=el?Engine.inlineSource(el).replace(/^#+\s*/,'').trim():Engine.displayText(b.text);
  var lines=gSrc.split('\n');
  lines.splice(b.srcStart,b.srcEnd-b.srcStart,'#'.repeat(+lv)+' '+body);
  setSrc(lines.join('\n'));
  restoreCaret({bid:bid,off:0});
}
function listCmd(kind){
  if(inDisplayMode()){
    document.execCommand(kind==='ul'?'insertUnorderedList':'insertOrderedList',false,null);
    onPaperInput();
  }else insertSyntax(kind==='ul'?'\n- 列表项\n':'\n1. 列表项\n');
}

var SIZE_LADDER=[9,10.5,11,12,14,16,18,20,22,26,36,48,72];
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
