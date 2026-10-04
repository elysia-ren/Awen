const expr = process.argv[2];
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) });
let id = 0; const pend = {};
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id] } };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })) });
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
if (r.result?.exceptionDetails) { console.log('EXC:', r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); process.exit(2) }
console.log(JSON.stringify(r.result?.result?.value, null, 1));
ws.close(); process.exit(0);
