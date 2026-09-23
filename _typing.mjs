// 真实按键连续打字测试(结果写 _typing.log)
import fs from 'fs';
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
const log=(s)=>fs.appendFileSync('_typing.log',String(s)+'\n');
fs.writeFileSync('_typing.log','');
const ch=async(c)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',text:c,unmodifiedText:c,key:c});await send('Input.dispatchKeyEvent',{type:'keyUp',key:c});};

await ev(`setSrc('# 打字测试\n\n起始。\n'),'set'`);
await sleep(1200);
const f=await ev(`(function(){
  var p=document.querySelector('#display-pane .paper [data-kind=para]');
  if(!p)return 'no para';
  var r=document.createRange();r.setStart(p.firstChild,3);r.collapse(true);
  var s=getSelection();s.removeAllRanges();s.addRange(r);p.focus();
  return 'caret@3'})()`);
log('focus: '+f);
// 第一段连续打字 + 中间停顿 1.2s(触发权威渲染)+ 第二段连续打字
const word='你好世界测试';
for(const c of word){ await ch(c); await sleep(110); }
await sleep(1200);
const word2='继续输入中文词组';
for(const c of word2){ await ch(c); await sleep(110); }
await sleep(1800);
log('result: '+await ev(`JSON.stringify({src:gSrc,para:document.querySelector('#display-pane .paper [data-kind=para]').textContent})`));
ws.close();setTimeout(()=>process.exit(0),80);
