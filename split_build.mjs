// 结构拆分生成器 v2:acorn AST 精确切割(零启发式)
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const base = 'preview';
const src = fs.readFileSync(path.join(base, 'template.html'), 'utf8');
const css_m = src.match(/<style>([\s\S]*?)<\/style>/);
const css = css_m[1];
const script_m = src.match(/<script>([\s\S]*?)<\/script>/);
const js = script_m[1];
const js_off = 0; // acorn 坐标相对 js 自身,无需偏移

const ast = acorn.parse(js, { ecmaVersion: 2022 });

const MAP = {
 'core/render.js': ['render','renderKeep','renderNodes','gapEl','makeBlock','renderOutline','renderStatus','nodeByBid'],
 'core/sync.js': ['onPaperInput','applySyncNow','scheduleNativeRefresh','mergeBlocks'],
 'core/caret.js': ['saveCaret','restoreCaret','setSel','focusPaper','caretBlock','insertAtSelection','updateCaretPos','updateGutter','setGutterCur','caretLineNumber','textLen','selectAllDoc'],
 'core/history.js': ['recordHist','markDirty','updateUndoButtons','doUndo','doRedo','applyHistory'],
 'cmd/char.js': ['inDisplayMode','fmtCmd','fmtCmdInline','wrapSpan','applyColor','applyMark','applySize','applyFont','stepSize','toggleCase','brushClick','brushDouble','stopBrush'],
 'cmd/page.js': ['setDocsetLine','applyPaper','applyMargin','applyMarginCustom','applyLineSpacing','applyLineSpacingCustom','toggleOrientation','toggleFirstLine','cycleLineSpacing'],
 'cmd/table.js': ['inTable','selTr','selCell','tblInsRow','tblDelRow','tblInsCol','tblDelCol','toggleTblPop','insertTableGrid'],
 'cmd/find.js': ['toggleFind','closeFind','cs0','cw0','matchStarts','findIdxOf','findCount','highlightAll','findNext','findPrev','replaceOne','replaceAll','replaceEntry','findKey','gotoLine'],
 'cmd/clipboard.js': ['doPaste','pastePlain','paraBreakAtSelection','doCut','doCopy','pasteTextOnly'],
 'cmd/insert.js': ['insertBlock','pickImageInsert','insertRawLine'],
 'ui/palette.js': ['pushRecent','applyPal','palSwatch','togglePal','closePal'],
 'ui/panels.js': ['toggleSymbolPanel','openImagePanel','toggleLabelPop','renderLabelList','renamelabel_esc','renameLabelStart','renameLabelApply','toggleDiagPop','showWordCount'],
 'ui/status.js': ['updateDiagBar','allDiags','updateAlignState'],
 'ui/minibar.js': ['updateMinibar'],
 'view/view.js': ['setMode','showRibbon','toggleRibbonCollapse','buildSyntaxPane','insertSyntax','wrapSyntax','fitZoom','syncZoomSelects','applyZoom','applyZoomCustom','zoomEntry','toggleSidebar','toggleFocus','toggleMarks','spyOutline','swapSplit'],
 'file/tabs.js': ['renderFileTabs','addFileTab','switchFile','closeFile'],
 'file/open-save.js': ['newDoc','openDocument','openFileClick','doSave','doSaveDialog','doSaveAs','buildAwenHeader','fname','saveWithPicker','markClean','updateTitle'],
 'file/autosave.js': ['scheduleAutosave','doAutosave','loadAutosave','clearAutosave','discardAutosaveDraft'],
 'file/recent.js': ['getRecent','pushRecentFile','renderRecentList'],
 'file/export.js': ['exportFile','doPrint'],
 'file/docx.js': ['importDocx','htmlToAwen'],
};
const f2mod = {};
for (const [m, fs] of Object.entries(MAP)) for (const f of fs) f2mod[f] = m;

// AST 切割:顶层节点按类型归属
const mods = {};
for (const m of Object.keys(MAP)) mods[m] = [];
mods['main.js'] = [];

for (const node of ast.body) {
  const text = js.slice(node.start - js_off, node.end - js_off);
  let mod = 'main.js';
  if (node.type === 'FunctionDeclaration' && f2mod[node.id.name]) {
    mod = f2mod[node.id.name];
  } else if (node.type === 'VariableDeclaration') {
    const names = node.declarations.map(d => d.id.name);
    if (false) {
      // 状态声明行:进 state 前缀? 状态已手写进 state.js——原语句整行丢弃(初始值已在 state.js)
      if (sNames.length === names.length) continue;   // 整行都是状态声明:丢弃
      // 混合行:非状态部分保留在原模块
    }
    // 其它 var(DEFAULT_SRC 等):保留在所在位置(按下一个函数归属——简化:归 main)
    if (node.start < 200) mod = 'main.js';
    mods[mod].push(text);
    continue;
  } else if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression') {
    // init IIFE / 事件绑定:按 callee 线索归属
    const t = text;
    if (t.includes('(function init()')) mod = 'main.js';
    else if (t.includes("addEventListener('selectionchange'") && t.includes('updateMinibar')) mod = 'ui/minibar.js';
    else if (t.includes("addEventListener('selectionchange'") && t.includes('brushCmd')) mod = 'cmd/char.js';
    else if (t.includes("addEventListener('selectionchange'")) mod = 'core/caret.js';
    else if (t.includes("getElementById('display-pane').addEventListener('input'")) mod = 'core/sync.js';
    else if (t.includes("addEventListener('keydown', onPaperKey") || t.includes("addEventListener('keydown',onPaperKey")) mod = 'cmd/char.js';
    else if (t.includes("addEventListener('keydown'")) mod = 'main.js';
    else if (t.includes("addEventListener('resize'")) mod = 'view/view.js';
    else if (t.includes("getElementById('display-pane').addEventListener('scroll'")) mod = 'view/view.js';
    else if (t.includes("addEventListener('mousedown'")) mod = 'main.js';
    else if (t.includes("addEventListener('click'") && t.includes('closePal')) mod = 'ui/palette.js';
    else if (t.includes("addEventListener('click'") && t.includes('tblpop')) mod = 'cmd/table.js';
    else if (t.includes('_oldRenderOutline')) mod = 'core/render.js';
    else mod = 'main.js';
    mods[mod].push(t);
    continue;
  }
  mods[mod].push(text);
}

// 依赖分析+生成
function ids_used(text) {
  const used = new Set();
  for (const [m, fs] of Object.entries(MAP)) {
    for (const f of fs) {
      if (new RegExp('\\b' + f + '\\b').test(text)) used.add(f);
    }
  }
  return used;
}

fs.mkdirSync(path.join(base, 'js'), { recursive: true });
for (const d of ['core', 'cmd', 'ui', 'view', 'file']) fs.mkdirSync(path.join(base, 'js', d), { recursive: true });

console.log('=== 全部顶层块 ===');
ast.body.forEach(function (n, idx) {
  const t = js.slice(n.start, n.end).split('\n')[0].slice(0, 55);
  console.log(idx, n.type, JSON.stringify(t));
});
const written = [];
for (const mod of Object.keys(mods).sort()) {
  const parts = mods[mod];
  if (!parts.length) continue;
  const body = parts.map(t => t).join('\n\n').trim('\n');
  const fp = path.join(base, 'js', mod);
  fs.writeFileSync(fp, body + '\n');
  written.append ? null : written.push((mod, body.split('\n').length));
}
const wl = [];
for (const mod of Object.keys(mods).sort()) {
  if (mods[mod].length) wl.push(mod);
}

// main.js:重写(导入+挂载+init 体)
const main_imports = wl.map((m, i) => 'import * as M' + i + ' from "./' + m + '";').join('\n');
const mount = wl.map((m, i) => 'Object.assign(window, M' + i + ');').join('\n');
const init_body = (mods['main.js'] || []).join('\n\n');
const main_src = '// 入口:初始化/事件绑定/命令挂载(window 暴露以兼容 HTML 内联 onclick)\n'
  + main_imports + '\n\n' + mount + '\n\n' + init_body + '\n';
fs.writeFileSync(path.join(base, 'js', 'main.js'), main_src);

fs.mkdirSync(path.join(base, 'css'), { recursive: true });
fs.writeFileSync(path.join(base, 'css', 'style.css'), css);
let s2 = src.replace(css_m[0], '<link rel="stylesheet" href="css/style.css">');
s2 = s2.replace(script_m[0], '<script type="module" src="js/main.js"></script>');
fs.writeFileSync(path.join(base, 'template.html'), s2);

console.log('== 生成文件 ==');
for (const mod of wl.sort()) {
  const n = fs.readFileSync(path.join(base, 'js', mod), 'utf8').split('\n').length;
  console.log(' %4d 行  js/' + mod, n);
}
console.log(' js/main.js');
console.log(' css/style.css', css.split('\n').length, '行');
