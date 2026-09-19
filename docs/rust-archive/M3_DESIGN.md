# M3 设计:Document State + Source Mapping + 双视图最小闭环

状态:**M3 验收达成(2026-09-19)**。已完成:M3-a1(块级 Span,corpus 57 节点逐字节对齐)、
M3-a2(Arg 值级字节 Span,引号不含,PartialEq 不含位置元数据)、
M3-b(awen-state:SemNode 树 + IdAllocator 会话分配 + NodeId↔Span 双向索引 +
node_at 反向映射;labels.rs 三种绑定/唯一性/双 resolver 引用解析;
numbering.rs 编号 + TOC + 大纲树 —— corpus 与 Aine oracle 差分对齐:57 节点、
5 个 Label、编号格式一致)。待做:Arg/Inline 区间的 M3-a 收尾(cascade.rs 同期)、
M3-c(awen-edit 事务)、M3-d(属性测试驱动器:EditorSession 会话模型 + LCG 确定性生成器,
P-01/02/04/05/07 全部转绿 —— 20 种子×60 步对抗扫描、120 步长程、固定点采样、
逐字符 P-07 输入路径;PROPERTY_CASES 状态更新为 Driven)。
依据:《Awen核心机制规范》§1–§5(冻结)、《总方案》§33/§36–38/§46/§85–87、`docs/ARCHITECTURE.md` §6、`docs/ROUNDTRIP_TESTS.md`。
参考实现:Aine 原型 `awen-proto-aine/src/{document,mapping,refs,theme,incremental}.aine`。

---

## 1. 目标与验收

M3 回答总方案 §86 的前两个难题:

1. **Source Mapping**:`Render Object → NodeId → PropertyId → SourceSpan → 缓冲区偏移` 在编辑后保持正确;
2. **双界面闭环**:`Syntax Edit → Render → Display Edit → Syntax → …` 循环不漂移。

验收 = 五个属性测试转绿(`awen-testkit::PROPERTY_CASES`):

| 用例 | 核心断言 | M3 机制 |
|---|---|---|
| P-01 语义等价 | 任意操作序列后,重新解析的语义 = 语义操作复合 | 语义指纹 + op 模型 oracle |
| P-02 最小修改 | GUI 改属性 → Buffer diff 恰为该属性值 span,方言/风格逐字不动 | 属性值级 Span(§3.4)+ 定点 patch |
| P-04 双视图不漂移 | 两种视图交替 ≥100 轮后文本稳定、语义 = 复合 | 事务闭合 + 不动点检测 |
| P-05 Node ID 不变量 | 修改文本→未受影响子树 ID 保持;复制→新 ID;删除后恢复→新 ID | 编辑区间相交判定(§3.3) |
| P-07 临时非法语法 | Buffer 永不被解析器改写;补全后无丢失无重复 | 文本即提交(§5.1A)+ 错误恢复解析 |

**范围裁剪(与 M5 的边界)**:M3 的"受影响子树重解析"降级为**全量重解析 + 编辑局部性 ID 携带**(见 D4);真正的子树级增量解析、Span O(1) 平移(§3.3 的算术更新而非重算)属于 M5。P-05 的"未受影响子树保持"在 M3 以**节点 span 与编辑区间不相交**为判据,满足规范义务且不需要增量解析器。

## 2. 架构总览

```text
                    awen-syntax(M2 已完成)
  User Syntax ──lex──▶ 块序列 ──parse──▶ DocNode 树(+span)
      ▲                                    │
      │                                    ▼
   Rope Buffer ◀──TextPatch── awen-edit 事务 awen-state
      ▲              ▲          │            │
      │              │          │            ├─ SemNode 树(NodeId + span)
   Display Edit      │          │            ├─ Label 注册表(§2)
   (语义操作)        │          │            ├─ 语义编号(§7.1)
      │              │          │            └─ 样式级联(§18)
      └──语义操作─────┴──────────┘
```

唯一权威源 = User Syntax(Buffer);一切语义状态由 `当前 Buffer 内容 + 全量解析` 可重建(§3.2)。Display Edit 不直接写状态,只产出语义操作,由事务引擎编译为最小 TextPatch(§3.5)。

## 3. 关键设计决策

### D1 Span 在解析期精确产出,禁止内容匹配

Aine 参考实现的 span 靠"行首标记 + 节点类型启发式匹配"(`mapping.aine::find_node_start`)——这正是规范 §1.3 禁止的内容匹配思路,行粒度也不满足 §3.3 的"禁止以行号作为映射键"。

Rust 侧做法:**解析期直接携带位置**。
- 词法器 `LexedBlock.line` 已有 0 起行号;解析入口对源文构建 `line_starts: Vec<usize>`(每行首字节偏移,O(n) 一次);
- 每个块的字节区间 = `[line_starts[first_line], line_starts[last_line] + last_line_len)`;容器块(Raw/表格)以闭合块行号收尾;§14 合并段落以首行起点、末行终点为区间;
- DocNode 各变体增加 `span: SourceSpan` 字段(§3.2:span 是派生数据,随解析重建,放进解析输出正是其归属)。

### D2 属性值级 Span(§3.4,P-02 的前提)

- `explicit.rs` 的 `Arg` 增加 `span: (usize, usize)`(值在源码中的字节区间;引号不含在内);
- 行内扫描(`lightweight.rs`)为 `Inline` 各变体携带区间(行内偏移,解析入口换算为绝对字节偏移)。这是显示侧"粗斜切换"和后续 PropertyId 分配的基础;
- PropertyId:对**可被 GUI 编辑的属性值**(图片 width、颜色、字号等)在构建 Document State 时分配(§3.1 映射链的第三环);M3 只覆盖最小操作集用到的属性。

### D3 SemNode 用强类型枚举,废弃 Aine 的 catch-all 结构

Aine 的 `SemNode`(kind:String + 全字段可选)是语言限制下的妥协。Rust 侧:

```rust
pub enum SemNode {
    Section  { id: NodeId, level: u8, inline: Vec<Inline>, children: Vec<SemNode>, span: SourceSpan },
    Para     { id: NodeId, inline: Vec<Inline>, span: SourceSpan },
    ListGroup{ id: NodeId, ordered: bool, items: Vec<Vec<Inline>>, span: SourceSpan },
    Quote    { id: NodeId, depth: u8, inline: Vec<Inline>, span: SourceSpan },
    Divider  { id: NodeId, span: SourceSpan },
    Object   { id: NodeId, use_: CommandUse, span: SourceSpan },
    Raw      { id: NodeId, cmd: ExplicitCommand, lang: Option<String>, lines: Vec<String>, span: SourceSpan },
    Table    { id: NodeId, open: CommandUse, header: Option<Vec<Vec<Inline>>>,
               rows: Vec<Vec<Vec<Inline>>>, has_delim: bool, span: SourceSpan },
    Comment  { id: NodeId, text: String, span: SourceSpan },
}

pub struct DocumentState {
    root: Vec<SemNode>,                 // 语义树(与 parse 树同构)
    spans: Vec<SpanEntry>,              // 扁平索引,按 span.start 升序
    by_id: HashMap<NodeId, usize>,      // NodeId → spans 下标
    ids: IdAllocator,                   // awen-types,会话内不复用(§1.1)
}
```

扁平 span 索引支撑 §3.1 的查询链(`NodeId → span` 二分;`偏移 → 所属节点` 二分),语义树支撑结构查询(大纲/子树)。

### D4 ID 携带 = 编辑区间相交判定(§3.3 的直接实现)

事务第 3 步"复用其余子树"在 M3 的实现:

```text
对旧树每个节点,取其旧 span:
  span.end ≤ edit.start        → ID 保持,span 不变(编辑点之前)
  edit.end ≤ span.start        → ID 保持,span.start += Δ,end += Δ(整体平移,§3.3)
  span 与 [edit.start, edit.end) 相交 → ID 消亡,重解析产物领新 ID(§1.4 语义身份改变)
```

- `Δ = new.len() - old.len()` 是一次算术减法——§3.3"编辑点之后 Span 整体平移"的落点(M3 用于 ID 判定与增量提示,M5 才把"免重算"用在免重解析上);
- **结构前提**:事务以"单条最小 Patch"为单位,编辑前后的树在编辑区外逐节点同构(非编辑区不产生分支差异),因此按文档序一一对应携带;多补丁编辑 = 多次事务;
- 复制节点 = 副本落在编辑区语义之外但结构重复 → 按规则领新 ID(§1.4 复制→新 ID);删除后 Undo 恢复 = 恢复区重解析 → 新 ID(§1.4/§4.3),持久引用由 Label 保证(§2);
- **禁令自查**:全程无"按文本内容找旧 ID"。

### D5 事务管线(§3.5 的 M3 版)

```rust
pub enum SemanticOp {
    InsertText { at: usize, text: String },          // 纯文本输入(语法视图)
    DeleteText { range: (usize, usize) },
    EditHeadingText { node: NodeId, text: String },  // 保留行内命令(§87)
    SetObjectAttr { node: NodeId, key: String, value: String },  // P-02
    ToggleWrap { node: NodeId, marker: &'static str, range: (usize, usize) }, // ** _ ~~
}

pub struct EditOutcome {
    pub patch: TextPatch,        // 写入 Buffer 的最小补丁
    pub state: DocumentState,    // 新语义状态(ID 已携带)
    pub id_events: Vec<IdEvent>, // 保持/平移/消亡/新生(测试与 UI 增量用)
    pub diags: Vec<Diagnostic>,
}
```

流程:`SemanticOp → compile(op, state) → TextPatch → buffer.apply → parse → id 携带 → DocumentState + id_events`。Buffer 是唯一权威:任何一步失败(如 PatchMismatch),丢弃中间态重放,绝不回写用户文本(§5.1A、不变量 9)。

### D6 Undo 最小栈(§4)

`patch + invert` 双栈;语义元数据(NodeId/op 类型)只记在旁路用于 UI 合并优化,**缺失不影响正确性**(§4.2);M3 实现逐 patch 回放与 §4.4 的三条合并规则中的"连续同类文本输入合并",其余留 M4(P-06 验收在 M4)。

### D7 Transient 两子态(§5.1)

- **A 态(语法侧)**:无需提交动作——Buffer 即提交;解析诊断只影响渲染降级,不阻断;
- **B 态(视觉侧)**:`SetObjectAttr` 等连续手势先在 `transient.rs` 聚合为 PendingPatch(值域相互覆盖),去抖边界一次性走 D5 事务;两个子态都禁止"重新生成用户源码"。

## 4. 模块规划与实施顺序

| 步骤 | 内容 | 涉及 crate | 验收 |
|---|---|---|---|
| **M3-a Span 基建** | ~~line_starts 表;DocNode 带 span~~(a1 已完成:LexedBlock 精确字节区间 + DocNode 组合 + corpus 57 节点逐字节对齐);`Arg` 值级 span;`Inline` 区间 | awen-syntax | 现有测试全绿 + span 单测(节点区间与源码逐字节对齐)✅ |
| **M3-b awen-state**(已完成,除 cascade) | SemNode 构建 + ID 分配 + 扁平索引 + node_at 反查;`labels.rs`(注册表/唯一性/§2.4 三种绑定/§2.5 双 resolver);`numbering.rs`(编号/TOC/大纲树) | awen-state | ✅ corpus 差分对齐:57 节点、5 个 Label、编号格式一致;9 个验收测试 |
| **M3-c awen-edit**(核心已完成) | D5 事务引擎(apply_op:patch→Rope→重解析→D4 ID 携带);`mapping.rs`(属性值绝对 span/标题行重组 §87);`transient.rs`(B 态聚合 §5.1B);`undo.rs`(双栈 §4) | awen-edit | ✅ 8 个闭环测试:标题改文本不丢 label 且 ID 保持;width 65→70 diff 恰为值 span;删除→Undo 恢复新 ID;交替编辑不动点 |
| **M3-d 属性测试**(已完成) | testkit 驱动器:EditorSession 会话模型、LCG 确定性生成器(插入/删除/属性/标题/Undo)、种子回放 | awen-testkit | ✅ P-01/02/04/05/07 转绿:20 种子×60 步 + 120 步长程 + P-07 逐字符路径 |

依赖方向:`awen-state → {awen-types, awen-syntax}`;`awen-edit → + awen-text`;`awen-testkit → 全部`。零第三方依赖策略不破。

## 5. 属性测试映射

- **P-01**:op 模型 = 语义指纹的可逆操作记录;每 N 步后全量重解析,指纹与模型比对;反例自动缩小到最小 op 序列(固定种子回放);
- **P-02**:对 corpus + 混合方言样本执行 `SetObjectAttr`,断言 `buffer.diff()` 与属性值 span 相等且其余字节不动(含中文方言名 `@[图片 65%]` 不被转换);
- **P-04**:syntax op 与 display op 交替 ≥100 轮,穿插全量渲染(纯文本投影);无语义变化轮后断言 Buffer 字节不动(不动点);
- **P-05**:每步后校验 id_events:非相交区节点 ID 集合保持;`copy_node`/删除后 undo 恢复 → 新 ID;`@[ref label]` 在恢复后仍解析(§2.5 双 resolver 字段分离);
- **P-07**:逐字符输入 `@[font "Noto Sans` → 每步断言 buffer 未被改写、诊断非阻断;补全 `]` 后全量解析无损。

## 6. 开放问题(实施期裁决)

1. **ToggleWrap 的选区映射**:无 inline span 时粗斜切换无法定位源码区间——已由 M3-a(D2)解决;选区与标记重叠时的最小 patch 形态(** 插入点选择)实施期定;
2. **B 态聚合键**:以 (NodeId, PropertyId) 还是属性字节 span 为聚合键——倾向后者(纯文本层可判,不依赖 ID 存活);
3. **Quote 逐行节点的显示映射**:连续引用行在显示上是单块;M3 保持逐行节点,显示聚合留给渲染层;
4. **文档级设置对象(根层 @[font] 等)是否参与 ID 携带**——参与(它们是普通 Object 节点),但 P-02 首批只覆盖图片属性。

## 7. 移交与边界

- **Inline 行内区间(M3-a3)移交 M4 GUI 前置项**:五个验收属性均不依赖显示侧粗斜切换
  (语法视图输入 `**` 走 P-07 路径已验证);显示侧 ToggleWrap 需要行内区间后实施。

## 8. 明确不做(M3 边界外)

- 子树级增量解析与解析缓存(M5,`incremental/reuse.rs`);
- Span 的免重算 O(1) 维护(M3 每事务重算,M5 平移);
- Canonical Patch、持久化容器(M4);
- 页码 resolver / 增量布局(M5,layout crate);
- 行内链接自动识别等行内树精化(`parser/inline.rs`,按需)。
