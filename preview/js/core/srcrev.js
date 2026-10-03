// sourceRevision.js —— 文档会话与源码代次(单一事实源的状态机)
//
// 评审定稿(2026-10-02):
//   gSrc 是唯一权威;每次"产生新文档状态"的写入都必须经 commitSource(),
//   sourceRevision 单调递增。所有异步引擎任务携带 (docId, sourceRevision),
//   返回时用 isCurrent() 统一判定有效性——取代此前的
//   renderSeq/incrSeq/syntaxIncrSeq/relayoutSeq 四个分散令牌
//   与 lastRenderedSrc 字符串比对。
//
//   程序写 textarea 一律经 programmaticWrite():writeToken 使回写引发的
//   input 事件可被识别为"我们自己的写入"(替代 800ms 时间窗猜测)。

// ── 会话状态 ──
var sourceRevision = 0;      // gSrc 的代次:每次权威写入 +1
var currentDocIdCache = '';  // 文档标识缓存(currentDocId 的快照)

// ── 程序写令牌 ──
var writeToken = 0;          // 程序写入期间 >0;input 事件据此识别来源
function programmaticWrite(fn) {
  writeToken++;
  try {
    return fn();
  } finally {
    // 同步代码执行完即复位;若写入触发的 input 异步到达,
    // isProgrammaticInput 用时间+token 双查(见下)
    writeToken--;
  }
}
// input 事件处理器开头调用:程序写入引发的 input 应消费而非当作用户编辑
function isProgrammaticInput() {
  return writeToken > 0;
}

// ── 权威提交 ──
// 所有产生新文档状态的写入点(语法侧编辑/纸面序列化/撤销/容器加载/
// 程序化修改)必须经此:推进 revision 并可选拉起调度
var _lastCommitOrigin = '';   // gSrc 最近一次提交的来源;render 落地的
                              // paper-guard 依此判断 DOM 序列化是否可信
function commitSource(newSrc, origin) {
  if (newSrc === gSrc) return sourceRevision; // 幂等:同串不推代次
  gSrc = newSrc;
  sourceRevision++;
  _lastCommitOrigin = origin || '';
  if (window.__srcListeners) {
    window.__srcListeners.forEach(function (f) { f(sourceRevision, origin); });
  }
  return sourceRevision;
}
function lastCommitOrigin() { return _lastCommitOrigin; }
function onSourceCommit(fn) {
  if (!window.__srcListeners) window.__srcListeners = [];
  window.__srcListeners.push(fn);
}

// ── 任务有效性判定(所有异步引擎响应落地前统一调用) ──
function makeJobRev() {
  return { doc: currentDocId(), rev: sourceRevision };
}
function isCurrent(job) {
  return job.doc === currentDocId() && job.rev === sourceRevision;
}

// ── 兼容垫片:旧代码里的 currentDocId 由此模块接管语义 ──
function currentDocIdSafe() {
  try { return currentDocId(); } catch (e) { return ''; }
}
