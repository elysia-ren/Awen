# Awen 原型架构(awen-proto)

状态:M0(骨架)。目标:验证核心闭环 **Syntax → Compile → Render → Display Edit → Syntax Patch**。
依据文档:《Awen文档格式与编译渲染系统.md》(下称"总方案")、《Awen核心机制规范.md》v0.3(下称"规范",冲突时以此为准)。

## 1. 技术选型

Rust workspace。理由:Canonical 版本化二进制协议、毫秒级增量预算(总方案 §45)、CJK 排版的计算密度(规范 §10)。UI 层后续另定,不进本 workspace。

## 2. Workspace 目录结构(●已建 ○待建)

```text
awen-proto/
├── Cargo.toml                          ● workspace 定义
├── README.md                           ●
├── docs/
│   ├── ARCHITECTURE.md                 ● 本文
│   └── ROUNDTRIP_TESTS.md              ● 属性用例 P-01…P-12 与 oracle 设计
├── corpus/
│   ├── all_syntax.awen                 ● 全冻结语法正样本(全语法测试文件)
│   └── edge_cases.awen                 ● 消歧/字面/预期错误样本
└── crates/
    ├── awen-types/                     ● 基础类型与不变量种子
    │   └── src/
    │       ├── lib.rs                  ● NodeId/PropertyId/IdAllocator/Label/SourceSpan + 规则测试
    │       ├── id.rs                   ○ M2 拆分:ID 分配策略(§1)
    │       ├── label.rs                ○ M2 拆分:Label 与注册表接口(§2)
    │       ├── span.rs                 ○ M2 拆分:Span 编辑规则(§3.3)
    │       └── version.rs              ○ Syntax/Document/Canonical 三版本(总方案 §10)
    ├── awen-text/                      ● 文本缓冲区
    │   └── src/
    │       ├── lib.rs                  ● Buffer + TextPatch(§4.1)+ 逆操作测试
    │       ├── rope.rs                 ● 分块 Rope(总方案 §32,M1 已完成,差分测试 + §32 基准)
    │       └── piece_table.rs          ○ 备选实现基准
    ├── awen-syntax/                     ● 词法 + 树构建已完成(M2a+M2b);增量解析待做(M5)
    │   └── src/
    │       ├── lib.rs                  ●
    │       ├── diag.rs                 ● 诊断(含规范引导性提示)
    │       ├── registry.rs             ● 显式命令白名单注册表(§11,含中文方言别名)
    │       ├── lexer/
    │       │   ├── mod.rs              ● 词法编排:逐行分类 + Raw/表格状态机
    │       │   ├── lightweight.rs      ● 轻量层(§6.2–6.7、§6.11–6.13)+ 行内扫描(§6.4–6.5)
    │       │   ├── explicit.rs         ● 命令头解析(§6.1、§11:参数/属性/原文内容)
    │       │   ├── escape.rs           ● 转义(§6.8:`@@[` 优先级最高)
    │       │   └── fullwidth.rs        ● 全角归一化上下文敏感封闭表(§6.9–6.10)
    │       ├── tests/lexer_spec.rs     ● corpus 零错误 + edge 消歧 + P-08/P-11 词法级
    │       ├── parser/
    │       │   ├── mod.rs              ● M2b 已完成:DocNode 树 + parse 入口
    │       │   ├── block.rs            ● 块级树(§14 段落归并/列表组/标题嵌套栈)
    │       │   ├── inline.rs           ○ 行内树精化(链接自动识别等,按需)
    │       │   ├── raw.rs              ● Raw Block 扫描(逐字保留,§6.7)
    │       │   └── table.rs            ● TableNode(§9:表头提升/分隔行)
    │       ├── incremental/            ● 行级缓存复用(M5-c:守卫回退/模糊测试)
    │       │   ├── mod.rs              ○
    │       │   ├── reuse.rs            ○ 子树复用 = ID 稳定机制(§1.3;禁止全量重解析+内容匹配)
    │       │   └── recovery.rs         ○ 错误恢复(§5.A;绝不回写用户文本)
    │       ├── tree.rs                 ○ 语法树 + NodeId 分配
    │       └── diag.rs                 ○ 诊断(错误不阻断整体解析)
    ├── awen-state/                     ● Document State(M3:树/ID/Span 索引/Label/编号)
    │   └── src/
    │       ├── lib.rs                  ● 规划文档
    │       ├── nodes.rs                ○ 语义节点类型(总方案 §二十九)
    │       ├── labels.rs               ○ Label 注册表/唯一性(§2.3)
    │       ├── numbering.rs            ○ 语义编号(§7.1)+ Numbering 配置(§7.6)
    │       └── cascade.rs              ○ 样式级联:direct > role > theme
    ├── awen-canonical/                 ● 持久化编译缓存(M4:表/编解码/有效性/Patch diff)
    │   └── src/
    │       ├── lib.rs                  ● 规划文档
    │       ├── tables.rs               ○ Node/String/Style/Resource Table(总方案 §六–七)
    │       ├── encode.rs               ○ 版本化类型化二进制协议
    │       ├── decode.rs               ○
    │       ├── patch.rs                ○ 增量 Canonical Patch(总方案 §41)
    │       └── validity.rs             ○ Hash+版本三元组有效性(§8.2;校验=重建)
    ├── awen-layout/                    ● 布局引擎(M5:全量分页/断行/禁则/收敛 + 增量排版 + 挤压)
    │   └── src/
    │       ├── lib.rs                  ● 规划文档
    │       ├── flow.rs                 ○ 分页/流式排版
    │       ├── cjk.rs                  ○ 禁则/挤压/混排间距(规范 §10)
    │       ├── numbering.rs            ○ 页码 resolver(§7.2;实时 stale/导出收敛 §7.3–7.4)
    │       └── invalidate.rs           ○ 失效传播 + 稳定点终止(总方案 §42)
    ├── awen-render/                    ○ 渲染树(M3)
    │   └── src/lib.rs                  ● 唯一硬性要求:RenderObject 携带 NodeId(总方案 §33)
    ├── awen-edit/                      ● 双视图闭环核心(M3:事务/ID 携带/mapping/B 态/Undo)
    │   └── src/
    │       ├── lib.rs                  ● 规划文档
    │       ├── mapping.rs              ○ Source Mapping:RenderObject→NodeId→PropertyId→Span(§3.1)
    │       ├── transaction.rs          ○ 语义编辑→最小文本 Patch→局部重解析(§3.5)
    │       ├── transient.rs            ○ Transient Edit State 两子态(§5.1–5.3)
    │       └── undo.rs                 ○ 文本 Patch 栈(§4)
    ├── awen-file/                      ● .awen 容器(M4:v0.4 清单/明文源码区/原子提交)
    │   └── src/
    │       ├── lib.rs                  ● 规划文档
    │       ├── manifest.rs             ○ 清单
    │       ├── chunk.rs                ○ per-chunk codec;User Syntax chunk 必须 codec=none(§8.6)
    │       └── journal.rs              ○ 原子提交只保护 User Syntax+资源(§8.4)
    ├── awen-cli/                       ● CLI(M4 实装 validate/inspect/compile/diff/extract-source)
    │   └── src/main.rs                 ● inspect/validate/compile/render/diff/extract-source
    └── awen-testkit/                   ● 属性测试框架(M3-d 驱动器已接线)
        ├── src/lib.rs                  ● 用例登记表 + corpus 定位 + REQUIRED_CONSTRUCTS
        └── tests/
            └── corpus_coverage.rs      ● 立即可跑:corpus 覆盖率 + 用例↔文档一致性
```

## 3. Crate 依赖关系

```text
awen-types ──► awen-text ──► awen-syntax ──► awen-state ──► awen-canonical ──► awen-layout ──► awen-render
     │              │             │                                   │
     └──────────────┴─────────────┴─► awen-edit(闭环:_mapping/transaction/transient/undo)
                                                          │
                     awen-file(canonical+text)◄───────────┘(仅依赖方向示意)
awen-cli、awen-testkit ──► 依赖以上全部(testkit 仅 dev 联调)
```

原则:依赖严格沿数据流单向;`awen-edit` 是唯一允许横跨 text/syntax/state 的编排层。

## 4. 规范 → 模块映射表

### 核心机制规范 v0.3

| 规范条款 | 内容 | 模块 / 文件 | 状态 |
|---|---|---|---|
| §0 | 术语总表 | awen-types | ● 种子 |
| §1.1–1.6 | Node ID 生命周期 | awen-types(lib.rs IdAllocator)→ M2 拆 id.rs;awen-syntax::incremental::reuse | ● 种子 / ○ 复用 |
| §2.1–2.6 | Label 与 Reference | awen-types(Label 校验 ●)+ awen-state::labels ○ | 部分 |
| §3.1–3.5 | Source Mapping / Span | awen-types::span(编辑规则 ●)+ awen-edit::mapping ○ | 部分 |
| §4.1–4.5 | Undo/Redo | awen-text(lib.rs TextPatch ●)+ awen-edit::undo ○ | 部分 |
| §5.1–5.3 | Transient Edit State | awen-edit::transient | ○ |
| §6.1–6.7 | 两层语法/轻量词法 | awen-syntax::lexer::lightweight + parser::inline/block | ○ |
| §6.8 | 转义与优先级 | awen-syntax::lexer::escape | ○ |
| §6.9–6.10 | 全角归一化 / U+3000 | awen-syntax::lexer::fullwidth | ○ |
| §6.11–6.13 | 触发条件/总原则/冻结清单 | lexer::lightweight + testkit::REQUIRED_CONSTRUCTS | ● 基准已建 |
| §6.14 | 混合方言 | lexer/parser(接受面);Generator(M4 后) | ○ |
| §7.1–7.5 | 编号/页码两级解析 | awen-state::numbering + awen-layout::numbering | ○ |
| §7.6 | Numbering 配置(六 token) | awen-state::numbering | ○ |
| §8.1–8.6 | Canonical Cache / 容器 | awen-canonical + awen-file | ○ |
| §9.1–9.7 | 表格(管道/cell/单一 TableNode) | awen-syntax::parser::table | ○ |
| §10.1–10.3 | CJK 排版验收 | awen-layout::cjk | ○ M5+ |
| 附B#5 | Border 参数文法 | (实现期 Serializer,未建) | — |
| §11.0–11.7 | 显式语法注册表:comment / 短命令 b·m·c / 文档级八命令 / link·footnote·toc | awen-syntax::lexer::explicit + parser;awen-state::nodes(LinkNode/FootnoteNode/TocNode) | ○ M2/M3 |

### 总方案关键条款

| 条款 | 内容 | 模块 | 状态 |
|---|---|---|---|
| §10 | 三类版本区分 | awen-types::version | ○ |
| §19–20 | 文档级设置/默认排版 | parser + awen-state::cascade | ○ |
| §21–29 | 文本/标题/列表/图片/表格能力 | awen-state::nodes + parser | ○ 按 M3 特性集裁剪 |
| §31 | 增量解析 | awen-syntax::incremental | ○ M5 |
| §32 | Rope/Piece Table | awen-text::rope | ○ M2 |
| §33–35 | NodeId/PropertyId/SourceSpan | awen-types | ● |
| §36–38 | 渲染→语法回写/最小修改/风格保持 | awen-edit::mapping + transaction | ○ M3 |
| §40 | 临时非法语法 | awen-syntax::incremental::recovery | ○ |
| §42–44 | 增量布局/渲染/缓存 | awen-layout + awen-render | ○ M5 |
| §45 | 性能预算表 | benches/(未建) | ○ M5 |
| §69 | Undo | awen-edit::undo | ○ |
| §70–74 | 保存/崩溃恢复/完整性 | awen-file | ○ M4 |
| §75–76 | 开发者工具 | awen-cli | ● 子命令骨架 |

## 5. 数据流与 crate 对应

```text
User Syntax ──► awen-text(Buffer)──► awen-syntax(Incremental Parse)──► awen-state ──► awen-canonical ──► awen-layout ──► awen-render ──► Display View
      ▲                                                                                                              │
      └──────────────────── awen-edit(用户在 Display 的编辑 → 最小文本 Patch,唯一回写通道)◄────────────────────────┘
```

不变量(总方案 §79)在代码中的落点:不变量 1/2 = awen-edit 是唯一写通道;不变量 3 = awen-canonical::validity;不变量 5 = awen-types;不变量 6/7/8 = transaction patch + reuse + invalidate;不变量 9 = recovery;不变量 10 = parser::table + REQUIRED_CONSTRUCTS 覆盖率测试。

## 6. 里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M0(现在) | 骨架 + corpus + 用例登记 | `cargo test` 全绿(种子测试) |
| M1(已完成 2026-09-19) | awen-text 定稿(Rope 换入) | §32 基准(release):1 MB 文档高频插入 13x、Undo 回放 164x 优于整串实现;`cargo test -p awen-text --release -- --ignored --nocapture` |
| M2(已完成 2026-09-19) | awen-syntax 解析器。M2a 词法层 + M2b 树构建(DocNode/§14 段落归并/标题嵌套/Raw/表格) | corpus 结构与 Aine 原型差分对齐(13 标题/15 段落/2 列表/5 Raw/2 表格/57 节点/零诊断);`cargo test` 全绿 |
| M3(**已完成 2026-09-19**) | awen-state + Source Mapping + **最小闭环**;设计见 `docs/M3_DESIGN.md` | ✅ P-01/02/04/05/07 转绿:20 种子×60 步对抗扫描 + 120 步长程;96 测试全绿 |
| M4(**已完成 2026-09-19**) | awen-file 容器(明文源码区/原子提交)+ awen-canonical(表/编解码/有效性三元组/Patch diff)+ §4.4 Undo 合并 | ✅ P-06/P-10 转绿;CLI validate/inspect/compile/diff/extract-source 实装 |
| M5(**已完成 2026-09-19**) | 增量解析(行级缓存复用)+ 增量布局(失效传播/稳定点)+ CJK(挤压/全半角集中化)+ bench | ✅ P-03/P-12 转绿(P-09 待 Inline 区间,随 GUI);§45 bench 达标 |

两个变量不同时动:M3 证"闭环正确"(全量排版),M5 证"增量够快"。

## 7. 构建与测试

```bash
cargo test                     # 全 workspace(当前:M0 种子测试)
cargo test -p awen-testkit     # corpus 覆盖率 + 用例↔文档一致性
cargo run -p awen-cli          # CLI
cargo run -p awen-cli inspect x.awen   # (M4 起可用)
```

零外部依赖策略:M4 前不引入任何第三方 crate(Rope/Zstd/proptest 到期自行评估),保证骨架离线可构建。

## 8. 规范缺口登记(骨架工作发现)

原 4 项缺口(注释语法、短命令封闭表、文档级设置登记、link/footnote/toc)已于 2026-09-03 **全部收口**,冻结为规范 §11 显式语法注册表;收口记录见 `docs/ROUNDTRIP_TESTS.md` §4。唯一遗留为 Border 参数文法(实现期 Serializer)。
