// 以 _native_main.js(f920d3a 的 template 内嵌脚本,native 权威解析版)为唯一权威,
// 按行号区间全量切割为职责模块。区间均落在函数/区块边界;传统 script 全局共享。
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync('_native_main.js', 'utf8');
const lines = src.split('\n');
const get = (a, b) => lines.slice(a - 1, b).join('\n').trim('\n');

const H = (t) => `// ${t}(自单文件版拆出;传统 script,全局变量直接共享)`;

const mods = {
  'state.js': [[H('全局状态:引擎/桥引用与启动数据')],
    [1, 8]],
  'core/render.js': [[H('渲染:每张 A4 纸一个整体可编辑区(render 走 Bridge.parse 权威解析)')],
    [10, 205]],
  'core/sync.js': [[H('编辑同步入口:纸面输入 → 序列化 → 节流权威解析;键盘块级操作')],
    [206, 225], [319, 377]],
  'core/caret.js': [[H('行号栏 / 光标存取与定位')],
    [226, 318]],
  'core/history.js': [[H('撤销/重做历史与 setSrc 主入口')],
    [1332, 1392]],
  'ui/status.js': [[H('状态栏:诊断数据源 / 字数统计')],
    [378, 384], [2007, 2026]],
  'ui/minibar.js': [[H('浮动迷你工具栏与对齐/字数状态')],
    [595, 655]],
  'ui/icons.js': [[H('功能区图标(内联 SVG,16×16 currentColor)')],
    [1599, 1643]],
  'ui/panels.js': [[H('浮动面板:诊断/标签/符号/功能区显隐/图片属性/折叠')],
    [656, 738], [876, 902], [1644, 1659], [1702, 1762], [1893, 1899], [1998, 2006]],
  'ui/palette.js': [[H('色板:功能区/迷你栏共用浮动面板,最近使用持久化')],
    [903, 999]],
  'view/view.js': [[H('视图:语法视图 / 模式与缩放 / 专注模式 / 全局快捷键 / 大纲跟随')],
    [1243, 1331], [1393, 1474], [2027, 2080], [2104, 2139]],
  'cmd/char.js': [[H('字符格式命令:粗斜下划/上下标/颜色/字号/字体/样式/列表')],
    [385, 488], [2081, 2103]],
  'cmd/insert.js': [[H('块级插入 + 本地图片与原始行')],
    [489, 541], [1866, 1892]],
  'cmd/table.js': [[H('表格行列操作与插入网格弹窗')],
    [542, 594], [1660, 1701]],
  'cmd/clipboard.js': [[H('剪贴板与格式刷(Word 式吸取/应用)')],
    [739, 859]],
  'cmd/find.js': [[H('查找替换(含语法视图源内查找)')],
    [870, 875], [1000, 1131]],
  'cmd/page.js': [[H('页面设置:纸型/页边距/行距/方向/首行缩进(写回文档级设置行)')],
    [860, 869], [1132, 1197]],
  'file/autosave.js': [[H('自动保存/崩溃恢复(localStorage 快照)')],
    [1493, 1516]],
  'file/open-save.js': [[H('打开/保存:文件名/系统对话框/新建/打开/容器头')],
    [1475, 1492], [1517, 1598]],
  'file/docx.js': [[H('DOCX 导入(mammoth 本地分发;HTML → Awen 语法)')],
    [1763, 1865]],
  'file/export.js': [[H('导出(txt/html/awen)与打印')],
    [1198, 1242]],
  'file/recent.js': [[H('最近文件(localStorage;桌面版带路径可直开)')],
    [1900, 1938]],
  'file/tabs.js': [[H('多文件标签管理')],
    [1939, 1997]],
  'main.js': [[H('入口:初始化(图标注入/草稿恢复/初渲染/多文件/打开转发)')],
    [2140, 2187]],
};

// 加载顺序 = template.html 的 script 标签顺序(state 最先,main 入口最后)
export const LOAD_ORDER = [
  'state.js',
  'core/render.js', 'core/sync.js', 'core/caret.js', 'core/history.js',
  'ui/icons.js', 'ui/status.js', 'ui/minibar.js', 'ui/panels.js', 'ui/palette.js',
  'view/view.js',
  'cmd/char.js', 'cmd/insert.js', 'cmd/table.js', 'cmd/clipboard.js', 'cmd/find.js', 'cmd/page.js',
  'file/autosave.js', 'file/open-save.js', 'file/docx.js', 'file/export.js', 'file/recent.js', 'file/tabs.js',
  'main.js',
];

for (const [rel, parts] of Object.entries(mods)) {
  const header = parts[0][0];
  const body = parts.slice(1).map(([a, b]) => get(a, b)).join('\n\n');
  const fp = path.join('preview/js', rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, header + '\n' + body + '\n');
  console.log(rel.padEnd(20), body.split('\n').length, 'lines');
}
fs.writeFileSync('preview/js/_load_order.json', JSON.stringify(LOAD_ORDER, null, 1));
console.log('total', LOAD_ORDER.length, 'modules');
