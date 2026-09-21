// 行号栏 / 光标存取与定位(自单文件版拆出;传统 script,全局变量直接共享)
function updateGutter(){
  var g=document.getElementById('gutter');
  var ta=document.getElementById('syntax-src');
  if(!g||!ta)return;
  var n=ta.value.split('\n').length;
  if(g.dataset.count!==String(n)){
    var out='';
    for(var i=1;i<=n;i++)out+='<div class="ln" data-ln="'+i+'">'+i+'</div>';
    g.innerHTML=out; g.dataset.count=String(n);
  }
}
// 当前行高亮:光标所在行(语法视图)
function setGutterCur(line){
  var g=document.getElementById('gutter');
  if(!g)return;
  var prev=g.querySelector('.ln.cur');
  if(prev)prev.classList.remove('cur');
  var el=g.querySelector('.ln[data-ln="'+line+'"]');
  if(el){
    el.classList.add('cur');
    // 当前行在窗格视口外时滚动窗格(行号与文本同滚动流,窗格是唯一滚动层)
    var pane=document.getElementById('syntax-pane');
    if(!pane)return;
    var top=el.offsetTop, h=el.offsetHeight;
    var pTop=pane.scrollTop, pH=pane.clientHeight;
    if(top<pTop||top+h>pTop+pH)pane.scrollTop=Math.max(0,top-pH/2);
  }
}
function caretLineNumber(){
  var ta=document.getElementById('syntax-src');
  if(!ta)return 1;
  return ta.value.substring(0,ta.selectionStart).split('\n').length;
}
function applySyncNow(){
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
  if(lastEditSource==='syntax'||currentMode==='syntax'){
    // 语法视图/语法侧编辑:输入框即源码权威(§85),不再从纸面 DOM 反写
    var ta=document.getElementById('syntax-src');
    var taVal=ta?ta.value:'';
    if(taVal===gSrc)return;
    gSrc=taVal;
    if(currentMode==='split')render(gSrc);
    updateDiagBar();
      return;
  }
  // 纸面编辑:DOM 序列化回写源码(纸面即真实,不立即重建 DOM);
  // 节流后交 Aine 权威解析,返回后按需重排并恢复光标
  // 权威渲染在途时 DOM 还是旧结构:推迟 flush,防止旧内容覆盖 gSrc
  if(renderPending){ setTimeout(applySyncNow,300); return }
  var newSrc=Engine.serializeAll();
  // 尾随空行无语义:undo 恢复的源码常带尾 \n,serializeAll 不产出——视为同一内容,
  // 否则 doUndo/doRedo 开头的 flush 会把规范化差异当新编辑,截断撤销链
  if(newSrc===gSrc||newSrc===gSrc.replace(/\s+$/,''))return;
  gSrc=newSrc;
  var ta=document.getElementById('syntax-src');
  if(ta)ta.value=gSrc;
  recordHist(gSrc,true);
  var caret=saveCaret();
  scheduleNativeRefresh(caret);
  updateDiagBar();
}
// 节流的权威重排:输入暂停后交 native 解析
var refreshTimer=null,refreshCaret=null;
function scheduleNativeRefresh(caret){
  refreshCaret=caret||refreshCaret||null;
  if(refreshTimer)clearTimeout(refreshTimer);
  refreshTimer=setTimeout(function(){
    refreshTimer=null;
    var c=refreshCaret; refreshCaret=null;
    render(gSrc,c);
  },500);
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
// 跨页合并:Backspace 在页首块起点 / Delete 在页尾块终点
