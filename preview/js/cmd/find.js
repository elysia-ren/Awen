// 查找替换(含语法视图源内查找)(自单文件版拆出;传统 script,全局变量直接共享)
function replaceEntry(){ toggleFind(); setTimeout(function(){ document.getElementById('replacebox').focus() },60) }
function selectAllDoc(){
  var p=document.querySelector('#display-pane .paper');
  if(p&&currentMode!=='syntax'){ p.focus(); document.execCommand('selectAll') }
  else{ var ta=document.getElementById('syntax-src'); if(ta){ta.focus();ta.select()} }
}

// ═══ 查找替换 ═══
function toggleFind(){
  var bar=document.getElementById('findbar');
  var open=bar.style.display==='none'||!bar.style.display;
  bar.style.display=open?'block':'none';
  if(open){document.getElementById('findbox').focus();findCount()}
}
function closeFind(){
  document.getElementById('findbar').style.display='none';
}
function cs0(){return document.getElementById('cb-case')&&document.getElementById('cb-case').checked}
function cw0(){return document.getElementById('cb-whole')&&document.getElementById('cb-whole').checked}
// 统一匹配引擎:区分大小写 + 全字匹配(\b 边界);返回所有命中起点
function matchStarts(hay,q,cs,whole){
  var starts=[];
  if(whole){
    var esc=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re=new RegExp('\\b(?:'+esc+')\\b',cs?'g':'gi');
    var m;
    while((m=re.exec(hay))!==null){ starts.push(m.index); if(m.index===re.lastIndex)re.lastIndex++ }
    return starts;
  }
  var h=cs?hay:hay.toLowerCase(), needle=cs?q:q.toLowerCase();
  var pos=0;
  while((pos=h.indexOf(needle,pos))>=0){ starts.push(pos); pos+=needle.length }
  return starts;
}
function findIdxOf(src,q,from){
  var starts=matchStarts(src,q,cs0(),cw0());
  for(var i=0;i<starts.length;i++){ if(starts[i]>=from)return starts[i] }
  return starts.length?starts[0]:-1;
}
function findCount(){
  var q=document.getElementById('findbox').value;
  var msg=document.getElementById('findmsg');
  highlightAll(q);
  if(!q){msg.textContent='';return}
  var n=matchStarts(gSrc,q,cs0(),cw0()).length;
  msg.textContent=n?('找到 '+n+' 处'):'未找到';
}
function highlightAll(q){
  if(!(window.CSS&&CSS.highlights))return;
  CSS.highlights.delete('findhit');
  if(!q||!inDisplayMode())return;
  var ranges=[];
  document.querySelectorAll('#display-pane .paper').forEach(function(paper){
    var walker=document.createTreeWalker(paper,NodeFilter.SHOW_TEXT),node;
    var texts=[],nodes=[];
    while((node=walker.nextNode())){nodes.push(node);texts.push(node.textContent)}
    var hay=texts.join('');
    var starts=matchStarts(hay,q,cs0(),cw0());
    if(!starts.length)return;
    var bounds=[],acc=0;
    nodes.forEach(function(n){bounds.push([acc,acc+n.length]);acc+=n.length});
    starts.forEach(function(st){
      var en=st+q.length;
      var r1=null,r2=null;
      for(var i=0;i<nodes.length;i++){
        if(st>=bounds[i][0]&&st<bounds[i][1])r1={n:nodes[i],o:st-bounds[i][0]};
        if(en>bounds[i][0]&&en<=bounds[i][1])r2={n:nodes[i],o:en-bounds[i][0]};
      }
      if(r1&&r2){var rg=document.createRange();rg.setStart(r1.n,r1.o);rg.setEnd(r2.n,r2.o);ranges.push(rg)}
    });
  });
  // Highlight 构造器是变参:必须展开 ranges,传数组会被当 Range 校验抛 TypeError,高亮静默失效
  if(ranges.length){try{CSS.highlights.set('findhit',new Highlight(...ranges))}catch(e){}}
}
function findNext(){
  var q=document.getElementById('findbox').value;
  if(!q)return;
  if(inDisplayMode()){
    if(!window.find(q,cs0()))document.getElementById('findmsg').textContent='已到结尾';
  }else{
    var ta=document.getElementById('syntax-src');
    var from=ta.selectionEnd;
    var i=findIdxOf(gSrc,q,from);
    if(i<0)i=findIdxOf(gSrc,q,0);
    if(i>=0){ta.focus();ta.setSelectionRange(i,i+q.length)}
  }
}
function findPrev(){
  var q=document.getElementById('findbox').value;
  if(!q)return;
  if(inDisplayMode()){
    if(!window.find(q,cs0(),true))document.getElementById('findmsg').textContent='已到开头';
  }else{
    var ta=document.getElementById('syntax-src');
    var before=gSrc.substring(0,ta.selectionStart||0).lastIndexOf(q);
    if(before>=0){ta.focus();ta.setSelectionRange(before,before+q.length)}
    else document.getElementById('findmsg').textContent='已到开头';
  }
}
function replaceOne(){
  var q=document.getElementById('findbox').value;
  var r=document.getElementById('replacebox').value;
  if(!q)return;
  var src=gSrc;
  var i;
  var ta=document.getElementById('syntax-src');
  if(inDisplayMode()&&window.getSelection&&!window.getSelection().isCollapsed){
    i=saveCaret()?src.indexOf(q):src.indexOf(q);
  }else if(ta&&document.activeElement===ta){
    i=src.indexOf(q,ta.selectionStart);
  }else{
    i=src.indexOf(q);
  }
  if(i<0)i=src.indexOf(q);
  if(i<0){document.getElementById('findmsg').textContent='未找到';return}
  setSrc(src.substring(0,i)+r+src.substring(i+q.length));
  document.getElementById('findmsg').textContent='已替换 1 处';
}
function replaceAll(){
  var q=document.getElementById('findbox').value;
  var r=document.getElementById('replacebox').value;
  if(!q)return;
  var cs=cs0(),whole=cw0();
  var starts=matchStarts(gSrc,q,cs,whole);
  if(!starts.length){
    highlightAll(q);
    document.getElementById('findmsg').textContent='未找到';
    return;
  }
  var out='',last=0;
  starts.forEach(function(st){
    out+=gSrc.substring(last,st)+r;
    last=st+q.length;
  });
  out+=gSrc.substring(last);
  setSrc(out);
  highlightAll(q);
  document.getElementById('findmsg').textContent='已替换 '+starts.length+' 处';
}
