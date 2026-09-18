# Awen 原型(Aine 版)

Awen 文档格式的词法器 + 解析器 + Document State + Source Mapping + 双视图闭环,用 **Aine** 语言实现。

## 架构

```
User Syntax ──→ lexer(词法) ──→ parser(树) ──→ document(状态) ──→ mapping(映射)
                    ↓                                                                    ↑
                refs(Label/Ref) ←── theme(级联) ←── render(渲染) ←── pipeline(管线) ──┘
```

## 模块

| 模块 | 规范 | 职责 |
|---|---|---|
| diag | — | 诊断输出 |
| registry | §11 | 命令白名单 + 中文别名 |
| fullwidth | §6.9 | 全角归一化(上下文敏感) |
| escape | §6.8 | 转义(@@[ / @# / @** 等) |
| explicit | §6.1/§11 | 命令头解析(参数/属性/原文) |
| lightweight | §6.2-6.7 | 轻量层分类+行内扫描 |
| lexer | §6/§9 | 词法编排(Raw/表格状态机) |
| parser | — | 语法树构建(列表组/表格/Raw) |
| document | §1/§五 | Document State + NodeId |
| mapping | §3/§85 | Source Span + 编辑闭环 |
| refs | §2 | Label 解析 + 引用验证 |
| theme | §18 | 样式级联(direct > role > theme) |
| render | — | 渲染管线(样式应用) |
| incremental | §1.3 | 增量解析(变更检测+复用) |
| pipeline | §85 | 完整管线(lex→parse→render) |
| cjk | §10 | CJK 排版验证(禁则/间距/挤压) |
| toc | §11.6 | 目录生成(编号+缩进) |
| diff | §8.6 | 行级差异(Git 集成) |
| inspect | §75 | awen inspect 输出 |
| seed | §2.2/§3.3/§4 | Buffer/Patch/Span/Label |

## 运行

```bash
cd E:\个人项目\Awen文档\awen-proto-aine

# 测试(80 个)
E:\个人项目\Flow\flowc\dist\aine-0.1.0-single\aine.exe test src/tests.aine

# 演示
E:\个人项目\Flow\flowc\dist\aine-0.1.0-single\aine.exe run src/main.aine

# 检查
E:\个人项目\Flow\flowc\aine.exe check src/main.aine
```

## 里程碑

| 里程碑 | 状态 |
|---|---|
| M0 骨架 | ✅ |
| M1 文本缓冲区 | ✅ |
| M2a 词法器 | ✅ |
| M2b 语法树 | ✅ |
| M3 Document State | ✅ |
| M4 Source Mapping + 闭环 | ✅ |
| M5 增量解析(基础) | ✅ |

详见 `docs/PORT_NOTES.md`。
