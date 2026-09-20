// CDP evaluate:_cdp_eval.mjs '<js 表达式>'
const expr = process.argv[2];
if (!expr) { console.error('usage: _cdp_eval.mjs <expr>'); process.exit(1) }
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws error')) });
let msgId = 0; const pending = {};
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id] } };
const send = (method, params = {}) => new Promise(res => { const i = ++msgId; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })) });
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
if (r.result && r.result.exceptionDetails) {
  console.log('EXCEPTION:', (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
  process.exit(2);
}
console.log(JSON.stringify(r.result?.result?.value, null, 1));
ws.close();
process.exit(0);
