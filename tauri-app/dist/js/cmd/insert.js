// 块级插入 + 本地图片与原始行(自单文件版拆出;传统 script,全局变量直接共享)
function insertBlock(kind){
  var snippets={
    quote:['> 引用内容'],
    hr:['---'],
    link:['@[link 链接文字 url: https://example.com]'],
    image:null,
    table:['@[table demo]','| 列1 | 列2 |','| --- | --- |','| 内容 | 内容 |','@[/table]'],
    toc:['@[toc depth: 2]'],
    comment:['@[comment 批注内容,不参与渲染]'],
    footnote:['@[footnote 1 脚注内容]'],
    math:['@[m]','E = mc^2','@[/m]'],
    label:['@[label 引用名]']
  };
  if(kind==='image'){pickImageInsert();return}
  if(kind==='date'){
    var d=new Date();
    insertRawLine(d.getFullYear()+' 年 '+(d.getMonth()+1)+' 月 '+d.getDate()+' 日');
    return;
  }
  var ins=snippets[kind];
  if(!ins)return;
  var renameNew=(kind==='label'||kind==='link');   // 插入后选中占位文字,直接输入即改名
  if(inDisplayMode()){
    // 在当前块后插入新块
    var bel=caretBlock();
    var _caret=saveCaret();
    var insertAt=gSrc.split('\n').length;
    if(bel){
      var b=nodeByBid(bel.dataset.bid);
      if(b)insertAt=b.srcEnd;
    }
    var lines=gSrc.split('\n');
    var insert=ins.slice();
    if(insertAt<lines.length&&lines[insertAt].trim()!=='')insert=insert.concat(['']);
    if(insertAt>0&&lines[insertAt-1].trim()!=='')insert=[''].concat(insert);
    lines.splice.apply(lines,[insertAt,0].concat(insert));
    setSrc(lines.join('\n'));
    if(renameNew){
      // 选中刚插入块的占位文字(链接文字/书签名),直接输入即覆盖
      var nb=document.querySelectorAll('#display-pane [data-bid]');
      var lastBlk=nb[nb.length-1];
      if(lastBlk){
        var w=document.createTreeWalker(lastBlk,NodeFilter.SHOW_TEXT);
        var tn=w.nextNode();
        var rr=document.createRange();
        if(tn)rr.selectNodeContents(tn); else rr.selectNodeContents(lastBlk);
        var ss=window.getSelection(); ss.removeAllRanges(); ss.addRange(rr);
      }
      return;
    }
    restoreCaret(_caret);
  }else insertSyntax('\n'+ins.join('\n')+'\n');
}

function pickImageInsert(){
  // 原生对话框选图(Tauri)→ data URI 插入;保存 .awen 时自动资源化为 media/ 引用
  if(!(Bridge.native&&Bridge.pickImage))return;
  Bridge.pickImage().then(function(uri){
    if(uri)insertRawLine('@[image "'+uri+'"]');
  }).catch(function(e){ alert('插入图片失败:'+String(e).slice(0,120)) });
}
function insertRawLine(line){
  var bel=inDisplayMode()?caretBlock():null;
  var lines=gSrc.split('\n');
  var at=lines.length;
  if(bel){var b=nodeByBid(bel.dataset.bid);if(b)at=b.srcEnd}
  if(at<lines.length&&lines[at].trim()!=='')line=line+'\n';
  if(at>0&&lines[at-1].trim()!=='')line='\n'+line;
  lines.splice(at,0,line);
  setSrc(lines.join('\n'));
  // 插入位置若在视口外(如无光标时插到文尾),滚过去让用户看得见
  setTimeout(function(){
    var pane=document.getElementById('display-pane');
    if(pane&&pane.scrollTop+pane.clientHeight<pane.scrollHeight-60){
      pane.scrollTop=pane.scrollHeight;
    }
  },1000);
}

// 工具栏按钮按下不清除文字选区(Word 式行为)
