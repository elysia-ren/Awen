// DOCX 导入(mammoth 本地分发;HTML → Awen 语法)(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ DOCX 导入(mammoth 本地分发,离线可用;HTML → Awen 语法转换)═══
// importDocxFromBuffer:从 ArrayBuffer 完整导入(转换+wmf 批转 PNG+批量资源化),
// 文件对话框与自动化测试共用此入口。
function importDocxFromBuffer(buf,dimMap){
  // dimMap: {hash16:"WxH"}(Word 显示尺寸 mm,来自 core_docx_imgdims;
  // 与 batchResource 的 media 哈希同算法对齐,顺序无关)。可为 null。
  return Promise.resolve().then(function(){
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
  importProgShow('解析 DOCX 结构…');
  return new Promise(function(res){ setTimeout(res,60) }).then(function(){
    return mammoth.convertToHtml({arrayBuffer:buf},opts);
  }).then(function(res){
    importProgShow('转换为 Awen 语法…');
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
      // 分块批写(每块 200 张):进度条可见,wmf 转压分批进行
      var CH=200, refsAll=[], origAll=[];
      var seq=Promise.resolve();
      for(var c0=0;c0<order.length;c0+=CH){
        (function(c0){
          seq=seq.then(function(){
            var part=order.slice(c0,c0+CH);
            importProgShow('写入图片资源 '+Math.min(c0+part.length,order.length)+'/'+order.length, Math.min(100,Math.round((c0+part.length)/Math.max(1,order.length)*90)));
            return Bridge.batchResource(part,dir).then(function(res2){
              var pr=typeof res2==='string'?JSON.parse(res2):res2;
              refsAll=refsAll.concat(pr.refs||[]);
              origAll=origAll.concat(pr.orig||[]);
            });
          });
        })(c0);
      }
      return seq.then(function(){
        var map={};
        order.forEach(function(u,i){ if(refsAll[i])map[u]={ref:refsAll[i],orig:origAll[i]||''} });
        importProgShow('生成源码…',95);
        // 单遍替换:有 ref 换 media/ 引用;wmf/emf 转换失败才落文本占位。
        // 尺寸保真:按 ref 的内容哈希查 Word 显示尺寸(dimMap),写入命令
        src=src.replace(/@\[image "(data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+)"\]/g,function(m0,u){
          var ent=map[u];
          if(ent){
            var d=dimMap?dimMap[ent.orig]:null;
            if(d){
              var dm=d.split('x');
              return '@[image "'+ent.ref+'" width '+dm[0]+'mm height '+dm[1]+'mm]';
            }
            return '@[image "'+ent.ref+'"]';
          }
          if(/wmf|emf/i.test(u))return '〖公式〗';
          return m0;
        });
        return {src:src,imgs:order.length,vec:hadVec};
        });
      });
    });
  });
}
// ── 导入进度条(阶段式:解析/转换无回调显示不定态,批写有真实百分比) ──
function importProgShow(text,pct){
  var el=document.getElementById('import-prog');
  if(!el){
    el=document.createElement('div');
    el.id='import-prog';
    el.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(250,250,250,.75);display:flex;align-items:center;justify-content:center';
    el.innerHTML='<div style="background:#fff;border:1px solid #c9cbce;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:18px 22px;width:340px">'
      +'<div id="ip-text" style="font-size:13px;color:#333;margin-bottom:10px">准备导入…</div>'
      +'<div style="height:8px;background:#eef0f2;border-radius:4px;overflow:hidden"><div id="ip-bar" style="height:100%;width:0;background:#2f6fb3;border-radius:4px;transition:width .2s"></div></div>'
      +'</div>';
    document.body.appendChild(el);
  }
  el.querySelector('#ip-text').textContent=text;
  var bar=el.querySelector('#ip-bar');
  if(typeof pct==='number'){ bar.style.width=Math.max(3,pct)+'%' }
  else{ bar.style.width='38%' }
}
function importProgHide(){
  var el=document.getElementById('import-prog');
  if(el)el.remove();
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
      importProgShow('读取文件…');
      importDocxFromBuffer(rd.result,null).then(function(r){
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
        if(reuse){
          // 原位改字段保留 doc id(整对象替换会让 setSrc 的渲染 job 落地被拒)
          cur.name=name; cur.src=src; cur.dirty=false; cur.path=null;
          document.getElementById('docname').value=name;
          setSrc(src);
          renderFileTabs();
        }else{
          // 先立新标签身份再 setSrc(同 openDocument)
          addFileTab(name,null);
          document.getElementById('docname').value=name;
          setSrc(src);
          openFiles[activeFile].src=gSrc;
        }
        currentFilePath=null;
        updateTitle(); markClean();
        importProgShow('渲染文档…',100);
        setTimeout(function(){ importProgHide() },1200);
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
