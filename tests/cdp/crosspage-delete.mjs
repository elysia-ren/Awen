// 跨页全选删除:载入多页文档 → 真实 Ctrl+A → Delete → 验证页清空+光标落在空文档
import { readFileSync } from 'node:fs';
const BIG = readFileSync('E:/个人项目/Awen文档/awen-proto-aine/build/big_src.awen', 'utf8');

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

await ev(`(function(){
  openDocument({ name: 'big-test', src: ${JSON.stringify(BIG)}, path: null });
  return 'issued';
})()`);
await sleep(3000);
console.log('load big:', await ev(`JSON.stringify({sheets:document.querySelectorAll('#display-pane .sheet').length,chars:(window.gSrc||'').length})`));

// 点进第一段 → 真实 Ctrl+A → 看 Range 是否跨页
const first = await ev(`(function(){
  const s=document.getElementById('display-pane'); s.scrollTop=0;
  const p=document.querySelector('#display-pane .paper [data-bid]');
  const r=p.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
})()`);
const fp = JSON.parse(first);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fp.x, y: fp.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fp.x, y: fp.y, button: 'left', clickCount: 1 });
await sleep(150);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
await sleep(250);
console.log('after ctrl+A:', await ev(`JSON.stringify({selLen:window.getSelection().toString().length,sheets:document.querySelectorAll('#display-pane .sheet').length})`));

// 真实 Delete
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
await sleep(600);
const after = await ev(`(async function(){
  const deadline=performance.now()+4000;
  while(performance.now()<deadline){
    const sheets=document.querySelectorAll('#display-pane .sheet').length;
    const len=(window.gSrc||'').trim().length;
    if(len<10){
      const sel=window.getSelection();
      const paper=document.querySelector('#display-pane .paper');
      const hasCaret=sel.rangeCount>0&&paper&&paper.contains(sel.getRangeAt(0).startContainer);
      return JSON.stringify({sheets:sheets,srcLen:len,hasCaret:hasCaret,gsrc:(window.gSrc||'').slice(0,30)});
    }
    await new Promise(r=>setTimeout(r,50));
  }
  return JSON.stringify({sheets:document.querySelectorAll('#display-pane .sheet').length,srcLen:(window.gSrc||'').length,TIMEOUT:true});
})()`);
console.log('after delete:', after);
// 落定态转储:等渲染彻底静止后再看
await sleep(2500);
console.log('settled:', await ev(`JSON.stringify({sheets:document.querySelectorAll('#display-pane .sheet').length,srcLen:(window.gSrc||'').length,nodes:(window.gNodes||[]).length,pend:!!window.renderPending,rev:window.sourceRevision,origin:(typeof lastCommitOrigin==='function')?lastCommitOrigin():'?',lastEdit:window.lastEditSource,hasCaret:(function(){const s=window.getSelection();const p=document.querySelector('#display-pane .paper');return !!(s.rangeCount&&p&&p.contains(s.getRangeAt(0).startContainer))})()})`));
ws.close(); process.exit(0);
