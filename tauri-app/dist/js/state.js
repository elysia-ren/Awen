// 全局文档状态(传统 script 全局变量,各模块直接读写)
// cfg 引用 Engine.getConfig() 返回的对象(文档级设置,由 applyDocsets 原地更新)
var gSrc = '';
var gNodes = [];
var gPages = [];
var cfg = null;
var openFiles = [];
var activeFile = -1;
var currentMode = 'display';
var currentFilePath = null;
var docDirty = false;
var hist = [];
var histIdx = -1;
var histTime = 0;
var nativeDiags = null;
var lastEditSource = null;
var repagTimer = null;
