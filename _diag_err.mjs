const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ev => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return }
  if (d.method === 'Runtime.exceptionThrown') {
    const e = d.params.exceptionDetails;
    errors.push((e.exception && e.exception.description || e.text || '').slice(0, 250));
  }
  if (d.method === 'Log.entryAdded') {
    errors.push('[log] ' + (d.params.entry.text || '').slice(0, 250));
  }
};
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload');
await new Promise(r => setTimeout(r, 6000));
console.log('页面错误 ' + errors.length + ' 条:');
errors.slice(0, 10).forEach((e, i) => console.log('--', i + 1, '--\n', e));
ws.close(); process.exit(0);
