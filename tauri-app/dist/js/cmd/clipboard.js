function doPaste(){
  if(navigator.clipboard&&navigator.clipboard.readText){
    navigator.clipboard.readText().then(function(t){
      if(!t)return;
      pastePlain(t);
    }).catch(function(){ document.getElementById('findmsg').textContent='剪贴板不可读,请用 Ctrl+V' });
  }else document.getElementById('findmsg').textContent='剪贴板不可读,请用 Ctrl+V';
}

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
