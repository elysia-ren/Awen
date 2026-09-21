const expr = `(async function(){
  var out=[];
  var urls=['js/main.js','js/core/caret.js','js/state.js','engine.js','bridge.js','js/file/open-save.js'];
  for(var i=0;i<urls.length;i++){
    try{
      var r=await fetch(urls[i]);
      var t=await r.text();
      out.push(urls[i]+' -> '+r.status+' '+(r.headers.get('content-type')||'?')+' len='+t.length+' 首='+(t.split('\n')[0]||'').slice(0,40));
    }catch(e){ out.push(urls[i]+' ERR '+e.message) }
  }
  return out;
})()`;
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) });
let id = 0; const pend = {};
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id] } };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })) });
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
console.log(JSON.stringify(r.result?.result?.value, null, 1));
ws.close(); process.exit(0);
