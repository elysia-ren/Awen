// ═══════════════════════════════════════════════════════════════
// bridge.js —— UI 与 Aine 原生引擎之间的桥接(仅桌面版)
//
// 编辑器只在 Awen 桌面版(Tauri)中运行:块结构/诊断由 Aine 原生引擎
// 经 IPC 提供(core_parse),不存在纯浏览器路径。
// 文件对话框/读写亦走原生。
// ═══════════════════════════════════════════════════════════════
(function(){
'use strict';

var tauri=(window.__TAURI__&&window.__TAURI__.core&&typeof window.__TAURI__.core.invoke==='function')
  ?window.__TAURI__:null;

window.Bridge={
  native:!!tauri,
  mode:tauri?'tauri':'browser',

  // 源码 → {native:true, blocks[], diags[], outline[], pages}(Aine 权威解析)
  parse:function(src){
    if(!tauri)return Promise.reject(new Error('非桌面环境'));
    return tauri.core.invoke('core_parse',{src:src}).then(function(jsonText){
      var res=(typeof jsonText==='string')?JSON.parse(jsonText):jsonText;
      res.native=true;
      if(!res.diags)res.diags=[];
      if(!res.blocks)res.blocks=[];
      return res;
    });
  },

  // 打开文件对话框。返回 Promise<{name, src, path?}|null>(取消为 null)
  openDialog:function(){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('core_open_dialog').then(function(res){
      if(!res)return null;
      return {name:res.name,src:res.src,path:res.path||null};
    });
  },

  // 保存对话框。返回 Promise<{saved, path}>
  saveDialog:function(name,content){
    if(!tauri)return Promise.resolve({saved:false,path:null});
    return tauri.core.invoke('core_save_dialog',{name:name,content:content})
      .then(function(res){ return {saved:!!(res&&res.saved),path:(res&&res.path)||null} });
  },

  // 已知路径直写(桌面版"保存"不再弹框)
  savePath:function(path,content){
    if(!tauri)return Promise.resolve(false);
    return tauri.core.invoke('core_save_file',{path:path,content:content}).then(function(ok){return !!ok});
  },

  // 按路径直接读取文件
  openPath:function(path){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('core_read_file',{path:path}).then(function(res){
      return {name:res.name,src:res.src,path:res.path||null};
    });
  },

  // 监听单实例/命令行转发的文件路径
  listenOpenPath:function(cb){
    if(!tauri||!tauri.event||!tauri.event.listen)return;
    tauri.event.listen('awen-open-path',function(ev){ cb(String(ev.payload)); });
  },

  // 拉取本实例启动参数中暂存的文件路径
  takePendingPaths:function(){
    if(!tauri)return Promise.resolve([]);
    return tauri.core.invoke('core_take_pending_paths').catch(function(){return []});
  }
};
})();
