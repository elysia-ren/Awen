// 图片二连点复现:真鼠标点图 → 面板开 → 改宽 40% → 应用 → 再点 → 面板应再开
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
const click = async (x, y, n = 1) => {
  for (let i = 0; i < n; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(80);
  }
};
const imgPos = () => ev(`(function(){const im=document.querySelector('#display-pane img, .paper img');if(!im)return'null';const r=im.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width})})()`);
const panelOpen = () => ev(`!!document.getElementById('image-pop')`);

// 第一次点击
let p = JSON.parse(await imgPos());
await click(p.x, p.y);
await sleep(250);
console.log('click#1 panel:', await panelOpen());

// 面板在场:改宽 40 → 应用(真鼠标点应用按钮)
if (await panelOpen()) {
  const okBtn = await ev(`(function(){const b=document.getElementById('img-ok');const r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()`);
  const wIn = await ev(`(function(){const i=document.getElementById('img-w');i.value='40';i.dispatchEvent(new Event('input',{bubbles:true}));return 'w-set'})()`);
  const bo = JSON.parse(okBtn);
  await click(bo.x, bo.y);
  await sleep(600);   // setSrc→render 落地
  console.log('after apply: srcImgLine=', await ev(`(window.gSrc||'').split('\\n').filter(l=>l.indexOf('@[image')>=0)[0]||'none'`));
}

// 第二次点击(关键:调过大小后还能不能点出面板)
p = JSON.parse(await imgPos());
await click(p.x, p.y);
await sleep(300);
const panel2 = await panelOpen();
console.log('click#2 panel (THE BUG TEST):', panel2);

// 第三次点(排除偶然)
if (!panel2) {
  p = JSON.parse(await imgPos());
  await click(p.x, p.y, 2);
  await sleep(300);
  console.log('click#3 panel:', await panelOpen());
}
ws.close(); process.exit(0);
