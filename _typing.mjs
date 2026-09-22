// 真实按键连续打字测试:分屏+显示视图,验证无回退、语法同步、光标正确
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws'))});
let id=0; const pend={};
ws.onmessage = ev => { const d=JSON.parse(ev.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} };
const send=(m,p={})=>new Promise(res=>{const i=++id;pend[i]=res;ws.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  return r.result&&r.result.result?r.result.result.value:'NOVALUE';};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const ch=async(c)=>{
  await send('Input.dispatchKeyEvent',{type:'keyDown',text:c,unmodifiedText:c,key:c});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:c});
};

// 显示视图,聚焦段尾
await ev(`localStorage.removeItem('awen-autosave'),setSrc('# 打字测试\\n\\n起始。\\n')`);
await sleep(900);
await ev(`setMode('display')`);
await sleep(400);
const f=await ev(`(function(){
  var p=document.querySelector('#display-pane .paper [data-kind=para]');
  if(!p)return 'no para';
  var r=document.createRange();r.setStart(p.firstChild,3);r.collapse(true);
  var s=getSelection();s.removeAllRanges();s.addRange(r);p.focus();
  return 'caret@3'})()`);
console.log('focus:',f);
// 模拟连续打字:每 120ms 一字符,穿插长间隔(触发权威渲染)
const word='你好世界测试';
for(const c of word){ await ch(c); await sleep(120); }
await sleep(200);
const word2='继续输入';
for(const c of word2){ await ch(c); await sleep(120); }
await sleep(1600);
const r1=await ev(`JSON.stringify({src:gSrc,paras:document.querySelectorAll('#display-pane .paper [data-kind=para]').length,
  paraText:document.querySelector('#display-pane .paper [data-kind=para]').textContent})`);
console.log('typing:',r1);

// 分屏:语法框应同步
await ev(`setMode('split')`);
await sleep(700);
const r2=await ev(`JSON.stringify({ta:document.getElementById('syntax-src').value})`);
console.log('syntax:',r2);
ws.close();setTimeout(()=>process.exit(0),80);
