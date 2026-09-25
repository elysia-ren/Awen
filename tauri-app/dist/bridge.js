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

  // 源码 → {native:true, blocks[], diags[], outline[], pages, recs[]}(Aine 权威解析+排版)
  // cfg:{pw,ph,mg,fp,ls} 页面模型(mm/pt/行距倍数);在场时引擎同次解析附带权威分页
  parse:function(src,cfg,doc){
    if(!tauri)return Promise.reject(new Error('非桌面环境'));
    return tauri.core.invoke('core_parse',{src:src,cfg:cfg?JSON.stringify(cfg):null,doc:doc||null}).then(function(jsonText){
      var res=(typeof jsonText==='string')?JSON.parse(jsonText):jsonText;
      res.native=true;
      if(!res.diags)res.diags=[];
      if(!res.blocks)res.blocks=[];
      return res;
    });
  },

  // 批量图片资源化(docx 导入):一次 IPC,服务端去重写盘,返回 media/ 引用列表
  batchResource:function(uris,mediaDir){
    if(!tauri)return Promise.resolve([]);
    return tauri.core.invoke('core_batch_resource',{dataUris:uris,mediaDir:mediaDir});
  },

  // 字体度量:family 的字符集区间宽表 {s,e,w}(em)
  fontWidths:function(family,chars){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('core_font_widths',{family:family,chars:chars}).then(function(jsonText){
      return (typeof jsonText==='string')?JSON.parse(jsonText):jsonText;
    });
  },

  // 增量排版:引擎复用上一轮未变前缀,返回 {pages,recs}
  relayout:function(src,cfg,doc){
    if(!tauri)return Promise.reject(new Error('非桌面环境'));
    return tauri.core.invoke('core_relayout',{src:src,cfg:JSON.stringify(cfg),doc:doc||null}).then(function(jsonText){
      return (typeof jsonText==='string')?JSON.parse(jsonText):jsonText;
    });
  },

  // 系统字体枚举(注册表 Fonts 项,机器上有啥给啥)
  listFonts:function(){
    if(!tauri)return Promise.resolve([]);
    return tauri.core.invoke('core_list_fonts').then(function(r){ return r||[] },function(){ return [] });
  },

  // 块级增量解析:只送脏段 [{bid,text}],返回 {nodes:[{bid,res:{blocks[]}}]}
  parseBlocks:function(blocks){
    if(!tauri)return Promise.reject(new Error('非桌面环境'));
    return tauri.core.invoke('core_parse_blocks',{blocks:JSON.stringify(blocks)}).then(function(jsonText){
      return (typeof jsonText==='string')?JSON.parse(jsonText):jsonText;
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
      if(res&&res.media_dir)window.awenMediaDir=res.media_dir;
      return {name:res.name,src:res.src,path:res.path||null,media_dir:(res&&res.media_dir)||null};
    });
  },

  // .awen v0.5 容器:打包保存(引擎抽 data URI 资源化),返回资源化后源码
  awenContainerSave:function(path,syntax,docId,mediaDir){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('awen_container_save',{path:path,syntax:syntax,docId:docId,mediaDir:mediaDir||''})
      .then(function(res){
        // 壳返回 JSON 文本(引擎容器流程约定:字符串载荷统一 JSON)
        if(typeof res==='string'){ try{res=JSON.parse(res)}catch(e){ return null } }
        if(res&&res.media_dir)window.awenMediaDir=res.media_dir;
        return {source:res.source};
      });
  },

  // .awen v0.5 容器:打开(引擎解包资源到媒体目录),返回 {source,media_dir,...}
  awenContainerOpen:function(path){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('awen_container_open',{path:path}).then(function(res){
      if(typeof res==='string'){ try{res=JSON.parse(res)}catch(e){ return null } }
      if(res&&res.media_dir)window.awenMediaDir=res.media_dir;
      return res;
    });
  },

  // 包内 media/ 引用 → 可渲染 URL(asset 协议)
  mediaSrc:function(u){
    if(u&&u.indexOf('media/')===0&&window.awenMediaDir&&tauri&&tauri.core&&tauri.core.convertFileSrc){
      try{
        var abs=(window.awenMediaDir.replace(/\\/g,'/'))+'/'+u.slice(6);
        return tauri.core.convertFileSrc(abs);
      }catch(e){ return u }
    }
    return u;
  },

  // 确保媒体子目录存在,返回绝对路径(每个文档标签一个)
  mediaEnsure:function(name){
    if(!tauri)return Promise.resolve('');
    return tauri.core.invoke('media_ensure',{name:name});
  },
  // 本地图片 → 写入媒体目录,返回 {ref:"media/img-x.ext"}(源码引用)
  imageResource:function(path,mediaDir){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('image_resource',{path:path,mediaDir:mediaDir});
  },
  // data URI → 写入媒体目录,返回 {ref}
  dataUriResource:function(dataUri,mediaDir){
    if(!tauri)return Promise.resolve(null);
    return tauri.core.invoke('data_uri_resource',{dataUri:dataUri,mediaDir:mediaDir});
  },
  // 选择本地图片(系统对话框),返回 {ref, dataUri};取消 null
  pickImage:function(mediaDir){
    if(!tauri||!tauri.dialog||!tauri.dialog.open)return Promise.resolve(null);
    return tauri.dialog.open({
      multiple:false,
      filters:[{name:'图片',extensions:['png','jpg','jpeg','gif','webp']}]
    }).then(function(picked){
      var path=picked;
      if(Array.isArray(path))path=path[0];
      if(path&&typeof path==='object')path=path.path||path.filePath||null;
      if(!path)return null;
      return tauri.core.invoke('image_resource',{path:path,mediaDir:mediaDir});
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
