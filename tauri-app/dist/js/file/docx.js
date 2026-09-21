// DOCX 导入(mammoth 本地分发;HTML → Awen 语法)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ DOCX 导入(mammoth 本地分发,离线可用;HTML → Awen 语法转换)═══
function importDocx(){
  if(typeof mammoth==='undefined'){ alert('转换库未加载(vendor/mammoth.browser.min.js 缺失)'); return }
  var inp=document.createElement('input');
  inp.type='file'; inp.accept='.docx';
  inp.style.display='none';
  document.body.appendChild(inp);
  inp.onchange=function(){
    var f=inp.files[0];
    if(!f){ inp.remove(); return }
    var rd=new FileReader();
    rd.onload=function(){
      mammoth.convertToHtml({arrayBuffer:rd.result}).then(function(res){
        var src=htmlToAwen(res.value);
        var name=f.name.replace(/\.docx$/i,'');
        inp.remove();
        var reuse=false;
        if(activeFile>=0){
          applySyncNow();
          var cur=openFiles[activeFile];
          reuse=(cur.name==='未命名文档'&&!docDirty);
          if(!reuse){ cur.src=gSrc; cur.dirty=docDirty }
        }
        document.getElementById('docname').value=name;
        setSrc(src);
        if(reuse){ openFiles[activeFile]={name:name,src:gSrc,dirty:false,path:null}; renderFileTabs() }
        else addFileTab(name,null);
        currentFilePath=null;
        updateTitle(); markClean();
      }).catch(function(e){ inp.remove(); alert('DOCX 解析失败:'+e.message) });
    };
    rd.readAsArrayBuffer(f);
  };
  inp.click();
}
// 导出的 HTML → Awen 源码
function htmlToAwen(html){
  var doc=new DOMParser().parseFromString(html,'text/html');
  var out=[];
  function inline(node){
    var t='';
    node.childNodes.forEach(function(n){
      if(n.nodeType===3){ t+=n.textContent; return }
      if(n.nodeType!==1)return;
      if(n.tagName==='BR'){ t+=' '; return }
      var inner=inline(n);
      var tag=n.tagName;
      if(tag==='STRONG'||tag==='B')t+='**'+inner+'**';
      else if(tag==='EM'||tag==='I')t+='_'+inner+'_';
      else if(tag==='U')t+='@[u]'+inner+'@[/u]';
      else if(tag==='DEL'||tag==='S')t+='~~'+inner+'~~';
      else if(tag==='CODE')t+='`'+inner+'`';
      else if(tag==='A'){ var href=n.getAttribute('href')||''; t+='@[link '+inner+' url: '+href+']' }
      else t+=inner;
    });
    return t;
  }
  function walk(node){
    node.childNodes.forEach(function(n){
      if(n.nodeType!==1)return;
      var tag=n.tagName;
      if(/^H[1-6]$/.test(tag)){ out.push('#'.repeat(+tag.charAt(1))+' '+inline(n).trim()); out.push('') }
      else if(tag==='P'){ var t=inline(n).trim(); if(t){ out.push(t); out.push('') } }
      else if(tag==='BLOCKQUOTE'){
        var qs=n.querySelectorAll('p');
        if(qs.length)qs.forEach(function(q){ var t=inline(q).trim(); if(t)out.push('> '+t) });
        else{ var t0=inline(n).trim(); if(t0)out.push('> '+t0) }
      }
      else if(tag==='UL'||tag==='OL'){
        var idx=0;
        n.querySelectorAll(':scope > li').forEach(function(li){
          idx++;
          var t=inline(li).replace(/\s+/g,' ').trim();
          if(t)out.push((tag==='UL'?'- ':idx+'. ')+t);
        });
        out.push('');
      }
      else if(tag==='TABLE'){
        out.push('@[table imported]');
        var first=true;
        n.querySelectorAll('tr').forEach(function(tr){
          var cells=[];
          tr.querySelectorAll('th,td').forEach(function(c){ cells.push(inline(c).replace(/\|/g,'/').trim()) });
          out.push('| '+cells.join(' | ')+' |');
          if(first){ var sep='|'; for(var i=0;i<cells.length;i++)sep+=' --- |'; out.push(sep); first=false }
        });
        out.push('@[/table]');
        out.push('');
      }
      else if(tag==='IMG'){ out.push('@[image imported-image]'); out.push('') }
      else if(tag==='HR'){ out.push('---') }
      else walk(n);
    });
  }
  walk(doc.body);
  var res=[],blank=0;
  out.forEach(function(l){
    if(l===''){ blank++; if(blank<=1)res.push(l) }
    else{ blank=0; res.push(l) }
  });
  return res.join('\n');
}
// ═══ 真实图片:选本地文件,嵌入 data URI ═══
