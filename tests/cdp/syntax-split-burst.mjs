// 分屏语法侧打字延迟剖析:逐键 keyDown→纸面 DOM 更新延迟 + render/parseBlocks 计数 + 长任务
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

// 0) 切分屏 + 载入用户文档
await ev(`(function(){
  if(typeof setMode==='function'){setMode('split')} else {currentMode='split';document.getElementById('syntax-pane').style.display='flex'}
  openDocument({name:'img-doc', src:'12\\n\\n小时\\n\\n小时\\n\\n\\n\\n\\n小时\\n\\n@[image "media/img-468df0dc.png" width 50% align center]', path:null});
  window.awenMediaDir='C:/Users/Elysia/AppData/Local/AwenEditor/media';
  if(activeFile>=0&&openFiles[activeFile])openFiles[activeFile].media_dir=window.awenMediaDir;
  return currentMode;
})()`);
await sleep(2500);
console.log('mode/pages:', await ev(`JSON.stringify({mode:currentMode,sheets:document.querySelectorAll('#display-pane .sheet').length,nodes:(window.gNodes||[]).length,segCache:(window.gSegCache||[]).length})`));

// 1) 装仪器
await ev(`(function(){
  window.__m = { renders: 0, incr: 0, pb: 0, longTasks: [] };
  try {
    new PerformanceObserver(function(list){
      for (const e of list.getEntries()) window.__m.longTasks.push({t: Math.round(e.startTime), d: Math.round(e.duration)});
    }).observe({entryTypes: ['longtask']});
  } catch(e) {}
  const or_ = window.render;
  window.render = function(s,c,d){ window.__m.renders++; return or_(s,c,d) };
  const oi = window.syntaxIncrRender;
  window.syntaxIncrRender = function(s){ window.__m.incr++; return oi(s) };
  const ob = window.Bridge.parseBlocks.bind(window.Bridge);
  window.Bridge.parseBlocks = function(r){ window.__m.pb++; const t0=performance.now(); return ob(r).then(x=>{window.__m.lastPbMs=Math.round(performance.now()-t0);return x}) };
  return 'inst-on';
})()`);

// 2) 光标放进语法框"小时"第一段行尾
await ev(`(function(){
  const ta=document.getElementById('syntax-src');
  const idx=ta.value.indexOf('小时');
  ta.focus();
  ta.setSelectionRange(idx+2, idx+2);
  return 'caret@'+idx;
})()`);

// 3) 逐键打 abcdefgh(真实按键,150ms 间隔),每键计时:keydown 页面时刻 → 纸面 DOM 出现该前缀
const marks = [];
for (let i = 0; i < 8; i++) {
  const ch = String.fromCharCode(97 + i);
  const t0 = await ev('performance.now()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: 65 + i });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: 65 + i });
  marks.push(t0);
  await sleep(150);
}
// 4) 等全部落地,收集每键落地时刻
const land = await ev(`(async function(){
  const want='abcdefgh';
  const times=[];
  for(let i=0;i<want.length;i++){
    const prefix=want.slice(0,i+1);
    const t0=window.__marks?0:0;
    const deadline=performance.now()+4000;
    let landed=-1;
    while(performance.now()<deadline){
      const para=[...document.querySelectorAll('#display-pane .paper [data-bid]')].find(e=>e.textContent.indexOf(prefix)>=0);
      if(para){landed=1;break}
      await new Promise(r=>setTimeout(r,8));
    }
    times.push(landed);
  }
  return 'done';
})()`);
// 更精确:直接逐键重打一遍,串行等待每键出现在纸面
const r2 = await ev(`(function(){
  const ta=document.getElementById('syntax-src');
  // 光标回段尾,清掉刚才打的
  const v=ta.value;
  const idx=v.indexOf('小时abcdefgh');
  ta.setSelectionRange(idx+2+8, idx+2+8);
  return 'reset';
})()`);
const results = [];
for (let i = 0; i < 6; i++) {
  const ch = String.fromCharCode(103 + i); // g..l
  const t0 = await ev('performance.now()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: 71 + i });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: 71 + i });
  const landMs = await ev(`(async function(){
    const ch='${ch}';
    const t0=performance.now();
    const deadline=t0+4000;
    while(performance.now()<deadline){
      const found=[...document.querySelectorAll('#display-pane .paper [data-bid]')].some(e=>{
        const m=e.textContent.match(new RegExp('小时[a-z]*'+ch));
        return m&&m[0].endsWith(ch)&&e.textContent.indexOf('小时'+ch)>=0;
      });
      if(found)return Math.round(performance.now()-t0);
      await new Promise(r=>setTimeout(r,8));
    }
    return -1;
  })()`);
  results.push({ ch, landMs });
  await sleep(120);
}
console.log('per-key land:', JSON.stringify(results));
console.log('counters:', await ev(`JSON.stringify({renders:window.__m.renders,incr:window.__m.incr,pb:window.__m.pb,lastPbMs:window.__m.lastPbMs,longTasks:(window.__m.longTasks||[]).slice(-12)})`));
console.log('final ta tail:', await ev(`(document.getElementById('syntax-src').value.split('\\n').find(l=>l.indexOf('小时')>=0)||'').slice(0,30)`));
console.log('final paper para:', await ev(`([...document.querySelectorAll('#display-pane .paper [data-bid]')].find(e=>e.textContent.indexOf('小时')>=0)||{textContent:'none'}).textContent.slice(0,30)`));
ws.close(); process.exit(0);
