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
