document.addEventListener('selectionchange',function(){
  if(mbTimer)clearTimeout(mbTimer);
  mbTimer=setTimeout(updateMinibar,140);
});

function updateMinibar(){
  var mb=document.getElementById('minibar');
  if(!mb)return;
  var sel=window.getSelection();
  var show=inDisplayMode()&&sel.rangeCount&&!sel.isCollapsed;
  if(!show){mb.style.display='none';return}
  var r=sel.getRangeAt(0);
  var node=r.startContainer;
  var inPaper=node.nodeType===1?(node.closest?node.closest('.paper'):null):(node.parentElement&&node.parentElement.closest('.paper'));
  if(!inPaper){mb.style.display='none';return}
  var rect=r.getBoundingClientRect();
  if(!rect||(!rect.width&&!rect.height)){mb.style.display='none';return}
  var tbl=(node.nodeType===1?node:node.parentElement).closest('table');
  document.getElementById('mb-table').style.display=tbl?'flex':'none';
  mb.style.display='flex';
  var x=Math.max(8,Math.min(rect.left,window.innerWidth-280));
  var y=rect.top-(tbl?96:44);
  if(y<140)y=rect.bottom+8;
  mb.style.left=x+'px';
  mb.style.top=y+'px';
}
