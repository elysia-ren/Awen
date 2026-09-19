# Round-trip 属性测试框架(P-01…P-12)

验证目标:**Syntax → Compile → Render → Display Edit → Syntax Patch 闭环在任意操作序列下不漂移**。
本框架是把总方案 §87 对抗性测试清单工程化为持续运行的属性测试——它是整个架构的验收器,先于编辑器 UI 存在。

## 1. 框架设计

```text
Op Generator(种子确定性随机,自研 LCG,零依赖)
   │  操作集:{insert_text, delete_range, toggle_bold, set_property,
   │          display_drag_commit, syntax_edit, copy_node, move_node,
   │          delete_node, undo, redo, …}
   ▼
Driver:每个 op 走真实闭环
   syntax edit → Buffer.patch → incremental parse → state → (原型期全量 layout)
   display edit → semantic edit → mapping → 最小文本 patch → 同上(规范 §3.5)
   ▼
Oracle 断言(每步后执行)
```

### Oracle(断言器)

| # | 断言 | 实现 |
|---|---|---|
| O1 | 语义等价:重解析后的 Document State 与预期树相等(属性级比较,忽略 NodeId) | awen-state 派生 PartialEq |
| O2 | 逐字保持:本次操作造成的 Buffer diff ⊆ 预期 Span,其余字节逐字不变 | awen-text diff |
| O3 | 收敛:连续 N 轮"无语义操作的视图切换/重渲染"后,Buffer 内容不再变化(不动点) | driver 计数 |
| O4 | ID 不变量集:见 P-05 | awen-types + syntax::reuse |

所有用例以固定种子回放失败序列(可复现),最小化失败样例(缩小 op 序列)后输出。

## 2. 属性用例登记(与 awen-testkit::PROPERTY_CASES 强制同步)

### P-01 语义等价

规范依据:总方案 §85;规范 §3.5

- **Given**:corpus 中任一合法文档状态 S
- **When**:任意操作序列 op₁…opₙ 之后重新全量解析
- **Then**:Document State 与"对 S 逐个应用 op 的预期语义"相等(O1)。
- **反例来源**:全量重解析丢注释、丢方言、丢风格。

### P-02 最小修改与风格保持

规范依据:规范 §3.5;总方案 §37、不变量 6

- **Given**:混合方言文档(中文语法、短命令、特定空格与换行风格)
- **When**:GUI 修改单个属性(如图片宽度 65%→70%)
- **Then**:Buffer diff 恰为该属性值 span(O2);所有未触碰字节逐字不变;不发生方言转换、不重排参数顺序。

### P-03 注释存活

规范依据:总方案 §87;规范 §11.3

- **Given**:含行内 `@[comment ...]` 与块级 `@[comment]…@[/comment]` 注释的文档,注释紧邻图片、标题、表格
- **When**:任意操作序列——GUI 修改注释邻近对象的属性、结构移动、复制粘贴、方言转换
- **Then**:所有 comment 节点文本逐字保留(O2);Document State 不含可渲染注释节点;Canonical 重建后 comment 的 Source Span 仍正确(§11.3:注释属于 User Syntax,不是 Document Node)。
- **状态:BlockedParser**(语法已于规范 §11.3 冻结,等待 M2 解析器)。

### P-04 双视图循环不漂移

规范依据:总方案 §86 第二难题

- **Given**:任意文档
- **When**:Syntax Edit → Display Edit → Syntax Edit → Display Edit … 连续 ≥100 轮(期间穿插视图切换、重渲染)
- **Then**:O3 不动点成立——无语义变化的轮次后文本稳定;最终解析语义 = 各步语义操作的复合。

### P-05 Node ID 不变量

规范依据:规范 §1

- **Given**:增量解析器(M5)运行中
- **When**:修改某段落文本
- **Then**:未受影响子树 NodeId 全部保持(§1.3,机制=子树复用,禁止内容匹配);复制→新 ID;移动→保持;删除后 Undo 恢复→新 ID 且 `@[ref label]` 仍然解析正确(§2.5)。

### P-06 Undo 逐字节还原

规范依据:规范 §4

- **Given**:任意混合操作序列(语义编辑、GUI 属性修改、纯文本输入)
- **When**:连续 Undo 至起点
- **Then**:Buffer 与初始状态逐字节相等;中途每一步 apply(invert) 不产生 PatchMismatch;恢复的删除对象获得新 NodeId(P-05 联动)。

### P-07 临时非法语法不被覆盖

规范依据:规范 §5.A;不变量 9

- **Given**:Syntax View 中用户输入了未完成语法,如 `@[font "Noto Sans`
- **When**:每敲一个字符后执行增量解析 + 渲染
- **Then**:Buffer 从不被解析器改写;已合法部分照常渲染;补全为合法语法后立即完整解析,无内容丢失、无重复。

### P-08 转义完整性

规范依据:规范 §6.8

- **Given**:`@#` `@**` `@_` `@~~` `@-` `@>` `` @` `` `@1.` `@@[...]` 的全部转义形式,以及裸 `@`、`user@example.com`
- **When**:解析 → 渲染 →(GUI 无关编辑)→ 重解析
- **Then**:输出字面与预期逐字符一致;转义序列在词法层被消费,不泄漏到显示文本;`@@[` 优先级始终高于轻量转义。

### P-09 表格属性最小修改

规范依据:规范 §9

- **Given**:管道表格(含 @[cell] 复杂单元格)
- **When**:GUI 修改单元格背景色 / 合并 span / 边框
- **Then**:仅对应 @[cell] 的属性 span 变化(O2);表格其余行逐字不变;修改后表格仍进入同一 TableNode(§9.1)。
- **状态:BlockedUi**(需 GUI Serializer)。

### P-10 编号与 Label 持久性

规范依据:规范 §2、§7

- **Given**:含编号图/表与 `@[ref label]` 的文档
- **When**:在中间插入一张图 / 删除一章再 Undo / 关闭重开(会话重建,NodeId 全换)
- **Then**:语义编号按文档顺序重排(§7.1);ref 经 Label 始终解析成功;页码字段实时路径允许 stale(§7.3)、导出路径 ≤4 次迭代收敛(§7.4)。

### P-11 全角与半角词法等价

规范依据:规范 §6.9–6.10

- **Given**:成对样本:`@[字体 "微软雅黑"]` vs `@[font "微软雅黑"]`;全角引号/冒号 vs 半角;含 U+3000 的未加引号值
- **When**:词法分析
- **Then**:归一化后 Token 流与半角形式完全一致;U+3000 样本产生词法错误且诊断提示"值包含空格,请使用双引号";正文中的 U+3000 原样保留。

### P-12 混合方言接受面

规范依据:规范 §6.14

- **Given**:corpus/all_syntax.awen(中英/长短命令混排)
- **When**:解析
- **Then**:全部方言组合解析为同一语义集;生成器重输出时仅触碰生成 span,不"纠正"用户已有方言;Syntax Language 切换不触发全文重写(总方案 §62)。

## 3. 状态汇总

| 状态 | 用例 |
|---|---|
| BlockedParser(M2/M3 接线) | P-01 02 03 04 05 06 07 08 10 11 12 |
| BlockedUi | P-09 |

当前可跑:`awen-testkit` 的 corpus 覆盖率与登记表一致性测试(`cargo test -p awen-testkit`)。

## 4. 规范缺口收口记录(2026-09-03 全部关闭)

| # | 缺口 | 结论 |
|---|---|---|
| 1 | 源码注释语法缺失 | **已冻结:`@[comment ...]` 为唯一注释机制,注释属于 User Syntax、不产生可渲染节点但保留 Source Mapping**(规范 §11.3);P-03 解除 BlockedSpec |
| 2 | 短命令封闭表未冻结 / `@[i]` 歧义 | **已冻结:b / m / c 三命令**,image 无短命令,总方案 §15 的 i→图片 废止(规范 §11.2) |
| 3 | 文档级设置未登记 | **已冻结:八命令注册表 + 文档头部限定,与作用域设置严格区分**(规范 §11.1) |
| 4 | link / footnote / toc 无语法 | **已冻结:三命令进入核心注册表**(规范 §11.4–11.6);文献引用仍为待定 |

唯一遗留:Cell/Table Border 等属性参数文法(实现期 Serializer,规范附 B#5)。
