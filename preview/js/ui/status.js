function allDiags(){
  if(nativeDiags&&nativeDiags.src===gSrc)return nativeDiags.ds;
  if(CORE_DIAGS.length)return CORE_DIAGS;
  return Engine.quickDiags(gSrc);
}

function updateAlignState(){
  var map={al:'justifyLeft',ac:'justifyCenter',ar:'justifyRight',aj:'justifyFull'};
  for(var id in map){
    var b=document.getElementById(id);
    if(!b)continue;
    var on=false;
    try{ on=inDisplayMode()&&document.queryCommandState(map[id]) }catch(e){}
    b.classList.toggle('on',on);
  }
}

function updateDiagBar(){
  var ds=allDiags();
  var errs=ds.filter(function(d){return d.sev==='err'}).length;
  var warns=ds.length-errs;
  var el=document.getElementById('st-diag');
  if(!el)return;
  if(!ds.length){el.textContent='诊断 ✓';el.style.background='transparent'}
  else{el.textContent='诊断 '+errs+' 错误 '+warns+' 警告';el.style.background=errs?'#a33d2f':'#8a6d1a'}
  window._diagList=ds;
}
