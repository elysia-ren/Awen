// 端到端实测:①纸面打字(不按回车)同步延迟 ②图片调一次大小后再点 ③跨页全选删除 ④删空光标
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

// ── ① 纸面打字(不按回车):点进第一个"小时"段尾,连打 abc,测 gSrc 推进+纸面重渲延迟 ──
const p1 = await ev(`(function(){
  const paras=[...document.querySelectorAll('.paper [data-bid]')].filter(e=>e.textContent.trim()==='小时');
  const p=paras[0]; if(!p)return JSON.stringify({err:'no-para',n:paras.length});
  const r=p.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), bid:p.dataset.bid});
})()`);
console.log('target para:', p1);
const t1 = JSON.parse(p1);
if (!t1.err) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t1.x, y: t1.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t1.x, y: t1.y, button: 'left', clickCount: 1 });
  await sleep(150);
  // 光标移段尾
  await ev(`(function(){const sel=window.getSelection();const el=document.querySelector('.paper [data-bid="${t1.bid}"]');const rg=document.createRange();rg.selectNodeContents(el);rg.collapse(false);sel.removeAllRanges();sel.addRange(rg);return 'caret-end'})()`);
  // 打字期间打点:记录 gSrc 何时含新字符
  await ev(`window.__typeT0=null; document.querySelector('.paper').addEventListener('input',function once(){window.__typeT0=performance.now()},{once:true})`);
  for (const ch of 'abc') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: ch.charCodeAt(0) - 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: ch.charCodeAt(0) - 32 });
    await sleep(60);
  }
  const r1 = await ev(`(async function(){
    const t0=window.__typeT0||performance.now();
    const want='小时abc';
    const deadline=performance.now()+3000;
    let gsrcAt=-1;
    while(performance.now()<deadline){
      if(gsrcAt<0&&(window.gSrc||'').indexOf('abc')>=0)gsrcAt=Math.round(performance.now()-t0);
      const para=[...document.querySelectorAll('.paper [data-bid]')].find(e=>e.textContent.indexOf('abc')>=0);
      if(para&&gsrcAt>=0)return{gsrcMs:gsrcAt,domMs:Math.round(performance.now()-t0),paraText:para.textContent.slice(0,20)};
      await new Promise(r=>setTimeout(r,8));
    }
    return{gsrcMs:gsrcAt,domMs:-1,gsrc:(window.gSrc||'').slice(0,60)};
  })()`);
  console.log('① paper typing(no Enter):', JSON.stringify(r1));
}

// ── ② 图片:点击选中 → 拖角调一次大小 → 再点击 → 还能选中吗 ──
const img = await ev(`(function(){
  const im=document.querySelector('.paper img');
  if(!im)return JSON.stringify({err:'no-img'});
  const r=im.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width)});
})()`);
console.log('img:', img);
const ti = JSON.parse(img);
if (!ti.err) {
  const sel1 = await ev(`(function(){
    const im=document.querySelector('.paper img'); const r=im.getBoundingClientRect();
    const sel=window.getSelection(); const rg=document.createRange(); rg.selectNode(im); sel.removeAllRanges(); sel.addRange(rg);
    if(typeof onPaperClick==='function'){try{onPaperClick({target:im,clientX:r.x+r.width/2,clientY:r.y+r.height/2})}catch(e){}}
    im.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    im.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    im.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    return JSON.stringify({panelOpen:!!(document.querySelector('.img-panel,.obj-toolbar,[data-obj-panel]')||{}).style||document.querySelectorAll('.img-handle,.obj-handle').length, handles:document.querySelectorAll('.img-handle,.obj-handle,[data-handle]').length});
  })()`);
  console.log('② first click:', sel1);
  await sleep(200);
  // 模拟拖拽手柄调大小(若有手柄);没有则用键盘/面板路径——记录调宽后再点
  const r2 = await ev(`(async function(){
    // 调大小:找宽度输入或手柄;兜底:直接改 img width 属性模拟一次"已调过"状态
    const im=document.querySelector('.paper img');
    const before=im.getAttribute('width')||im.style.width||'';
    im.style.width='40%';
    await new Promise(r=>setTimeout(r,300));
    // 再点击
    const r=im.getBoundingClientRect();
    im.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    im.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    im.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
    await new Promise(r2=>setTimeout(r2,200));
    const sel=window.getSelection();
    const selOnImg=sel.rangeCount>0&&sel.getRangeAt(0).startContainer===im||sel.containsNode?sel.containsNode(im,false):false;
    const handles=document.querySelectorAll('.img-handle,.obj-handle,[data-handle]').length;
    return JSON.stringify({before:before, handles2:handles, selOnImg:selOnImg, selectable:!!im.closest('[data-selected],[data-obj-selected]')||im.classList.contains('selected')||im.parentElement.classList.contains('selected')});
  })()`);
  console.log('② after-resize re-click:', r2);
}

// ── ③ 跨页全选删除(需多页文档;当前 1 页,先验证单页 Ctrl+A 不坏,多页另测) ──
const r3 = await ev(`(async function(){
  const paper=document.querySelector('.paper');
  paper.focus();
  document.execCommand('selectAll');
  const sel=window.getSelection();
  const spans=sel.rangeCount?sel.toString().length:0;
  return JSON.stringify({selLen:spans});
})()`);
console.log('③ selectAll len:', r3);
// 清掉选区,别误删
await ev(`(function(){const sel=window.getSelection();sel.removeAllRanges();const paras=[...document.querySelectorAll('.paper [data-bid]')].filter(e=>e.textContent.trim()==='小时abc');if(paras[0]){const rg=document.createRange();rg.selectNodeContents(paras[0]);rg.collapse(false);sel.addRange(rg)}return 'ok'})()`);

ws.close(); process.exit(0);
