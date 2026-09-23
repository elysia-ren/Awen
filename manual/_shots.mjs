// 拍手册用新 UI 截图
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws'))});
let id=0; const pend={};
ws.onmessage = ev => { const d=JSON.parse(ev.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} };
const send=(m,p={})=>new Promise(res=>{const i=++id;pend[i]=res;ws.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const shot=async(name)=>{const s=await send('Page.captureScreenshot',{format:'png'});
  const fs=await import('fs');fs.writeFileSync(name,Buffer.from(s.result.data,'base64'));console.log('saved',name)};

// 准备内容
await ev(`localStorage.removeItem('awen-autosave'),setSrc('# 认识 Awen\\n\\n这是正文段落,直接在纸面上输入。**粗体**、_斜体_、@[u]下划线@[/u] 即时呈现。\\n\\n- 项目符号列表\\n- 第二项\\n\\n> 引用块示例。\\n\\n@[table demo]\\n| 功能 | 状态 |\\n| --- | --- |\\n| 显示视图 | 可用 |\\n@[/table]\\n')`);
await sleep(1000);
await ev(`(function(){var t=document.querySelector('.tab[data-page=start]');if(t)t.click();return 1})()`);
await sleep(400);
await shot('img-ui-display.png');
// 色板
await ev(`document.querySelector('.ribbon-page[data-page=start] .cs-arrow').click()`);
await sleep(350);
await shot('img-ui-palette.png');
await ev(`closePal()`);
// 语法视图
await ev(`setMode('syntax')`);
await sleep(600);
await shot('img-ui-syntax.png');
// 分屏 + 滚动
await ev(`setMode('split')`);
await sleep(600);
await ev(`(function(){var sp=document.getElementById('syntax-pane');sp.scrollTop=sp.scrollHeight*0.35;return 1})()`);
await sleep(400);
await shot('img-ui-split.png');
await ev(`setMode('display')`);
ws.close();setTimeout(()=>process.exit(0),80);
