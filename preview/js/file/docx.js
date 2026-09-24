// DOCX 导入(mammoth 本地分发;HTML → Awen 语法)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ DOCX 导入(mammoth 本地分发,离线可用;HTML → Awen 语法转换)═══
// importDocxFromBuffer:从 ArrayBuffer 完整导入(转换+wmf 批转 PNG+批量资源化),
// 文件对话框与自动化测试共用此入口。
function importDocxFromBuffer(buf){
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
  return mammoth.convertToHtml({arrayBuffer:buf},opts).then(function(res){
    // wmf/emf(公式 OLE 预览)照常产出 data URI,由 Rust 批量转 4x PNG
    // (PowerShell System.Drawing,Windows 自带 GDI 可渲染图元文件);
    // 转换失败的在下方替换时兜底为 〖公式〗 文本
    var hadVec=(res.value.match(/data:image\/(?:x-)?(?:wmf|emf)/g)||[]).length;
    var src=htmlToAwen(res.value);
    // 图片批量资源化进媒体目录,源码只留 media/ 引用(去重+一次 IPC+单遍替换)
    return tagMediaDir().then(function(dir){
      var re=/"(data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+)"/g;
      var uniq={},order=[],mm;
      while((mm=re.exec(src))!==null){
        var uri=mm[1];
        if(uniq[uri]===undefined){ uniq[uri]=order.length; order.push(uri) }
      }
      document.getElementById('st-diag').textContent='导入中:资源化 '+order.length+' 张图片…';
      return Bridge.batchResource(order,dir).then(function(refs){
        var map={};
        order.forEach(function(u,i){ if(refs[i])map[u]=refs[i] });
        // 单遍替换:有 ref 换 media/ 引用;wmf/emf 转换失败才落文本占位
        src=src.replace(/@\[image "(data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+)"\]/g,function(m0,u){
          if(map[u])return '@[image "'+map[u]+'"]';
          if(/wmf|emf/i.test(u))return '〖公式〗';
          return m0;
        });
        return {src:src,imgs:order.length,vec:hadVec};
      });
    });
  });
}
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
      importDocxFromBuffer(rd.result).then(function(r){
        var src=r.src;
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
        setTimeout(function(){
          document.getElementById('st-diag').textContent='诊断 ✓';
        },1200);
        alert('导入完成:图片 '+r.imgs+' 张已入包'+(r.vec?(';'+r.vec+' 个公式/矢量图以 〖公式〗 占位'):''));
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
      else if(tag==='A'){
        var href=n.getAttribute('href')||'';
        // 图片套链接/空文本不产 link 命令(空 inner 会产出 @[link url:] 裸串,
        // 内嵌 @[image] 会嵌套破坏语法)——保留内容,放弃超链接
        if(inner.trim()===''||inner.indexOf('@[')>=0||href==='')t+=inner;
        else t+='@[link '+inner+' url: '+href+']';
      }
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
