import fs from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.log('no page'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) });
let id = 0; const pend = {};
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id] } };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })) });
const expr = "(function(){ var x=new XMLHttpRequest(); x.open('GET','index.html',false); x.send(); var h=x.responseText; var tags=(h.match(/<script[^>]*src=\"[^\"]*\"/g)||[]).join(' || '); return { len: h.length, tags: tags, hasStateTag: h.indexOf('js/state.js')>=0, hasCaretTag: h.indexOf('js/core/caret.js')>=0 }; })()";
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(r.result?.result?.value));
ws.close(); process.exit(0);
