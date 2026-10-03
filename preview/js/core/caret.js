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
  if(window.composing)return;   // 输入法组合中:中间态不入源码
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
  if(lastEditSource==='syntax'||currentMode==='syntax'){
    // 语法视图/语法侧编辑:输入框即源码权威(§85),不再从纸面 DOM 反写
    var ta=document.getElementById('syntax-src');
    var taVal=ta?ta.value:'';
    if(taVal===gSrc)return;
    commitSource(taVal,'syntax');
    if(currentMode==='split')syntaxIncrRender(taVal);
    updateDiagBar();
      return;
  }
  // 纸面编辑:DOM 序列化回写源码(纸面即真实,不立即重建 DOM);
  // 节流后交 Aine 权威解析,返回后按需重排并恢复光标
  // 权威渲染在途时 DOM 还是旧结构:推迟 flush,防止旧内容覆盖 gSrc
  if(renderPending){ setTimeout(applySyncNow,300); return }
  // 最小源补丁:优先只替换变化的段(保留未动段的方言/空行风格),
  // 结构变化(bid 映射断裂)时 patchSource 返回 null → 回退 serializeAll
  var newSrc=Engine.patchSource(Engine.serializeSegments());
  if(newSrc===null)newSrc=Engine.serializeAll();
  // 尾随空行无语义:undo 恢复的源码常带尾 \n,serializeAll 不产出——视为同一内容,
  // 否则 doUndo/doRedo 开头的 flush 会把规范化差异当新编辑,截断撤销链
  if(newSrc===gSrc||newSrc===gSrc.replace(/\s+$/,'')){
    // 幂等:但分屏下语法框可能落后于 gSrc(如撤销后的恢复),补齐
    if(currentMode!=='display')taSafeWrite(gSrc);
    return;
  }
  commitSource(newSrc,'paper');
  taSafeWrite(gSrc);
  recordHist(gSrc,true);
  var caret=saveCaret();
  scheduleNativeRefresh(caret);
  updateDiagBar();
}
// 节流的权威重排:输入暂停后先试块级增量(O(脏段),纸面基本不动),
// 增量不适用(结构变化/跨页截断/分页数变)才回退全量解析+重建
var refreshTimer=null,refreshCaret=null;
function scheduleNativeRefresh(caret){
  refreshCaret=caret||refreshCaret||null;
  if(refreshTimer)clearTimeout(refreshTimer);
  refreshTimer=setTimeout(function(){
    refreshTimer=null;
    var c=refreshCaret; refreshCaret=null;
    if(window.composing){ scheduleNativeRefresh(c); return }
    if(Date.now()-(window.lastPaperInputAt||0)<400){ scheduleNativeRefresh(c); return }
    try{
      if(incrRefresh(saveCaret()))return;
    }catch(e){ console.error('增量刷新失败,回退全量',e) }
    render(gSrc,c);
  },300);
}
function saveCaret(){
  var s=window.getSelection();
  if(!s.rangeCount)return null;
  var node=s.getRangeAt(0).startContainer;
  var blk=node.nodeType===1?(node.closest?node.closest('[data-bid]'):null):(node.parentElement&&node.parentElement.closest('[data-bid]'));
  if(!blk){
    // 光标不在任何块内:跨页选区(Ctrl+A)的起点在 display-pane 层(纸面之间),
    // 删空后兜底光标也可能落在 .paper 本体——都按"该纸首个块/空文档占位"恢复
    var holder=node.nodeType===1?node:node.parentElement;
    var paper=holder&&holder.closest?holder.closest('.paper'):null;
    if(!paper&&holder&&holder.id==='display-pane')paper=holder.querySelector('.paper');
    if(!paper&&holder&&holder.closest&&holder.closest('#display-pane'))paper=holder.closest('#display-pane').querySelector('.paper');
    if(!paper)return null;
    blk=paper.querySelector('[data-bid]');
    // 纸面无任何块(跨页全删后的旧 DOM):新渲染必是空文档,占位段恒 bid='0'
    if(!blk)return{bid:'0',off:0};
    return{bid:blk.dataset.bid,off:0};
  }
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
  if(last){ setSel(last,last.length) } else if(first){ setSel(first,0) } else { setSel(el,0) }
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


// ── 语法侧增量渲染:行级 diff → 脏段 → parse_blocks → 原位替换 ──
// 语法侧 DOM(纸面)是旧的,incrRefresh 的"DOM vs cache"比对无效;
// 此前走全量 render(整篇 parse+重建,85KB ~700ms)。这里以 ta 文本
// 对比 gSrc 的行差异定位脏段,只重解析脏段(~20ms),纸面原位替换。
function syntaxIncrRender(newSrc){
  var job=makeJobRev();   // (doc, revision):新提交使旧批次自然失效
  var cache=gSegCache;
  if(!cache.length){render(newSrc);return}
  var newLines=newSrc.split('\n');
  // 以节点 span 为单位对比文本(与 buildSegCache 同构)
  var dirty=[];
  var cursor=0; // 行游标: 节点按文档序铺满(空行对齐)
  for(var i=0;i<cache.length;i++){
    var c=cache[i];
    var end=c.start+cSpanLines(cache,i,newLines,cursor);
    if(end<0){dirty.push(i);break} // 对不上→保守全量
    var segTxt=newLines.slice(c.start,end).join('\n');
    var norm=function(t){return (t||'').replace(/\n/g,'')};
    if(norm(segTxt)!==norm(c.text))dirty.push(i);
    cursor=end;
  }
  if(!dirty.length)return; // 没脏段(理论不到这,前面已 short-circuit)
  // 结构敏感:脏段导致行偏移变化时(span 错位),回退全量
  var reqs=dirty.map(function(di){return {bid:String(di),text:segTextOf(newLines,cache,di)}});
  Bridge.parseBlocks(reqs).then(function(res){
    if(!isCurrent(job))return; // 被更新的提交取代
    var map={};
    (res&&res.nodes||[]).forEach(function(n){
      var di=+n.bid;
      map[di]=Engine.segRecsToNodes(n.res&&n.res.blocks||[],cache[di].start);
    });
    // 逐脏段校验(与 incrRefresh.finish 同规):节点数/kind 不变才原位替换
    var ops=[];
    for(var d=0;d<dirty.length;d++){
      var di2=dirty[d],nodes=map[di2],c2=cache[di2];
      if(!c2||!nodes||nodes.length!==c2.count||c2.nodeStart<0){render(newSrc);return}
      for(var k=0;k<nodes.length;k++){
        if(nodes[k].kind!==gNodes[c2.nodeStart+k].kind){render(newSrc);return}
      }
      ops.push({start:c2.nodeStart,nodes:nodes});
    }
    for(var o=ops.length-1;o>=0;o--){
      [].splice.apply(gNodes,[ops[o].start,ops[o].nodes.length].concat(ops[o].nodes));
    }
    for(var d2=0;d2<dirty.length;d2++)cache[dirty[d2]].text=segTextOf(newLines,cache,dirty[d2]);
    for(var o2=0;o2<ops.length;o2++){
      for(var k2=0;k2<ops[o2].nodes.length;k2++){
        var idx=ops[o2].start+k2;
        gNodes[idx].bid=idx;
        if(!replaceSegBlock(idx,gNodes[idx])){render(newSrc);return}
      }
    }
    renderOutline();renderStatus();
  }).catch(function(){render(newSrc)});
}
// 节点 i 的源文本文本(以行 span 取,结构变化时可能取空→由校验兜底)
function segTextOf(newLines,cache,di){
  var c=cache[di];
  var next=cache[di+1];
  var end=next?next.start:newLines.length;
  if(end<c.start)end=c.start;
  return newLines.slice(c.start,end).join('\n');
}
// 估算节点占行数(空行对齐:节点间空行对数量由后续节点 start 反推)
function cSpanLines(cache,i,newLines,cursor){
  var c=cache[i];
  var next=cache[i+1];
  if(next){
    if(next.start<c.start)return -1; // span 错位(行数变化)→ 保守全量
    return next.start-c.start;
  }
  return newLines.length-c.start;
}