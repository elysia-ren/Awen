# Awen 编辑器

基于 Awen 文档格式的轻量级中文编辑器。支持所见即所得编辑、语法视图、分屏对照、多文件管理、中文排版优化。

## 快速开始

双击 `preview/editor.html` 在浏览器中打开即可使用。

推荐浏览器：Chrome / Edge / Firefox 最新版。

## 功能

- **三种视图模式**：显示（WYSIWYG 纸面编辑）、语法（源码 + 行号 + 诊断）、分屏（对照）
- **纸面直接编辑**：打字 / 回车分段 / 选区格式化 / 浮动工具栏 / 迷你工具栏
- **中文排版优化**：中英混排间距（⅛em）、行首行尾禁则、标点挤压、词边界断行
- **像素级分页**：按纸张实际尺寸和行高自动分页（A4/Letter/B5/A3/A5、纵向/横向）
- **插入**：表格（选行列）/ 图片（data URI 嵌入）/ 链接 / 脚注 / 目录 / 批注 / 分隔线 / 引用
- **格式化**：粗体 / 倾斜 / 下划线 / 删除线 / 上标 / 下标 / 行内代码 / 颜色 / 底纹 / 清除
- **对齐**：左 / 居中 / 右 / 两端
- **查找替换**：区分大小写 / 方向 / 全部替换 / 浮动对话框
- **撤销重做**：300 步历史，init 去重
- **多文件**：标签页切换 / 未保存标记 / 关闭确认
- **导出**：Markdown / HTML / Word(.doc) / TXT / 打印 PDF
- **语法视图**：行号栏 / 当前行高亮 / 诊断面板 / 跳转定位
- **页面设置**：纸张 / 边距（含自定义）/ 行间距 / 方向

## Awen 语法速查

```
# 一级标题       ## 二级标题     ### 三级标题
**粗体**         *斜体*          ~~删除线~~
`行内代码`       > 引用          - 列表项
1. 编号列表      --- 分隔线

@[image 图片.png]
@[link 文字 url: https://example.com]
@[color #FF0000]红字@[/color]
@[table 表名]
| 列1 | 列2 |
| --- | --- |
| 内容 | 内容 |
@[/table]

@[page A4]       @[margin 20mm]
@[font "宋体"]   @[size 11pt]
@[toc depth: 2]  @[comment 批注]
```

完整语法参考见 `manual/Awen编辑器使用手册.html`。

## 项目结构

```
├── preview/
│   ├── template.html    ← 编辑器源码（模板）
│   └── editor.html      ← 构建产物（可直接打开）
├── manual/              ← 使用手册 + 截图
├── src/                 ← Aine 语言核心
├── corpus/              ← 测试文档
├── tauri-app/           ← Tauri v2 桌面应用
├── dist/                ← 打包产物
└── docs/                ← 设计文档
```

## 技术栈

- 前端：原生 HTML/CSS/JavaScript，无框架依赖
- 排版引擎：CJK 排版（镜像 `layout_width` Aine 模块）
- 核心：Aine 语言（编译为原生代码）
- 桌面：Tauri v2（Rust）

## 运行测试

```bash
E:\个人项目\Flow\flowc\target\release\aine.exe test src/tests.aine
```

## 架构

```
User Syntax ──→ lexer(词法) ──→ parser(树) ──→ document(状态) ──→ mapping(映射)
                    ↓                                                                    ↑
                refs(Label/Ref) ←── theme(级联) ←── render(渲染) ←── pipeline(管线) ──┘
```

## License

MIT
