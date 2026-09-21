function exportFile(kind){
  if(kind==='txt'){saveWithPicker(fname('txt'),gSrc);return}
  if(kind==='md'){
    var out=[],lines=gSrc.split('\n');
    for(var i=0;i<lines.length;i++){
      var t=lines[i];
      if(/^@\[(page|margin|font|size|line-spacing|first-line|theme|toc|numbering)\s/.test(t))continue;
      if(/^@\[table/.test(t)||/^@\[\/table\]/.test(t))continue;
      if(/^@\[comment/.test(t)){while(i<lines.length&&lines[i].indexOf('@[/comment]')<0)i++;continue}
      var m=t.match(/^@\[image\s+([^\]]+)\]$/);
      if(m){out.push('!['+m[1]+']('+m[1]+')');continue}
      t=t.replace(/@\[link\s+([^\]]+?)\s+url:\s*([^\]]+)\]/g,'[$1]($2)');
      t=t.replace(/@\[u\]((?:.|])*?)@\[\/u\]/g,'<u>$1</u>');
      out.push(t);
    }
    saveWithPicker(fname('md'),out.join('\n'));
    return;
  }
  if(kind==='html'||kind==='doc'){
    var papers=document.querySelectorAll('#display-pane .paper');
    var body='';
    papers.forEach(function(pp){body+=pp.innerHTML});
    var html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Awen 文档</title><style>'
      +'body{margin:0;background:#e8e9eb}'
      +'.sheet{width:'+CFG.PAGE_W+'mm;min-height:'+CFG.PAGE_H+'mm;background:#fff;margin:16px auto;padding:'+CFG.MARGIN+'mm;box-sizing:border-box;font-family:Georgia,"Times New Roman","Noto Serif SC","Microsoft YaHei",serif;font-size:11pt;line-height:'+CFG.LINE_H+';color:#303238}'
      +'h1{font-size:22pt}h2{font-size:15pt}h3{font-size:13pt}h4{font-size:12pt}h5{font-size:11pt}h6{font-size:10.5pt}'
      +'p{text-indent:2em;margin:0}strong,b{font-weight:700}em,i{font-style:italic}del,s{text-decoration:line-through}u{text-decoration:underline}'
      +'code{font-family:Consolas,monospace;font-size:.87em;background:#f0f1f2;padding:1px 4px;border-radius:3px}'
      +'hr{border:none;border-top:1px solid #ccc}blockquote{border-left:3px solid #c8cad0;padding:2px 14px;color:#5a5c60;margin:0}'
      +'ul,ol{margin:0;padding-left:2.4em}table{width:100%;border-collapse:collapse;font-size:10.5pt}'
      +'th,td{border:1px solid #d0d2d5;padding:4px 8px;text-align:left}th{background:#f5f5f6}'
      +'.docset{color:#c8cad0;font-size:8pt}.comment-src{background:#fffbe8;color:#b09a3e;font-size:9pt}'
      +'</style></head><body>'+body+'</body></html>';
    saveWithPicker(fname(kind==='html'?'html':'doc'),html);
  }
}

function doPrint(){window.print()}
