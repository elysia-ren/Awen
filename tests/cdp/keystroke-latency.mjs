// 逐键延迟:点进"小时"段尾,每 350ms 打一个字符,测每键 input→纸面 DOM 更新延迟
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')) });
let id = 0; const pend = {};
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id] } };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })) });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc');
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 焦点进第一段
const c = JSON.parse(await ev(`(function(){
  const ps=[...document.querySelectorAll('#display-pane .paper [data-bid]')].filter(e=>e.textContent.trim()==='小时');
  const p=ps[0]; const r=p.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
})()`));
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
await sleep(200);
await ev(`(function(){
  const ps=[...document.querySelectorAll('#display-pane .paper [data-bid]')].filter(e=>e.textContent.trim()==='小时');
  const el=ps[0]; const rg=document.createRange(); rg.selectNodeContents(el); rg.collapse(false);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(rg);
  window.__strokes=[];
  const paper=el.closest('.paper');
  paper.addEventListener('input',function(){window.__strokes.push({t:performance.now()})});
  return 'armed';
})()`);

const marks = [];
for (let i = 0; i < 6; i++) {
  const ch = String.fromCharCode(97 + i); // a..f
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: 65 + i });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: 65 + i });
  marks.push(await ev('performance.now()'));
  await sleep(350);
}
await sleep(600);
const r = await ev(`JSON.stringify({
  strokes: window.__strokes.map(x => Math.round(x.t)),
  para: [...document.querySelectorAll('#display-pane .paper [data-bid]')].find(e=>e.textContent.indexOf('abcdef')>=0)?.textContent.slice(0,12) || 'NOT-FOUND',
  src: (window.gSrc||'').split('\\n').find(l=>l.indexOf('abcdef')>=0) || 'src-missing'
})`);
const o = JSON.parse(r);
console.log('para:', o.para, '| src:', o.src);
// 每键延迟 = 下一个 input 时刻 - keyDown 时刻(粗测,含防抖)
for (let i = 0; i < marks.length && i < o.strokes.length; i++) {
  console.log(`stroke ${i}: ${o.strokes[i] - marks[i]}ms (keyDown→input)`);
}
ws.close(); process.exit(0);
