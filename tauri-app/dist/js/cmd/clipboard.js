// 剪贴板与格式刷(Word 式吸取/应用)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 剪贴板与格式刷 ═══
function doPaste(){
  if(navigator.clipboard&&navigator.clipboard.readText){
    navigator.clipboard.readText().then(function(t){
      if(!t)return;
      pastePlain(t);
    }).catch(function(){ document.getElementById('findmsg').textContent='剪贴板不可读,请用 Ctrl+V' });
  }else document.getElementById('findmsg').textContent='剪贴板不可读,请用 Ctrl+V';
}
// 多行文本按行插入(空行分段,其余换 <br>),保持纸面段落结构
function pastePlain(t){
  var lines=t.replace(/\r/g,'').split('\n');
  var first=true;
  for(var i=0;i<lines.length;i++){
    var seg=lines[i];
    if(i<lines.length-1&&seg.trim()===''){ insertAtSelection('\u00A0'); paraBreakAtSelection(); first=true; continue }
    if(!first&&i<lines.length-1) insertAtSelection('\u00A0'), paraBreakAtSelection();
    if(seg!=='')insertAtSelection(seg);
    if(i<lines.length-1&&seg.trim()!=='') paraBreakAtSelection();
    first=false;
  }
  onPaperInput();
}
function paraBreakAtSelection(){
  var sel=window.getSelection();
  if(!sel.rangeCount)return;
  document.execCommand('insertParagraph');
}
function doCut(){ if(document.execCommand('cut'))onPaperInput() }
function doCopy(){ document.execCommand('copy') }
function pasteTextOnly(){
  if(navigator.clipboard&&navigator.clipboard.readText){
    navigator.clipboard.readText().then(function(t){
      if(!t)return;
      insertAtSelection(t);   // DOM 插入,不依赖编辑器焦点
      onPaperInput();
    }).catch(function(){ document.getElementById('findmsg').textContent='剪贴板不可读,请用 Ctrl+V' });
  }
}
// 更改大小写:选中英文循环 首字母大写→全大写→全小写
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
// 格式刷双击:进入连续刷模式(应用后不退出,Esc 或再点取消)
var brushSticky=false;
function brushDouble(){
  brushClick();
  if(brushCmd){ brushSticky=true; document.getElementById('findmsg').textContent='连续格式刷:逐段选中文字应用;Esc 退出' }
}
function insertAtSelection(text){
  var sel=window.getSelection();
  if(!sel.rangeCount)return;
  var r=sel.getRangeAt(0);
  r.deleteContents();
  var tn=document.createTextNode(text);
  r.insertNode(tn);
  r.setStartAfter(tn); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}
// ═══ 格式刷(Word 式):点击吸取光标处格式 → 刷模式 → 选中文字自动应用一次 ═══
var brushCmd=null;
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
// 刷模式下的选区监听:选中非空文字即应用一次并退出
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
// 行距循环按钮:1.15→1.5→1.9→2→2.5→1.15(写回文档级设置)
