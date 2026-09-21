// 全局状态:引擎/桥引用与启动数据(自单文件版拆出;传统 script,全局变量直接共享)
// ═══ UI 层:工具栏 / 纸面 DOM / 光标 / 撤销 / 查找 / 文件管理 ═══
// 解析·渲染·序列化在 engine.js(AwenEngine),原生引擎桥在 bridge.js(Bridge)。
var Engine=window.AwenEngine;
var Bridge=window.Bridge;
var CFG=Engine.getConfig();

// ═══ 启动即空白新文档:内容来自打开的文件,不内置示例 ═══
var DEFAULT_SRC = '# 未命名文档\n\n';
