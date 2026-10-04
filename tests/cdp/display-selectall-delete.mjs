// 显示视图单页全选删除复现:载入用户类文档 → display 模式 → 点进文本 → Ctrl+A → Delete → 观察回退
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

// 载入用户类文档(有图有段落,单页)
await ev(`(function(){
  if(typeof setMode==='function'){try{setMode('display')}catch(e){}}
  openDocument({name:'user-sim', src:'12\\n\\n小时\\n\\n小时\\n\\n\\n\\n\\n小时\\n\\n@[image "media/img-468df0dc.png" width 50% align center]', path:null});
  window.awenMediaDir='C:/Users/Elysia/AppData/Local/AwenEditor/media';
  if(activeFile>=0&&openFiles[activeFile])openFiles[activeFile].media_dir=window.awenMediaDir;
  return currentMode;
})()`);
await sleep(2500);
console.log('loaded:', await ev(`JSON.stringify({mode:currentMode,src:(window.gSrc||'').length,sheets:document.querySelectorAll('#display-pane .sheet').length,img:!!document.querySelector('#display-pane img')})`));

// 点进第一个段落
const c = JSON.parse(await ev(`(function(){
  const p=document.querySelector('#display-pane .paper [data-bid]');
  const r=p.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+40),y:Math.round(r.y+r.height/2)});
})()`));
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
await sleep(200);

// 真实 Ctrl+A(modifiers:2)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
await sleep(250);
console.log('after ctrl+A:', await ev(`JSON.stringify({selLen:window.getSelection().toString().length,papers:document.querySelectorAll('#display-pane .paper').length})`));

// 真实 Delete
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });

// 高频采样 gSrc/DOM 2.5 秒,看内容是否回来
const t0 = Date.now();
const seen = new Set();
while (Date.now() - t0 < 2500) {
  const s = JSON.parse(await ev(`JSON.stringify({t:Date.now()%100000,src:(window.gSrc||'').length,dom:document.querySelector('#display-pane .paper')?document.querySelector('#display-pane .paper').textContent.trim().length:-1,pending:!!window.renderPending})`));
  const k = JSON.stringify([s.src, s.dom, s.pending]);
  if (!seen.has(k)) { seen.add(k); console.log(JSON.stringify(s)); }
  await sleep(60);
}
console.log('final:', await ev(`JSON.stringify({src:(window.gSrc||'').slice(0,30),domTxt:document.querySelector('#display-pane .paper').textContent.trim().slice(0,20)})`));
ws.close(); process.exit(0);
