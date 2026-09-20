// ═══════════════════════════════════════════════════════════════
// bridge.js —— UI 与引擎之间的异步门面
//
// 桌面版(Tauri,window.__TAURI__ 存在):块级解析/诊断经 IPC 调 Aine
// 原生引擎(Rust 后端 spawn aine.exe run src/tauri_cli.aine),结果为权威。
// 浏览器环境:全部降级为本地 AwenEngine(engine.js),行为与旧版一致。
//
// UI 约定:交互式编辑(打字/光标)始终走本地引擎保证零延迟;Bridge 的
// 结果只用于诊断刷新、结构交叉比对与文件读写。
// ═══════════════════════════════════════════════════════════════
(function(){
'use strict';

var Engine=window.AwenEngine;
var tauri=(window.__TAURI__&&window.__TAURI__.core&&typeof window.__TAURI__.core.invoke==='function')
  ?window.__TAURI__:null;

function localParse(src){
  return Promise.resolve({
    native:false,
    blocks:[],
    diags:Engine.quickDiags(src),
    outline:[],
    pages:0,
    words:0
  });
}

window.Bridge={
  native:!!tauri,
  mode:tauri?'tauri':'browser',

  // 源码 → {native, blocks[], diags[], outline[], pages, words}
  // native.blocks 非空时,可用 AwenEngine.ingestNative(blocks,src) 转为引擎节点。
  parse:function(src){
    if(!tauri)return localParse(src);
    return tauri.core.invoke('core_parse',{src:src}).then(function(jsonText){
      var res=(typeof jsonText==='string')?JSON.parse(jsonText):jsonText;
      res.native=true;
      if(!res.diags)res.diags=[];
      if(!res.blocks)res.blocks=[];
      return res;
    }).catch(function(err){
      // 原生引擎不可用(aine.exe 缺失等):降级并提示
      console.warn('[AwenBridge] 原生引擎调用失败,降级本地引擎:',err);
      return localParse(src);
    });
  },

  // 打开文件对话框。返回 Promise<{name, src, path?}|null>(取消为 null)
  openDialog:function(){
    if(tauri){
      return tauri.core.invoke('core_open_dialog').then(function(res){
        if(!res)return null;
        return {name:res.name,src:res.src,path:res.path||null};
      });
    }
    return new Promise(function(resolve){
      var inp=document.createElement('input');
      inp.type='file';
      inp.accept='.awen,.txt,.md,.markdown';
      inp.style.display='none';
      document.body.appendChild(inp);
      inp.addEventListener('change',function(){
        var f=inp.files&&inp.files[0];
        if(!f){inp.remove();resolve(null);return}
        var rd=new FileReader();
        rd.onload=function(){
          var text=String(rd.result);
          if(text.indexOf('# awen v')===0){
            var sep=text.indexOf('# ---');
            if(sep>=0){var nl=text.indexOf('\n',sep);text=text.substring(nl+1)}
          }
          inp.remove();
          resolve({name:f.name,src:text});
        };
        rd.onerror=function(){inp.remove();resolve(null)};
        rd.readAsText(f,'utf-8');
      });
      inp.click();
    });
  },

  // 保存对话框。返回 Promise<{saved, path}>(path 供"保存"直写复用)
  saveDialog:function(name,content){
    if(tauri){
      return tauri.core.invoke('core_save_dialog',{name:name,content:content})
        .then(function(res){ return {saved:!!(res&&res.saved),path:(res&&res.path)||null} });
    }
    return new Promise(function(resolve){
      var done=function(path){resolve({saved:true,path:path||null})};
      if(window.showSaveFilePicker){
        var ext=name.split('.').pop();
        var acc={};acc['text/plain;charset=utf-8']=['.'+ext];
        window.showSaveFilePicker({suggestedName:name,types:[{description:ext.toUpperCase()+' 文件',accept:acc}]})
          .then(function(h){return h.createWritable().then(function(w){return w.write(new Blob([content],{type:'text/plain;charset=utf-8'}))}).then(function(w){return w.close()})})
          .then(function(){done(null)})
          .catch(function(e){
            if(e&&e.name==='AbortError'){resolve({saved:false,path:null});return}
            downloadFallback(name,content);done(null);
          });
      }else{
        downloadFallback(name,content);done(null);
      }
    });
  },

  // 已知路径直写(桌面版"保存"不再弹框)
  savePath:function(path,content){
    if(!tauri)return Promise.resolve(false);
    return tauri.core.invoke('core_save_file',{path:path,content:content}).then(function(ok){return !!ok});
  },

  // 监听单实例/命令行转发的文件路径(桌面版)
  listenOpenPath:function(cb){
    if(!tauri||!tauri.event||!tauri.event.listen)return;
    tauri.event.listen('awen-open-path',function(ev){ cb(String(ev.payload)); });
  }
};

function downloadFallback(name,content){
  var blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
}
})();
