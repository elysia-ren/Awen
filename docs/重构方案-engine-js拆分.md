# Awen 编辑器架构重构方案 — engine.js 拆分 + Tauri IPC 桥

> 2026-09-20。基线:main@94d595a,Aine 测试 438/438。

## 一、问题

`preview/template.html`(2210 行 / 126 个 JS 函数)把 UI 层和文档引擎混在单文件里:
`miniParse / fmtH / displayText / measureEm / breakLines / layoutPages / blockHtml /
inlineSource / serializeBlockEl / serializeAll / quickDiags` 与 Aine 引擎(src/*.aine)
完全独立,且无人保证两者行为一致。

通读后确认的**渲染缺口 / 死代码**:

| # | 问题 | 证据 |
|---|------|------|
| 1 | 多行作用域 `@[font "X"]…@[/font]` 分支是死代码 | template.html:575 条件 `t.endsWith(']')===false` 恒假(开标签必以 `]` 结尾),实际落入 docset 分支;`@[/font]` 行落成普通段落。序列化自然丢标记 |
| 2 | scope 渲染样式错误 | blockHtml case 'scope' 输出 `<div style="'+b.style+'">`,b.style 是命令名("font")不是 CSS |
| 3 | 图片 width/align 失效 | corpus 语法 `@[image "x.png" width 65% align center]`(空格分隔),objHtml 只匹配 `width:`(带冒号) |
| 4 | 表格无列宽/对齐渲染 | 分隔行 `| ---: | :---: |` 的对齐被忽略;无列宽参数 |
| 5 | Ctrl+F / 查找按钮崩溃 | toggleFind 查 `[data-page="findbar"]`,而 findbar 元素只有 id 没有 data-page,返回 null 后 .style 抛 TypeError |
| 6 | `lastEditSource` 声明两次 | 966 行与 1015 行重复 var |

## 二、目标架构

```
┌────────────────────────── preview/ ──────────────────────────┐
│ template.html   UI 层:工具栏/纸面 DOM/光标/撤销/查找UI/文件页签  │
│ engine.js       AwenEngine:浏览器近似引擎(解析/HTML渲染/分页/    │
│                 DOM序列化/快速诊断)。标注"预览近似,非权威"      │
│ bridge.js       Bridge:异步门面。Tauri 下走 IPC 调原生引擎,      │
│                 浏览器下降级为 AwenEngine                      │
│ editor.html     gen_tpl.py 同步副本(与 template 同目录,引用同    │
│                 目录 engine.js/bridge.js)                     │
└──────────────────────────────────────────────────────────────┘
                              │ window.__TAURI__.invoke (withGlobalTauri)
┌──────────────────── tauri-app/src-tauri ─────────────────────┐
│ main.rs  core_parse(src)→blocks JSON                          │
│          core_open/core_save/.awen 容器解包/写盘               │
│          pick_open/pick_save(对话框插件)                       │
│          实现:写 build/cli_in.awen → spawn aine.exe run        │
│          src/tauri_cli.aine → 读 build/cli_out.json(Mutex 串行)│
│  resources: aine-runtime/(aine.exe + aine.toml + src/*.aine)  │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────── src/ (Aine) ─────────────────────────┐
│ core_blocks.aine  SemNode → blocks JSON(权威解析输出)          │
│ tauri_cli.aine    CLI:读 cli_in.awen → 解析 → 写 cli_out.json  │
│ tests_core_blocks.aine  新增测试                               │
└──────────────────────────────────────────────────────────────┘
```

### 权威边界(明确不做过度承诺)

- **权威(native)**:块级结构解析(blocks)、诊断(diags)、大纲、字数/页数统计。
  打开/保存/导出时必走;编辑停顿 800ms 后异步刷新诊断并与本地块数交叉比对,
  分歧时在诊断面板显示"引擎分歧"警告。
- **近似(engine.js)**:HTML 渲染、像素级分页、DOM→源码序列化。这三者绑定 DOM,
  无法 native 化;native blocks JSON 的 text 字段回吐**原始源码行**(span 保真),
  由 engine.js 统一转 HTML,保证两种来源渲染一致。
- 浏览器(非 Tauri)模式下 Bridge 全部降级为 AwenEngine,行为与现状兼容。

### Bridge 接口

```js
Bridge.native            // bool
Bridge.parse(src)        → Promise<{native, blocks[], diags[], outline[], pages, words}>
Bridge.openDialog()      → Promise<{name, src}|null>   // Tauri 对话框;浏览器 file input
Bridge.saveDialog(name, content) → Promise<bool>       // Tauri 对话框+写盘;浏览器 picker/download
```

blocks 记录:`{kind, level, srcStart, srcEnd, text}`(text=原始源码行 \n 连接),
engine.js 的 `AwenEngine.ingestNative(blocks)` 把它转成与 miniParse 相同的节点数组
(trim/合并规则与本地路径完全一致),下游 layoutPages/blockHtml/serializeAll 零改动。

## 三、渲染缺口修复(在 engine.js 内)

1. **多行作用域**:miniParse 新判定——行匹配 `^@\[(font|size|color)\s` 且该行 `]` 后
   无内容,且**后续某行 trim 后以 `@[/同名]` 开头** → kind:'scope'(corpus 里 doc 级
   `@[font "X"]` 后面不存在以 `@[/font]` 开头的行,不受影响;行内 `文字@[/font]。`
   不以 `@[/` 开头,不误判)。渲染 `<div data-cmd data-close style="...">`;序列化
   分支 `dataset.cmd + inlineSource + dataset.close` 回写。
2. **图片参数**:同时兼容 `width 65%`/`width: 65%`、`align center`/`align: center`
   两种方言;figure 块 dataset.raw 整段保真回写(已有)。
3. **表格**:解析分隔行 `:` 对齐 → `text-align`;新增编辑器扩展参数
   `@[table 名 widths: 30,40,30]`(percent)→ colgroup,序列化原样回写。
   规范未定义列宽,此参数标注为编辑器扩展,native 解析器视 table 开行为不透明行,不冲突。

## 四、实施顺序

1. engine.js 抽离(行为等价 + 缺口修复)→ bridge.js → template.html 瘦身
2. gen_tpl.py 同步链扩展(editor.html + tauri-app/dist 三文件)
3. native:core_blocks.aine + tauri_cli.aine + 测试;修 json_export.aine
   json_escape 缺 \r 转义(交接单标记的数据丢失风险)
4. Rust 命令 + withGlobalTauri + capabilities + resources 打包
5. `aine test` 全绿 → `aine run generate_preview.aine` 重生成 → 浏览器全量回归
   (打字/加粗/字号/字体/色板/撤销重做/表格行列/多行作用域回写/查找替换/导出/多文件)
6. cargo build exe + 启动验证 → 提交推送

## 五、回归基线

- 交接单已知失败项:t3 字号 / t4 字体 / t5 色板 / t7(即 #5 查找崩溃)。
  本次重构必须修复 #5;字号/字体/色板在浏览器实测中逐项验证。
- 438/438 Aine 测试保持全绿,新增 core_blocks 测试。
