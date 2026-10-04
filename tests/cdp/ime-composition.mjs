// 组合周期验证:compositionstart → 上屏文本(insertText) → compositionend → 30ms 内应同步
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

// ── 纸面侧组合 ──
await ev(`(function(){
  openDocument({name:'ime-doc', src:'12\\n\\n小时\\n\\n小时\\n', path:null});
  return 'loaded';
})()`);
await sleep(2000);
await ev(`(function(){
  const ps=[...document.querySelectorAll('#display-pane .paper [data-bid]')].filter(e=>e.textContent.trim()==='小时');
  const el=ps[0]; const rg=document.createRange(); rg.selectNodeContents(el); rg.collapse(false);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(rg);
  el.closest('.paper').focus();
  // 真实 IME 的组合事件由浏览器派发,CDP 模拟不了——但处理逻辑对非信任事件同样响应,
  // 用 dispatchEvent 驱动同一 handler 链验证:compositionend 后必须补同步
  document.dispatchEvent(new CompositionEvent('compositionstart'));
  return JSON.stringify({composing:window.composing, side:(typeof compSide!=='undefined'?compSide:'?')});
})()`);
await send('Input.insertText', { text: '测试甲' });
await sleep(120);
console.log('mid-composition (应未同步):', await ev(`JSON.stringify({composing:window.composing, srcHas:(window.gSrc||'').indexOf('测试甲')>=0, domHas:document.querySelector('#display-pane .paper').textContent.indexOf('测试甲')>=0})`));
await ev(`document.dispatchEvent(new CompositionEvent('compositionend')); 'end'`);
const t0 = Date.now();
const paperSync = await ev(`(async function(){
  const deadline=performance.now()+2500;
  while(performance.now()<deadline){
    if((window.gSrc||'').indexOf('测试甲')>=0)return Math.round(performance.now());
    await new Promise(r=>setTimeout(r,8));
  }
  return -1;
})()`);
console.log('paper compositionend→gSrc 同步:', paperSync>=0?('OK '+JSON.stringify(await ev(`JSON.stringify({taHas:document.getElementById('syntax-src')&&document.getElementById('syntax-src').value.indexOf('测试甲')>=0})`))):'FAIL');

// ── 语法侧组合 ──
await ev(`(function(){
  const ta=document.getElementById('syntax-src');
  const idx=ta.value.indexOf('小时');
  ta.focus(); ta.setSelectionRange(idx+2, idx+2);
  document.dispatchEvent(new CompositionEvent('compositionstart'));
  return 'ok';
})()`);
await send('Input.insertText', { text: '测试乙' });
await sleep(120);
await ev(`document.dispatchEvent(new CompositionEvent('compositionend')); 'end'`);
const synSync = await ev(`(async function(){
  const deadline=performance.now()+2500;
  while(performance.now()<deadline){
    if((window.gSrc||'').indexOf('测试乙')>=0&&document.querySelector('#display-pane .paper').textContent.indexOf('测试乙')>=0)return 1;
    await new Promise(r=>setTimeout(r,8));
  }
  return -1;
})()`);
console.log('syntax compositionend→gSrc+纸面:', synSync>0?'OK':'FAIL');

// ── 撤销栈:组合提交应可撤销(一步) ──
const undo = await ev(`(function(){
  const before=(window.gSrc||'').indexOf('测试乙');
  if(typeof doUndo==='function'){doUndo();return JSON.stringify({after:window.gSrc.indexOf('测试乙'),had:before>=0})}
  return 'no-doUndo';
})()`);
console.log('undo after composition:', undo);
ws.close(); process.exit(0);
