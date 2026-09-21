// 状态栏:诊断数据源 / 字数统计(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ 原生引擎(桌面版):诊断刷新 + 打开时权威初渲染 ═══
var nativeDiags=null, nativeTimer=null;
function allDiags(){
  if(nativeDiags&&nativeDiags.src===gSrc)return nativeDiags.ds;
  return [];
}

// ═══ 字数统计对话框 ═══
function showWordCount(){
  var chars=0, charsSp=0, paras=0, words=0;
  var paper=document.querySelector('#display-pane .paper');
  if(paper){
    var txt=paper.textContent;
    charsSp=txt.replace(/\s{2,}/g,' ').trim().length;
    chars=txt.replace(/\s/g,'').length;
    paras=gNodes.filter(function(n){return n.kind==='para'||n.kind==='heading'}).length;
  }
  var pop=document.getElementById('diagpop');
  pop.innerHTML='<div style="font-weight:600;margin-bottom:6px">字数统计</div>'
    +'<div>字数(不计空格): <b>'+chars+'</b></div>'
    +'<div>字符数(计空格): <b>'+charsSp+'</b></div>'
    +'<div>段落数: <b>'+paras+'</b></div>'
    +'<div>页数: <b>'+gPages.length+'</b></div>';
  pop.style.display='block';
  setTimeout(function(){pop.style.display='none'},4000);
}
