// 浮动迷你工具栏与对齐/字数状态(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 浮动迷你工具栏 ═══
var mbTimer=null;
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
// 光标位置跟踪(状态栏)+ 段落对齐激活态
var posTimer=null;
document.addEventListener('selectionchange',function(){
  if(posTimer)clearTimeout(posTimer);
  posTimer=setTimeout(function(){ updateCaretPos(); updateAlignState() },150);
});
function updateAlignState(){
  var map={al:'justifyLeft',ac:'justifyCenter',ar:'justifyRight',aj:'justifyFull'};
  for(var id in map){
    var b=document.getElementById(id);
    if(!b)continue;
    var on=false;
    try{ on=inDisplayMode()&&document.queryCommandState(map[id]) }catch(e){}
    b.classList.toggle('on',on);
  }
}
function updateCaretPos(){
  var el=document.getElementById('st-pos');
  if(!el)return;
  var c=saveCaret();
  if(!c){el.textContent='第 1 页 · 行 1, 列 1';return}
  var blk=document.querySelector('#display-pane [data-bid="'+c.bid+'"]');
  var page=1;
  if(blk){
    var sheets=document.querySelectorAll('#display-pane .sheet');
    for(var i=0;i<sheets.length;i++){
      if(sheets[i].contains(blk)){page=i+1;break}
    }
  }
  var line=c.bid, col=c.off+1;
  for(var j=0;j<gNodes.length;j++){ if(gNodes[j].bid==c.bid){line=gNodes[j].srcStart+1;break} }
  el.textContent='第 '+page+' 页 · 行 '+line+', 列 '+col;
}
