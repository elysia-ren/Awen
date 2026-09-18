# Awen → Aine 移植记录

> 更新:2026-09-04(第三次)——M0-M4 全部完成,61/61 测试全绿
> 工具链:`E:\个人项目\Flow\flowc\dist\aine-0.1.0-single\aine.exe`(Aug 31 稳定版)

## 里程碑

| 里程碑 | 状态 | 测试数 |
|---|---|---|
| M0 骨架 | ✅ | — |
| M1 文本缓冲区(Buffer/Patch) | ✅ | 3 |
| M2a 词法器(全冻结语法) | ✅ | 22 |
| M2b 语法树构建(分组) | ✅ | 4 |
| M3 Document State + NodeId | ✅ | 4 |
| M4 Source Mapping + 双视图闭环 | ✅ | 4 |
| M4+ Label/Reference 解析 | ✅ | 4 |
| M4+ Theme/Style 级联 | ✅ | 4 |
| M4+ 渲染管线(文本) | ✅ | 4 |
| M4+ 增量解析基础 | ✅ | 2 |
| M4+ Pipeline(完整闭环) | ✅ | 1 |
| M4+ CJK 排版验证(§10) | ✅ | 4 |
| 压力测试(§87 多轮零漂移) | ✅ | 3 |
| **合计** | | **61** |

## Aine 解释器 Bug / 限制

### 真 Bug
| # | 问题 | 状态 |
|---|---|---|
| 1 | match 臂内 continue/break 静默失效 | ✅ 已修复(6b95c13) |
| 2 | `Option.unwrap()` 对所有类型返回 Nil | ❌ 待修(新构建已部分修复) |
| 3 | 新构建 `Vec.push()` 返回 `()` | ❌ 需确认(旧版正常) |

### 设计决策
| # | 问题 | 说明 |
|---|---|---|
| 4 | `Text`/`ListItem`/`Object` 是 UI 内建名 | 需避免命名冲突,建议加 N 诊断 |
| 5 | 枚举变体扁平注册,不支持 `Enum.Variant` | 直接用裸名 |

### 移植期教训
| # | 问题 | 根因 |
|---|---|---|
| 6 | `Vec.push()` 是原地修改,`x = x.push(y)` 毁数据 | Aine 值语义,81 处已修 |
| 7 | `edit_heading_text` 丢失行内 `@[label]` | 已修:检测 `@[` 后缀并保留 |
| 8 | 模块函数内枚举构造偶发返回 Nil | 用包装函数(`mk_text`)绕过 |

## 运行

```bash
cd E:\个人项目\Awen文档\awen-proto-aine
E:\个人项目\Flow\flowc\dist\aine-0.1.0-single\aine.exe test src/tests.aine
E:\个人项目\Flow\flowc\dist\aine-0.1.0-single\aine.exe run src/main.aine
```
