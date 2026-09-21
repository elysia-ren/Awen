function updateGutter(){
  var g=document.getElementById('gutter');
  var ta=document.getElementById('syntax-src');
  if(!g||!ta)return;
  var n=ta.value.split('\n').length;
  var out='';
  for(var i=1;i<=n;i++)out+='<div class="ln" data-ln="'+i+'">'+i+'</div>';
  if(g.dataset.count!==String(n)){ g.innerHTML=out; g.dataset.count=String(n) }
  g.scrollTop=ta.scrollTop;
}

function setGutterCur(line){
  var g=document.getElementById('gutter');
  if(!g)return;
  var prev=g.querySelector('.ln.cur');
  if(prev)prev.classList.remove('cur');
  var el=g.querySelector('.ln[data-ln="'+line+'"]');
  if(el){ el.classList.add('cur');
    // 保证当前行可见
    var top=el.offsetTop, h=el.offsetHeight;
    var gTop=g.scrollTop, gH=g.clientHeight;
    if(top<gTop||top+h>gTop+gH)g.scrollTop=Math.max(0,top-gH/2);
  }
}

function caretLineNumber(){
  var ta=document.getElementById('syntax-src');
  if(!ta)return 1;
  return ta.value.substring(0,ta.selectionStart).split('\n').length;
}

function saveCaret(){
  var s=window.getSelection();
  if(!s.rangeCount)return null;
  var node=s.getRangeAt(0).startContainer;
  var blk=node.nodeType===1?(node.closest?node.closest('[data-bid]'):null):(node.parentElement&&node.parentElement.closest('[data-bid]'));
  if(!blk)return null;
  var r=s.getRangeAt(0).cloneRange();
  r.selectNodeContents(blk);
  r.setEnd(s.getRangeAt(0).endContainer,s.getRangeAt(0).endOffset);
  return{bid:blk.dataset.bid,off:r.toString().length};
}

function restoreCaret(c){
  if(!c)return;
  var el=document.querySelector('#display-pane [data-bid="'+c.bid+'"]');
  if(!el)return;
  var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT), n, left=c.off, last=null, first=null;
  while((n=walker.nextNode())){ if(first===null)first=n; if(n.length>=left){ setSel(n,left); focusPaper(el); return } left-=n.length; last=n }
  if(last){ setSel(last,last.length) } else if(first){ setSel(first,0) }
  focusPaper(el);
}

function setSel(node,off){
  var r=document.createRange(); r.setStart(node,off); r.collapse(true);
  var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

function focusPaper(el){
  var p=el.closest?el.closest('.paper'):null;
  if(p&&p.focus)p.focus({preventScroll:true});
}

function textLen(el){ return (el.textContent||'').length }

document.addEventListener('selectionchange',function(){
  if(posTimer)clearTimeout(posTimer);
  posTimer=setTimeout(function(){ updateCaretPos(); updateAlignState() },150);
});

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

function selectAllDoc(){
  var p=document.querySelector('#display-pane .paper');
  if(p&&currentMode!=='syntax'){ p.focus(); document.execCommand('selectAll') }
  else{ var ta=document.getElementById('syntax-src'); if(ta){ta.focus();ta.select()} }
}

function caretBlock(){
  var s=window.getSelection();
  if(!s.rangeCount)return null;
  var node=s.getRangeAt(0).startContainer;
  return node.nodeType===1?(node.closest?node.closest('[data-bid]'):null):(node.parentElement&&node.parentElement.closest('[data-bid]'));
}
