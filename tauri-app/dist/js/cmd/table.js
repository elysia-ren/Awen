// 表格行列操作与插入网格弹窗(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 表格行列操作 ═══
function inTable(){ var b=caretBlock(); return b&&b.closest?b.closest('table'):null }
function selTr(){
  var s=window.getSelection();
  if(!s.rangeCount)return null;
  var n=s.getRangeAt(0).startContainer;
  var el=n.nodeType===1?n:n.parentElement;
  return el?el.closest('tr'):null;
}
function selCell(){
  var s=window.getSelection();
  if(!s.rangeCount)return null;
  var n=s.getRangeAt(0).startContainer;
  var el=n.nodeType===1?n:n.parentElement;
  return el?el.closest('th,td'):null;
}
function tblInsRow(){
  var tbl=inTable(); if(!tbl)return;
  var tr=selTr();
  var nr=tr.cloneNode(true);
  nr.querySelectorAll('th,td').forEach(function(c){c.textContent=''});
  tr.parentNode.insertBefore(nr,tr.nextSibling);
  onPaperInput();
}
function tblDelRow(){
  var tbl=inTable(); if(!tbl)return;
  var body=tbl.querySelector('tbody')||tbl;
  if(body.querySelectorAll('tr').length<=1)return;
  var tr=selTr();
  if(tr)tr.parentNode.removeChild(tr);
  onPaperInput();
}
function tblInsCol(){
  var tbl=inTable(); if(!tbl)return;
  var ref=selCell();
  tbl.querySelectorAll('tr').forEach(function(tr){
    var cell=document.createElement('td');
    if(ref&&tr.contains(ref))cell=document.createElement(ref.tagName);
    tr.insertBefore(cell,tr.lastElementChild.nextSibling);
  });
  onPaperInput();
}
function tblDelCol(){
  var tbl=inTable(); if(!tbl)return;
  var ref=selCell();
  var idx=ref?Array.prototype.indexOf.call(ref.parentNode.children,ref):0;
  var rows=tbl.querySelectorAll('tr');
  var cols=rows[0].querySelectorAll('th,td').length;
  if(cols<=1)return;
  rows.forEach(function(tr){ var c=tr.children[idx]; if(c)tr.removeChild(c) });
  onPaperInput();
}

// ═══ 表格行列选择 ═══
var tblPopAnchor=null;
function toggleTblPop(btn){
  var pop=document.getElementById('tblpop');
  var open=pop.style.display!=='flex';
  if(open){
    var r=btn.getBoundingClientRect();
    pop.style.left=r.left+'px';
    pop.style.top=(r.bottom+6)+'px';
  }
  pop.style.display=open?'flex':'none';
  tblPopAnchor=caretBlock();
}
document.addEventListener('click',function(e){
  var pop=document.getElementById('tblpop');
  if(pop&&pop.style.display==='flex'&&!e.target.closest('#tblpop')&&!e.target.closest('[onclick^="toggleTblPop"]'))pop.style.display='none';
});
function insertTableGrid(){
  var rows=parseInt(document.getElementById('tbl-rows').value)||3;
  var cols=parseInt(document.getElementById('tbl-cols').value)||3;
  rows=Math.max(1,Math.min(20,rows)); cols=Math.max(1,Math.min(8,cols));
  var ins=['@[table demo]'];
  var head='|',sep='|';
  for(var c=0;c<cols;c++){head+=' 列'+(c+1)+' |';sep+=' --- |'}
  ins.push(head);ins.push(sep);
  for(var r=1;r<rows;r++){
    var row='|';
    for(var c2=0;c2<cols;c2++)row+=' 内容 |';
    ins.push(row);
  }
  ins.push('@[/table]');
  var lines=gSrc.split('\n');
  var at=lines.length;
  var bel=inDisplayMode()?caretBlock():null;
  if(bel){var b=nodeByBid(bel.dataset.bid);if(b)at=b.srcEnd}
  if(at<lines.length&&lines[at].trim()!=='')ins=ins.concat(['']);
  if(at>0&&lines[at-1].trim()!=='')ins=[''].concat(ins);
  lines.splice.apply(lines,[at,0].concat(ins));
  document.getElementById('tblpop').style.display='none';
  setSrc(lines.join('\n'));
}


// ═══ 表格样式参数(光标所在表格的开行参数开关;经 data-open 序列化保真)═══
function tableToggleParam(param){
  var blk=caretBlock();
  if(!blk||blk.dataset.kind!=='table'){ alert('请先将光标放在表格内'); return }
  var node=gNodes[+blk.dataset.bid];
  if(!node||node.kind!=='table'){ alert('请先将光标放在表格内'); return }
  var open=node.open||('@[table]');
  var re=new RegExp('\\s*'+param.replace(/[:]/g,'\\:'),'i');
  var nl;
  if(re.test(open)){
    nl=open.replace(re,'').replace(/\s+/g,' ').replace(/\s*\]/,']');
  }else{
    nl=open.replace(/\]\s*$/,' '+param+']');
  }
  spliceSrcLine(node.srcStart,nl);
}
function spliceSrcLine(lineIdx,newText){
  var NL=String.fromCharCode(10);
  var lines=gSrc.split(NL);
  lines[lineIdx]=newText;
  setSrc(lines.join(NL));
}
function cellsOfRow(r){
  return r.replace(/^\||\|$/g,'').split('|').map(function(x){return x.trim()});
}
// 表格排序:按指定列升序(数字按值,其余按中文/locale);表头与分隔行固定
function tableSort(col){
  var blk=caretBlock();
  if(!blk||blk.dataset.kind!=='table'){ alert('请先将光标放在表格内'); return }
  var node=gNodes[+blk.dataset.bid];
  if(!node||!node.rows||node.rows.length<4){ alert('表格没有可排序的数据行'); return }
  if(col==null){
    // 按光标所在列排序
    var s=window.getSelection();
    col=0;
    if(s.rangeCount){
      var cell=s.getRangeAt(0).startContainer.parentElement;
      var td=cell.closest?cell.closest('td,th'):null;
      var tr=td?td.parentElement:null;
      if(tr){ var cs=[...tr.children]; var ix=cs.indexOf(td); if(ix>0)col=ix }
    }
  }
  var rows=node.rows.slice();
  var head=rows.slice(0,2);           // 表头 + 分隔行
  var body=rows.slice(2);
  body.sort(function(a,b){
    var ca=(cellsOfRow(a)[col]||''),cb=(cellsOfRow(b)[col]||'');
    var na=parseFloat(ca.replace(/[^0-9.\-]/g,'')),nb=parseFloat(cb.replace(/[^0-9.\-]/g,''));
    if(!isNaN(na)&&!isNaN(nb)&&ca.match(/[0-9]/)&&cb.match(/[0-9]/))return na-nb;
    return ca.localeCompare(cb,'zh');
  });
  var all=head.concat(body);
  var NLg=String.fromCharCode(10);
  var lines=gSrc.split(NLg);
  var base=node.srcStart+1;
  for(var i=0;i<all.length;i++)lines[base+i]=all[i];
  setSrc(lines.join(NLg));
}
