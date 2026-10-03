// 编辑同步入口:纸面输入 → 序列化 → 节流权威解析;键盘块级操作(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 编辑同步:输入 → 序列化 → 必要时重排 ═══
var repagTimer=null,lastEditSource=null;
// 中文输入法组合期间:挂起序列化与权威重建——组合中间态(拼音串)一旦
// 进入源码并触发纸面重建,会把输入法正在组词的文本拦腰清掉(用户看到的
// "输入回退")。compositionend 后再走正常节流同步。
var composing=false;
var compSide=null;   // 组合发生在哪一侧:compositionend 补同步时归属 lastEditSource
document.addEventListener('compositionstart',function(){
  composing=true;
  // 组合期间 input 被吞,onPaperInput 不更新 lastEditSource——若此前编辑过
  // 语法侧,compositionend 补同步会误走语法分支,把纸面刚上屏的文本回退掉
  var ae=document.activeElement;
  compSide=(ae&&ae.id==='syntax-src')?'syntax':((ae&&ae.closest&&ae.closest('#display-pane'))?'paper':(lastEditSource||'paper'));
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
});
document.addEventListener('compositionend',function(){
  composing=false;
  window.lastPaperInputAt=Date.now();
  // 上屏文本的最终 input 在 compositionend 之前到达(已被 composing 吞掉),
  // 之后不再有 input:必须在此补一步同步,否则中文打完源码不推进——
  // 按 Enter(产生 composition 外的 input)才同步的根因
  if(compSide){
    lastEditSource=compSide;
    if(compSide==='syntax'){var ta=document.getElementById('syntax-src');if(ta)recordHist(ta.value,true)}
    compSide=null;
  }
  if(repagTimer)clearTimeout(repagTimer);
  repagTimer=setTimeout(applySyncNow,30);
});
function onPaperInput(e){
  window.lastPaperInputAt=Date.now();
  if(composing)return;   // 组合中间态不进源码
  if(repagTimer)clearTimeout(repagTimer);
  // 标点成步:句末标点立即落一步,且下一笔必开新语义步
  var punct=e&&e.data&&/[。？！，、；：.?!]/.test(e.data.slice(-1));
  if(punct){ applySyncNow(); histTime=0; return }
  repagTimer=setTimeout(applySyncNow,30);
}
function swapSplit(){
  var ws=document.querySelector('.workspace');
  var dp=document.getElementById('display-pane');
  var sp=document.getElementById('syntax-pane');
  var st=document.getElementById('splitter');
  if(!dp||!sp||!ws)return;
  // 语法窗格当前在显示窗格之前 → 换回显示在前;否则换语法在前
  if(sp.compareDocumentPosition(dp)&Node.DOCUMENT_POSITION_FOLLOWING){
    ws.insertBefore(dp,sp);
    if(st)ws.insertBefore(st,sp);
  }else{
    ws.insertBefore(sp,dp);
    if(st)ws.insertBefore(st,dp);
  }
}

function onPaperKey(e){
  // Ctrl+A 跨页全选:每页 .paper 是独立可编辑岛,原生全选只覆盖光标所在页。
  // 手工构造跨越全部纸面的 Range(文档级全选,Word 行为)。
  // 跨页选区上的 Delete/Backspace:浏览器拒绝在多个独立编辑岛间删除,
  // 程序性 deleteContents 后交回同步链(序列化→解析→整版重建)
  if((e.key==='Delete'||e.key==='Backspace')&&!e.ctrlKey&&!e.altKey){
    var papersAll=document.querySelectorAll('#display-pane .paper');
    var _sel=window.getSelection();
    if(papersAll.length>1&&_sel&&_sel.rangeCount&&!_sel.isCollapsed){
      var sr=_sel.getRangeAt(0);
      // 容器可能是文本节点或元素节点;closest 需在元素上调用
      var _node=function(n){return n.nodeType===1?n:(n.parentElement||null)};
      var sp0=_node(sr.startContainer), sp1=_node(sr.endContainer);
      sp0=sp0&&sp0.closest?sp0.closest('#display-pane .paper'):null;
      sp1=sp1&&sp1.closest?sp1.closest('#display-pane .paper'):null;
      // 跨页(起点/终点不同岛)或选区横跨岛外结构(sheet/gap):都走程序性删除
      if((sp0&&sp1&&sp0!==sp1)||(!sp0||!sp1)){
        e.preventDefault();
        sr.deleteContents();
        // 清掉被删空的中间页
        document.querySelectorAll('#display-pane .sheet').forEach(function(sh){
          var pp=sh.querySelector('.paper');
          if(pp&&!pp.textContent.trim()&&!pp.querySelector('img'))sh.remove();
        });
        document.getElementById('display-pane').dispatchEvent(new Event('input',{bubbles:true}));
        // 删空后立刻把光标放进首张白纸的占位段(不等重渲,用户可继续输入)
        setTimeout(function(){
          var ph=document.querySelector('#display-pane .paper [data-bid="0"], #display-pane .paper');
          if(ph){ph.focus();var sc=document.createRange();sc.selectNodeContents(ph);sc.collapse(true);var ss=window.getSelection();ss.removeAllRanges();ss.addRange(sc)}
        },50);
        return
      }
    }
  }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key==='a'){
    var papers=document.querySelectorAll('#display-pane .paper');
    if(papers.length>1){
      e.preventDefault();
      var sel=window.getSelection(); if(!sel)return;
      var r=document.createRange();
      r.setStartBefore(papers[0]);
      r.setEndAfter(papers[papers.length-1]);
      sel.removeAllRanges(); sel.addRange(r);
      return
    }
  }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='b'){ e.preventDefault(); fmtCmd('bold'); return }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='i'){ e.preventDefault(); fmtCmd('italic'); return }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='u'){ e.preventDefault(); fmtCmd('underline'); return }
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){ e.preventDefault(); doSave(); return }
  if(e.key==='Enter'&&e.target.closest&&e.target.closest('table')){ e.preventDefault(); return }
  // 普通段落内的回车:手动拆块,不交给浏览器——浏览器拆分会克隆整块 DOM
  // (包括 data-bid),产生重复 bid;后续光标按旧 bid 恢复会跳回前一段,
  // 用户看到的就是"回车换行后输入回退"
  if(e.key==='Enter'&&!e.shiftKey&&e.target.closest&&e.target.closest('#display-pane .paper')){
    e.preventDefault();
    var sel=window.getSelection();
    if(!sel.rangeCount)return;
    var r0=sel.getRangeAt(0);
    var curBlk=r0.startContainer.nodeType===1
      ?(r0.startContainer.closest?r0.startContainer.closest('#display-pane [data-bid]'):null)
      :(r0.startContainer.parentElement?r0.startContainer.parentElement.closest('#display-pane [data-bid]'):null);
    if(!curBlk)return;
    var r=sel.getRangeAt(0).cloneRange();
    if(!r.collapsed)r.deleteContents();
    var tailFrag=r.cloneContents();
    var maxBid=0;
    document.querySelectorAll('#display-pane [data-bid]').forEach(function(x){maxBid=Math.max(maxBid,+x.dataset.bid||0)});
    var newB=document.createElement('p');
    newB.contentEditable='true';
    while(tailFrag.firstChild)newB.appendChild(tailFrag.firstChild);
    if(!newB.firstChild)newB.appendChild(document.createTextNode(''));
    newB.dataset.bid=String(maxBid+1);
    newB.dataset.kind='para';
    var gap=curBlk.nextElementSibling;
    if(!(gap&&gap.classList.contains('gap'))){
      gap=document.createElement('div'); gap.className='gap'; gap.contentEditable='false';
      curBlk.parentNode.insertBefore(gap,curBlk.nextSibling);
    }
    gap.parentNode.insertBefore(newB,gap.nextSibling);
    var nr=document.createRange();nr.setStart(newB,0);nr.collapse(true);
    sel.removeAllRanges();sel.addRange(nr);
    onPaperInput();
    return;
  }
  if(e.key==='Backspace'){
    var c=saveCaret();
    if(c&&c.off===0){
      var el=document.querySelector('#display-pane [data-bid="'+c.bid+'"]');
      var paper=el&&el.closest('.paper');
      if(paper){
        var first=paper.querySelector('[data-bid]');
        if(first===el&&+c.bid>0){
          var prev=nodeByBid(+c.bid-1);
          if(prev&&prev.kind!=='table'&&prev.kind!=='obj'){ e.preventDefault(); mergeBlocks(+c.bid-1,+c.bid) }
        }
      }
    }
  }
  else if(e.key==='Delete'){
    var c2=saveCaret();
    if(c2){
      var el2=document.querySelector('#display-pane [data-bid="'+c2.bid+'"]');
      var paper2=el2&&el2.closest('.paper');
      if(paper2){
        var blocks=paper2.querySelectorAll('[data-bid]');
        var lastEl=blocks[blocks.length-1];
        var len=textLen(lastEl);
        if(lastEl===el2&&c2.off>=len){
          var next=nodeByBid(+c2.bid+1);
          if(next&&next.kind!=='table'&&next.kind!=='obj'){ e.preventDefault(); mergeBlocks(+c2.bid,+c2.bid+1) }
        }
      }
    }
  }
}
function textLen(el){ return (el.textContent||'').length }
function nodeByBid(bid){
  for(var i=0;i<gNodes.length;i++){ if(gNodes[i].bid==bid)return gNodes[i] }
  return null;
}
function mergeBlocks(keepBid,goneBid){
  var keep=nodeByBid(keepBid), gone=nodeByBid(goneBid);
  if(!keep||!gone)return;
  // 表格/对象/代码等结构块不可被合并压平(源码整段丢失);且合并是结构
  // 操作,必须先 flush DOM 差异并清掉在途守卫,否则 render 守卫分支会用
  // 未合并的旧 DOM 反写 gSrc(合并静默撤销)
  if(keep.kind==='table'||keep.kind==='obj'||keep.kind==='code'||gone.kind==='table'||gone.kind==='obj'||gone.kind==='code')return;
  if(repagTimer){clearTimeout(repagTimer);repagTimer=null}
  if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}
  applySyncNow();
  var keepEl=document.querySelector('#display-pane [data-bid="'+keepBid+'"]');
  var goneEl=document.querySelector('#display-pane [data-bid="'+goneBid+'"]');
  var keepText=keepEl?Engine.inlineSource(keepEl).trim():Engine.displayText(keep.text);
  var goneText=goneEl?Engine.inlineSource(goneEl).trim():Engine.displayText(gone.text);
  var junction=keepText.length;
  var lines=gSrc.split('\n');
  var mergedLine=Engine.blockPrefix(keep.kind,keep.level)+(keepText+' '+goneText).replace(/\s+/g,' ').trim();
  lines.splice(keep.srcStart,gone.srcEnd-keep.srcStart,mergedLine);
  var caret={bid:keepBid,off:junction+1};
  // render 异步:光标经 caret 参数在权威解析回调里恢复(同步 restoreCaret 会扑空)
  render(lines.join('\n'),caret);
  recordHist(gSrc,false);
}
