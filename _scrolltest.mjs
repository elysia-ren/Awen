// 分屏滚动锚定 + 渲染兜底 验证
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws'))});
let id=0; const pend={};
ws.onmessage = ev => { const d=JSON.parse(ev.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} };
const send=(m,p={})=>new Promise(res=>{const i=++id;pend[i]=res;ws.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  return r.result&&r.result.result?JSON.stringify(r.result.result.value):'NOVALUE';};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

await ev(`setSrc('# 第一\\n\\n第一段。\\n\\n## 第二\\n\\n第二段。\\n\\n## 第三\\n\\n第三段。\\n')`);
await sleep(900);
await ev(`setMode('split')`);
await sleep(700);
// 语法滚到"第三"附近
await ev(`(function(){var sp=document.getElementById('syntax-pane');var ta=document.getElementById('syntax-src');var idx=ta.value.indexOf('## 第三');var line=ta.value.slice(0,idx).split('\\n').length-1;sp.scrollTop=line*13*1.8;return 'scrolled to line '+line})()`);
await sleep(400);
const r1=await ev(`(function(){
  var dp=document.getElementById('display-pane');
  var best=null,bestTop=1e9;
  dp.querySelectorAll('.paper>[data-bid]').forEach(function(el){
    var t=el.offsetTop-dp.offsetTop;
    if(t<=dp.scrollTop+80&&t<bestTop){bestTop=t;best=el}
  });
  return best?best.textContent.slice(0,12):'none';
})()`);
console.log('display top block after syntax scroll:',r1);
// 显示滚到底→语法应到尾
await ev(`(function(){var dp=document.getElementById('display-pane');dp.scrollTop=dp.scrollHeight;return 1})()`);
await sleep(400);
const r2=await ev(`(function(){
  var ta=document.getElementById('syntax-src');
  var lines=ta.value.split('\\n').length;
  var approxLine=Math.round(document.getElementById('syntax-pane').scrollTop/(13*1.8));
  return 'syntaxLine≈'+approxLine+'/'+lines;
})()`);
console.log('display bottom →',r2);
ws.close();setTimeout(()=>process.exit(0),80);
