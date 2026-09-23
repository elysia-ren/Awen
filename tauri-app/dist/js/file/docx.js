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
      // mammoth 默认忽略图片且只认英文样式名:显式转换图片为 data URI,
      // 并补充中文 Word 样式名映射(标题 1/标题 2…),否则格式全部丢失
      var opts={
        styleMap:[
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='标题'] => h1:fresh",
          "p[style-name='标题 1'] => h1:fresh",
          "p[style-name='标题 2'] => h2:fresh",
          "p[style-name='标题 3'] => h3:fresh",
          "p[style-name='标题 4'] => h4:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh"
        ],
        convertImage:mammoth.images.imgElement(function(image){
          return image.readAsBase64String().then(function(b64){
            return {src:'data:'+image.contentType+';base64,'+b64};
          });
        })
      };
      mammoth.convertToHtml({arrayBuffer:rd.result},opts).then(function(res){
        var src=htmlToAwen(res.value);
        // 文档里的图片立即资源化进媒体目录,源码只留 media/ 引用
        return tagMediaDir().then(function(dir){
          var jobs=[];
          var re=/"(data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+)"/g;
          var found=[];var mm;
          while((mm=re.exec(src))!==null)found.push(mm[1]);
          found.forEach(function(uri){
            jobs.push(Bridge.dataUriResource(uri,dir).then(function(r2){
              src=src.replace('"'+uri+'"','"'+r2.ref+'"');
            }));
          });
          return Promise.all(jobs).then(function(){return src});
        });
      }).then(function(src){
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
      else if(tag==='IMG'){
        // data URI 图片(mammoth convertImage 产出)→ 带引号的图片引用,
        // 保存 .awen 容器时自动资源化为 media/ 文件
        var src=n.getAttribute('src')||'';
        if(src)t+='@[image "'+src+'"]';
        return;
      }
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
      else if(tag==='IMG'){
        // 顶层图片(mammoth convertImage → data URI):保留真实引用
        var src=n.getAttribute('src')||'';
        if(src){ out.push('@[image "'+src+'"]'); out.push('') }
      }
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
