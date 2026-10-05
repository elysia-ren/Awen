# CDP 回归测试套件

浏览器级端到端回归。全部脚本假设应用已带调试端口启动:

```bash
# 从 tauri-app/src-tauri/target/release/ 启动
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" ./awen-editor.exe
```

## 单表达式求值器

```bash
node tests/cdp/harness.mjs "JSON.stringify({src:(window.gSrc||'').length})"
```

## 回归脚本(独立 websocket,直接 node 运行)

| 脚本 | 覆盖 |
|---|---|
| `crosspage-delete.mjs` | 多页文档 Ctrl+A 全选(14085 字符)→ Delete 清空 → 光标落占位段 |
| `display-selectall-delete.mjs` | 单页显示视图全选删除(原生全选不含非编辑块的历史 bug) |
| `image-panel-reopen.mjs` | 图片属性面板:点开→改宽→应用→**再点仍能点出面板** |
| `ime-composition.mjs` | 中文输入法:组合中不上源码、compositionend 30ms 补同步、撤销 |
| `keystroke-latency.mjs` | 逐键打字→纸面落地延迟(214ms 级) |
| `syntax-split-burst.mjs` | 分屏语法侧连打:增量路径(parse_blocks)、0 全量重建、无长任务 |
| `smoke-basic.mjs` | 纸面打字/删除基本链 |

注意:部分脚本内嵌测试文档与媒体目录(绝对路径),换机器需改脚本头的
`awenMediaDir` 与 `big_src.awen` 路径。

## 引擎侧

| 脚本 | 覆盖 |
|---|---|
| `../parity.py` | DLL vs 解释器全语义对拍(414 块逐字段) |
| `../fuzz-dll.py` | DLL 500 轮随机文档压测(正确指针管理:restype 必须 c_void_p) |

## 测试规范(C12)

- 测试写入的文档会进应用自动保存草稿(localStorage);**测完必须清理**,否则下次启动会把测试内容恢复进用户文档。
- 清理方式:测试脚本尾部执行 `localStorage.removeItem('awen-autosave');` 或直接 DevTools 清站点数据。
- 发布前:清 localStorage 快照,确认启动为空白文档。
