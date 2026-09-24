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

function tagMediaDir(){
  // 每个标签一个媒体子目录;无则生成并确保存在(插入即入包)
  if(window.awenMediaDir)return Promise.resolve(window.awenMediaDir);
  var name='session-'+Date.now()+'-'+Math.floor(Math.random()*1000000);
  return Bridge.mediaEnsure(name).then(function(dir){
    window.awenMediaDir=dir;
    if(activeFile>=0&&openFiles[activeFile])openFiles[activeFile].media_dir=dir;
    return dir;
  });
}

function pickImageInsert(){
  // 原生对话框选图 → 立即写入当前文档媒体目录(源码只留 media/ 引用),
  // 保存 .awen 时按引用收进容器
  if(!(Bridge.native&&Bridge.pickImage))return;
  tagMediaDir().then(function(dir){
    return Bridge.pickImage(dir);
  }).then(function(res){
    if(res&&res.ref)insertRawLine('@[image "'+res.ref+'"]');
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


// ═══ 页眉/页脚/页码:文档级 @[header]/@[footer] 设置行(置顶)═══
function upsertDocsetLine(cmdKey, text){
  var NLg=String.fromCharCode(10);
  var lines=gSrc.split(NLg);
  var re=new RegExp('^@\\['+cmdKey+'(?:\\s|\\])');
  var found=-1;
  for(var i=0;i<lines.length;i++){ if(re.test(lines[i])){ found=i; break } }
  var line=text===''?null:('@['+cmdKey+' '+text+']');
  if(found>=0){ if(line===null){ lines.splice(found,1); } else { lines[found]=line; } }
  else if(line!==null){ lines.unshift(line); }
  else return;
  setSrc(lines.join(NLg));
}
function insertHeaderBar(){
  var m=gSrc.match(/^@\[header ([^\]]*)\]/m);
  var t=prompt('页眉内容(显示在每页顶部):',m?m[1]:'');
  if(t===null)return;
  upsertDocsetLine('header',t);
}
function insertFooterBar(){
  var m=gSrc.match(/^@\[footer ([^\]]*)\]/m);
  var t=prompt('页脚内容(%p = 页码):',m?m[1]:'第 %p 页');
  if(t===null)return;
  upsertDocsetLine('footer',t);
}
function togglePageNumField(){
  if(/@\[footer [^\]]*%p/.test(gSrc)){ upsertDocsetLine('footer',''); return }
  upsertDocsetLine('footer','第 %p 页');
}


// ═══ 首字下沉 / 行号 ═══
function toggleDropcap(){
  var blk=caretBlock();
  if(!blk||blk.dataset.kind!=='para'){ alert('请先将光标放在段落内'); return }
  var node=gNodes[+blk.dataset.bid];
  var NLg=String.fromCharCode(10);
  var lines=gSrc.split(NLg);
  var li=node.srcStart;
  var t=lines[li]||'';
  if(t.indexOf('@[dropcap]')===0){
    lines[li]=t.replace('@[dropcap]','').replace('@[/dropcap]','');
  }else{
    var first=t.charAt(0);
    if(!first)return;
    lines[li]='@[dropcap]'+first+'@[/dropcap]'+t.slice(1);
  }
  setSrc(lines.join(NLg));
}
function toggleLineNumbers(){
  var on=/@\[linenumbers\s+on\s*\]/.test(gSrc);
  upsertDocsetLine('linenumbers',on?'off':'on');
}
