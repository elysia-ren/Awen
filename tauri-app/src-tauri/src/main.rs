// awen-editor —— Tauri 桌面版后端
//
// 权威解析:JS 侧 Bridge.parse → core_parse 命令 → spawn aine.exe run
// src/tauri_cli.aine(读 build/cli_in.awen,写 build/cli_out.json)。
// aine 运行时(aine.exe + aine.toml + src/)随应用打包为资源目录
// aine-runtime/;开发期可用环境变量 AWEN_AINE_DIR 直接指向仓库根。
// spawn 必须带 CREATE_NO_WINDOW,否则每次解析闪黑窗(aine.exe 是控制台程序)。
//
// 单实例 + 文件关联:二次启动/双击 .awen 时,文件路径经 awen-open-path 事件
// 转发给已有窗口,由前端加标签(桥:Bridge.listenOpenPath)。
//
// aine_cli 路径约定见 src/tauri_cli.aine 头注释;并发由 AineLock 串行化。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct AineLock(Arc<Mutex<()>>);

// ── aine 常驻 Core(daemon):单进程长期驻留,stdin/stdout 行协议 ──
// 请求:{"id":N,"op":"parse|pack|unpack",...};响应:{"id":N,"ok":true,"result":"..."}
// 消灭每次解析的进程启动成本(外部 aine.exe 每次要重载全部模块)。
struct AineSession {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
    stdout: std::io::BufReader<std::process::ChildStdout>,
}

static DAEMON: Mutex<Option<AineSession>> = Mutex::new(None);
// 全量解析结果缓存(请求串 → 响应):size-1,同源码同配置秒回
static PARSE_CACHE: Mutex<Option<(String, String)>> = Mutex::new(None);

fn daemon_spawn(app: &AppHandle) -> Result<AineSession, String> {
    let dir = aine_dir(app)?;
    let exe = dir.join("aine.exe");
    if !exe.is_file() {
        return Err(format!("aine.exe 不存在:{}", exe.display()));
    }
    let mut cmd = Command::new(&exe);
    cmd.args(["run", "src/tauri_cli.aine", "daemon"]).current_dir(&dir);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let mut child = cmd.spawn().map_err(|e| format!("aine daemon 启动失败:{e}"))?;
    let stdin = child.stdin.take().ok_or("daemon 无 stdin")?;
    let stdout = child.stdout.take().ok_or("daemon 无 stdout")?;
    Ok(AineSession { child, stdin, stdout: std::io::BufReader::new(stdout) })
}

fn daemon_call(sess: &mut AineSession, req: &str) -> Result<String, String> {
    use std::io::{BufRead, Write};
    sess.stdin
        .write_all(format!("{}
", req).as_bytes())
        .map_err(|e| format!("daemon 写失败:{e}"))?;
    sess.stdin.flush().ok();
    let mut line = String::new();
    sess.stdout
        .read_line(&mut line)
        .map_err(|e| format!("daemon 读失败:{e}"))?;
    if line.trim().is_empty() {
        return Err("daemon 连接关闭".into());
    }
    Ok(line.trim().to_string())
}

// 带一层重试:会话异常(写入/读取失败)时重启 daemon 再试一次
// ── 原生管线 DLL(rlib a + C 线合流)──────────────────────
// awen_pipeline.dll:33 模块编译产物,导出 awen_pipeline(src)->json / awen_free。
// 仅服务 op=parse 且 cfg 与内置几何一致(DLL 固化 A4/20mm/11pt/1.65);
// 任一条件不满足或调用失败 → Err 走降级链。
struct DllApi {
    pipeline: unsafe extern "system" fn(
        *const std::ffi::c_char,
        f64, f64, f64, f64, f64,
        *const std::ffi::c_char,
        *const std::ffi::c_char,
        *const std::ffi::c_char,
    ) -> *mut std::ffi::c_char,
    relay: unsafe extern "system" fn(
        *const std::ffi::c_char,
        f64, f64, f64, f64, f64,
        *const std::ffi::c_char,
        *const std::ffi::c_char,
        *const std::ffi::c_char,
    ) -> *mut std::ffi::c_char,
    free: unsafe extern "system" fn(*mut std::ffi::c_char),
    _lib: libloading::Library,
}

static DLL_API: Mutex<Option<std::sync::Arc<DllApi>>> = Mutex::new(None);
static DLL_CALL_LOCK: Mutex<()> = Mutex::new(());

fn dll_load(app: &AppHandle) -> Result<std::sync::Arc<DllApi>, String> {
    let mut g = DLL_API.lock().map_err(|_| "dll 锁中毒".to_string())?;
    if let Some(api) = g.as_ref() {
        return Ok(api.clone());
    }
    let dir = aine_dir(app)?;
    let path = dir.join("awen_pipeline.dll");
    if !path.is_file() {
        return Err(format!("{} 不存在", path.display()));
    }
    unsafe {
        let lib = libloading::Library::new(&path).map_err(|e| format!("加载 dll 失败:{e}"))?;
        let pipeline: unsafe extern "system" fn(
            *const std::ffi::c_char,
            f64, f64, f64, f64, f64,
            *const std::ffi::c_char,
            *const std::ffi::c_char,
            *const std::ffi::c_char,
        ) -> *mut std::ffi::c_char =
            *lib.get(b"awen_pipeline\0").map_err(|e| format!("缺 awen_pipeline:{e}"))?;
        let relay: unsafe extern "system" fn(
            *const std::ffi::c_char,
            f64, f64, f64, f64, f64,
            *const std::ffi::c_char,
            *const std::ffi::c_char,
            *const std::ffi::c_char,
        ) -> *mut std::ffi::c_char =
            *lib.get(b"awen_relayout\0").map_err(|e| format!("缺 awen_relayout:{e}"))?;
        let free: unsafe extern "system" fn(*mut std::ffi::c_char) =
            *lib.get(b"awen_free\0").map_err(|e| format!("缺 awen_free:{e}"))?;
        let api = std::sync::Arc::new(DllApi { pipeline, relay, free, _lib: lib });
        *g = Some(api.clone());
        Ok(api)
    }
}

fn dll_call(app: &AppHandle, req: &str) -> Result<String, String> {
    // DLL 全管线读写 @global 槽,并发调用会互相覆盖(串档)——整调用持锁
    let _dll_guard = DLL_CALL_LOCK.lock().map_err(|_| "dll 调用锁中毒".to_string())?;
    let v: serde_json::Value = serde_json::from_str(req).map_err(|e| format!("req 非 json:{e}"))?;
    let op = v.get("op").and_then(|x| x.as_str()).unwrap_or("");
    if op != "parse" && op != "relayout" {
        return Err("dll 仅支持 op=parse/relayout".into());
    }
    let api = dll_load(app)?;
    let src = v.get("src").and_then(|x| x.as_str()).unwrap_or("");
    if src.is_empty() {
        return Err("dll 空 src".into());
    }
    // 几何与宽表全部从 cfg 透传(DLL 引擎原生支持)
    let cfg = v.get("cfg").cloned().unwrap_or(serde_json::json!({}));
    let getf = |k: &str, d: f64| cfg.get(k).and_then(|x| x.as_f64()).unwrap_or(d);
    let widths = cfg.get("widths");
    let wf_s = widths.and_then(|w| w.get("s")).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let wf_e = widths.and_then(|w| w.get("e")).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let wf_w_flat = widths
        .and_then(|w| w.get("w"))
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_f64()).map(|f| format!("{}", f)).collect::<Vec<_>>().join(","))
        .unwrap_or_default();
    let c_src = std::ffi::CString::new(src).map_err(|_| "src 含 NUL".to_string())?;
    let c_s = std::ffi::CString::new(wf_s).map_err(|_| "wf_s 含 NUL".to_string())?;
    let c_e = std::ffi::CString::new(wf_e).map_err(|_| "wf_e 含 NUL".to_string())?;
    let c_w = std::ffi::CString::new(wf_w_flat).map_err(|_| "wf_w 含 NUL".to_string())?;
    unsafe {
        let call = if op == "parse" { api.pipeline } else { api.relay };
        let ptr = (call)(
            c_src.as_ptr(),
            getf("pw", 210.0), getf("ph", 297.0), getf("mg", 20.0), getf("fp", 11.0), getf("ls", 1.65),
            c_s.as_ptr(), c_e.as_ptr(), c_w.as_ptr(),
        );
        if ptr.is_null() {
            return Err("dll 返回 null".into());
        }
        let out = std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned();
        (api.free)(ptr);
        // daemon 协议: result 是字符串化 JSON
        let result_str = serde_json::to_string(&out).unwrap_or_else(|_| format!("\"{}\"", out));
        let id = v.get("id").and_then(|x| x.as_i64()).unwrap_or(1);
        Ok(format!("{{\"id\":{},\"ok\":true,\"result\":{}}}", id, result_str))
    }
}

// ── 进程内嵌 aine 解释器(rlib 阶段 a)────────────────────────
// Interp 常驻专有线程(512MB 大栈,递归解释器必需):load 一次
// tauri_cli.aine(32 模块),此后每个请求经 channel 直调 daemon_handle,
// 消灭 spawn/CREATE_NO_WINDOW/管道 IO/每次加载的全部成本。
// 全局状态(@global g_states)随 Interp 常驻,增量排版跨请求复用。

enum InprocReq {
    Call(String, std::sync::mpsc::Sender<Result<String, String>>),
}

static INPROC_TX: Mutex<Option<std::sync::mpsc::Sender<InprocReq>>> = Mutex::new(None);

fn inproc_load_program(path: &Path) -> Result<aine::ast::Program, String> {
    let source = fs::read_to_string(path).map_err(|e| format!("读 {} 失败:{}", path.display(), e))?;
    let lexed = aine::lex_source(&source);
    if lexed.diagnostics.has_errors() {
        return Err("tauri_cli.aine 词法错误".into());
    }
    let parsed = aine::parse_source(&source, &path.display().to_string())
        .ok_or_else(|| "tauri_cli.aine 语法错误".to_string())?;
    let mut program = match parsed.program {
        Some(p) => p,
        None => return Err("tauri_cli.aine 无程序体".into()),
    };
    let mod_dir = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    aine::resolve_file_modules(&mut program, &mod_dir).map_err(|e| format!("模块解析失败:{e}"))?;
    let resolver = aine::resolve::Resolver::new(&lexed.tokens);
    let resolved = resolver.resolve(&program);
    if resolved.diagnostics.has_errors() {
        return Err("tauri_cli.aine 名称解析错误".into());
    }
    let checker = aine::typeck::TypeChecker::new(&resolved.program, &resolved.resolution, &lexed.tokens);
    let typeck = checker.check();
    if typeck.diagnostics.has_errors() {
        return Err("tauri_cli.aine 类型检查错误".into());
    }
    Ok(program)
}

fn inproc_call(app: &AppHandle, req: &str) -> Result<String, String> {
    let tx = {
        let mut g = INPROC_TX.lock().map_err(|_| "inproc 锁中毒".to_string())?;
        if g.is_none() {
            let dir = aine_dir(app)?;
            let path = dir.join("src").join("tauri_cli.aine");
            if !path.is_file() {
                return Err(format!("{} 不存在", path.display()));
            }
            let (req_tx, req_rx) = std::sync::mpsc::channel::<InprocReq>();
            let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
            let worker_path = path.clone();
            std::thread::Builder::new()
                .name("aine-inproc".into())
                .stack_size(512 * 1024 * 1024)
                .spawn(move || {
                    let boot = (|| -> Result<(), String> {
                        let program = inproc_load_program(&worker_path)?;
                        let mut interp = aine::interp::Interp::new();
                        interp.load(&program);
                        let _ = ready_tx.send(Ok(()));
                        for r in req_rx {
                            match r {
                                InprocReq::Call(line, resp_tx) => {
                                    let out = interp
                                        .call_named(
                                            "daemon_handle",
                                            vec![aine::interp::Value::Str(line.into_boxed_str().into())],
                                        )
                                        .map(|v| match v {
                                            aine::interp::Value::Str(s) => s.to_string(),
                                            other => other.display(),
                                        })
                                        .map_err(|e| aine::interp::rt_error_text(&e));
                                    let _ = resp_tx.send(out);
                                }
                            }
                        }
                        Ok(())
                    })();
                    if let Err(e) = boot {
                        let _ = ready_tx.send(Err(e));
                    }
                })
                .map_err(|e| format!("inproc 线程启动失败:{e}"))?;
            match ready_rx.recv() {
                Ok(Ok(())) => {}
                Ok(Err(e)) => return Err(format!("inproc 加载失败:{e}")),
                Err(_) => return Err("inproc worker 消失".into()),
            }
            *g = Some(req_tx);
        }
        g.clone().ok_or_else(|| "inproc 未初始化".to_string())?
    };
    let (resp_tx, resp_rx) = std::sync::mpsc::channel();
    tx.send(InprocReq::Call(req.to_string(), resp_tx))
        .map_err(|_| "inproc worker 已退出".to_string())?;
    resp_rx
        .recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|_| "inproc 响应超时".to_string())?
}

// 带两级降级:dll(原生,parse+默认几何)→ inproc(解释,全功能)→ spawn(兜底)
fn daemon_call_retry(app: &AppHandle, req: &str) -> Result<String, String> {
    match dll_call(app, req) {
        Ok(v) => return Ok(v),
        Err(e) => {
            eprintln!("[awen] dll 未命中,降级 inproc: {}", e);
        }
    }
    match inproc_call(app, req) {
        Ok(v) => return Ok(v),
        Err(e) => {
            eprintln!("[awen] inproc 失败,降级 spawn daemon: {}", e);
        }
    }
    let mut g = DAEMON.lock().map_err(|_| "daemon 锁中毒".to_string())?;
    if g.is_none() {
        *g = Some(daemon_spawn(app)?);
    }
    match daemon_call(g.as_mut().unwrap(), req) {
        Ok(v) => Ok(v),
        Err(_) => {
            *g = Some(daemon_spawn(app)?);
            daemon_call(g.as_mut().unwrap(), req)
        }
    }
}


/// 启动参数里的文件路径:setup 阶段前端尚未就绪无法 emit,先暂存,
/// 前端初始化完成后经 core_take_pending_paths 主动拉取
struct PendingPaths(Mutex<Vec<String>>);

/// 定位 aine 运行时目录:环境变量覆盖 → 打包资源 aine-runtime/
/// (tauri 以相对路径保留 resources/ 前缀:dev 在 target/<mode>/resources/,
///  安装后在 <install>/resources/;两处都探测)
fn aine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(d) = std::env::var("AWEN_AINE_DIR") {
        let p = PathBuf::from(d);
        if p.join("aine.toml").is_file() {
            return Ok(p);
        }
    }
    let res = app.path().resource_dir().map_err(|e| e.to_string())?;
    for rel in ["aine-runtime", "resources/aine-runtime"] {
        let p = res.join(rel);
        if p.join("aine.toml").is_file() {
            return Ok(p);
        }
    }
    Err("找不到 aine 运行时目录(aine-runtime/:aine.exe + aine.toml + src/);开发期请设置 AWEN_AINE_DIR 指向仓库根".into())
}


#[tauri::command]
async fn core_parse(app: AppHandle, src: String, cfg: Option<String>, doc: Option<String>, rev: Option<i64>) -> Result<String, String> {
    // 常驻 Core(daemon)请求:op=parse;cfg 在场时引擎同次解析附带权威分页(A′);
    // doc 标识文档,daemon 增量排版状态按文档隔离
    let mut req = serde_json::json!({ "id": 1, "op": "parse", "src": src, "doc": doc.unwrap_or_default(), "rev": rev.unwrap_or(-1) });
    if let Some(c) = cfg {
        let cfgv: serde_json::Value = serde_json::from_str(&c)
            .map_err(|e| format!("cfg 不是合法 JSON:{e}"))?;
        req["cfg"] = cfgv;
    }
    let req_str = req.to_string();
    // 结果缓存:同 请求(源码+cfg)的重复全量解析直接秒回(切标签/撤销
    // 回同态/重复打开),大文档收益显著。size-1,新内容自然逐出。
    {
        let cache = PARSE_CACHE.lock().unwrap();
        if let Some((k, v)) = cache.as_ref() {
            if *k == req_str {
                return Ok(v.clone());
            }
        }
    }
    let line = daemon_call_retry(&app, &req_str)?;
    let v: serde_json::Value =
        serde_json::from_str(&line).map_err(|e| format!("daemon 响应解析失败:{e}"))?;
    let result = v
        .get("result")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "daemon 响应缺 result".to_string())?;
    {
        let mut cache = PARSE_CACHE.lock().unwrap();
        *cache = Some((req_str, result.clone()));
    }
    Ok(result)
}

/// 系统字体枚举:注册表 Fonts 项的值名即字体显示名(去掉 "(TrueType)" 类
/// 后缀),机器上有啥给啥,前端字体下拉不再写死。HKLM 全机 + HKCU 当前用户。
#[tauri::command]
async fn core_list_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut names: Vec<String> = Vec::new();
        let hives = [
            r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts",
            r"HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts",
        ];
        for hive in hives {
            let out = std::process::Command::new("reg").args(["query", hive]).output();
            if let Ok(o) = out {
                let text = String::from_utf8_lossy(&o.stdout).to_string();
                for line in text.lines() {
                    let line = line.trim();
                    if line.starts_with("HKEY_") || !line.contains('(') {
                        continue
                    }
                    let name = line.split("    ").next().unwrap_or("").trim();
                    if let Some(pos) = name.find(" (") {
                        let family = name[..pos].trim().to_string();
                        if !family.is_empty() && !names.contains(&family) {
                            names.push(family);
                        }
                    }
                }
            }
        }
        names.sort_by_key(|n| n.to_lowercase());
        Ok(names)
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

// wmf→png 批转脚本(System.Drawing 可渲染 Windows 图元文件;4x 超采白底)
const WMF_CONVERT_PS1: &str = r#"
param([string]$dir)
Add-Type -AssemblyName System.Drawing
Get-ChildItem -LiteralPath $dir -Filter *.wmf | ForEach-Object {
  try {
    $img=[System.Drawing.Image]::FromFile($_.FullName)
    $w=[int]($img.Width*4)
    $h=[int]($img.Height*4)
    if($w -lt 8){$w=8}
    if($h -lt 8){$h=8}
    if($w -gt 6000){$w=6000}
    if($h -gt 6000){$h=6000}
    $bmp=New-Object System.Drawing.Bitmap($w,$h)
    $g=[System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode='HighQualityBicubic'
    $g.DrawImage($img,0,0,$w,$h)
    $bmp.Save($_.FullName+'.png',[System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
  } catch {
    Write-Host "FAIL $($_.Name): $($_.Exception.Message)"
  }
}
"#;

/// 批量图片资源化(docx 导入专用):一次 IPC 服务端循环写盘。
/// 输入 data URI 列表,返回 media/ 引用列表(顺序对应,失败项为空串);
/// 同内容同哈希自动去重,已存在的文件直接复用。
/// wmf/emf(公式 OLE 预览)先落临时目录,经 PowerShell System.Drawing
/// 批量转 4x 高清白底 PNG(Windows 自带 GDI 可渲染图元文件),公式真实显示。
#[tauri::command]
async fn core_batch_resource(data_uris: Vec<String>, media_dir: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::hash::{Hash, Hasher};
        std::fs::create_dir_all(&media_dir).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        let dir = std::path::Path::new(&media_dir);
        let tmp = dir.join("_wmf_tmp");
        let _ = std::fs::create_dir_all(&tmp);
        let mut refs = Vec::with_capacity(data_uris.len());
        let mut wmf_pending: Vec<(String, String)> = Vec::new(); // (hash文件名, 返回占位索引对应)
        for uri in &data_uris {
            let (mime, payload) = match uri.split_once(";base64,") {
                Some((m, p)) => (m.trim_start_matches("data:"), p),
                None => {
                    refs.push(String::new());
                    continue;
                }
            };
            let lower = mime.to_lowercase();
            let is_vector = lower.contains("wmf") || lower.contains("emf");
            let bytes = match b64_decode(payload) {
                Some(b) => b,
                None => {
                    refs.push(String::new());
                    continue;
                }
            };
            let mut h = std::collections::hash_map::DefaultHasher::new();
            bytes.hash(&mut h);
            let hash16 = format!("{:016x}", h.finish());
            if is_vector {
                // 矢量公式:原始文件入临时目录,待 PowerShell 批转 PNG
                let raw = format!("{}.{}", hash16, if lower.contains("emf") { "emf" } else { "wmf" });
                let path = tmp.join(&raw);
                if !path.exists() {
                    std::fs::write(&path, &bytes).map_err(|e| format!("写图失败:{e}"))?;
                }
                wmf_pending.push((raw, hash16.clone()));
                refs.push(format!("__wmf__:{}", hash16));
            } else {
                let name = format!("img-{}.{}", hash16, img_ext_of(&lower));
                let path = dir.join(&name);
                if !path.exists() {
                    std::fs::write(&path, &bytes).map_err(|e| format!("写图失败:{e}"))?;
                }
                refs.push(format!("media/{}", name));
            }
        }
        // 矢量批转:脚本落盘用 -File 执行(-Command 长脚本的引号/花括号转义不可靠)
        if !wmf_pending.is_empty() {
            let ps1 = tmp.join("_convert.ps1");
            std::fs::write(&ps1, WMF_CONVERT_PS1).map_err(|e| format!("写转换脚本失败:{e}"))?;
            let out = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    &ps1.display().to_string(),
                    "-dir",
                    &tmp.display().to_string(),
                ])
                .output();
            if let Ok(o) = &out {
                if !o.status.success() {
                    eprintln!("wmf 批转失败 status={:?} stderr={}", o.status, String::from_utf8_lossy(&o.stderr));
                }
            }
            // 转换成功的替换为 png 引用;失败的清空(前端兜底文本占位)
            for (raw, hash16) in &wmf_pending {
                let png_path = tmp.join(format!("{}.png", raw));
                let idx = refs.iter().position(|r| r == &format!("__wmf__:{}", hash16));
                if let Ok(png) = std::fs::read(&png_path) {
                    let mut h2 = std::collections::hash_map::DefaultHasher::new();
                    png.hash(&mut h2);
                    let name = format!("img-{:016x}.png", h2.finish());
                    let final_path = dir.join(&name);
                    if !final_path.exists() {
                        std::fs::write(&final_path, &png).map_err(|e| format!("写图失败:{e}"))?;
                    }
                    if let Some(i) = idx {
                        refs[i] = format!("media/{}", name);
                    }
                } else if let Some(i) = idx {
                    refs[i] = String::new();
                }
            }
            let _ = std::fs::remove_dir_all(&tmp);
        }
        Ok(refs)
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

fn img_ext_of(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        "image/x-icon" => "ico",
        "image/tiff" => "tiff",
        _ => "png",
    }
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bytes: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    for c in bytes {
        if c == b'=' {
            break;
        }
        let v = val(c)?;
        acc = (acc << 6) | v;
        nbits += 6;
        if nbits >= 8 {
            nbits -= 8;
            out.push(((acc >> nbits) & 0xFF) as u8);
        }
    }
    Some(out)
}

// ── 字体度量(零依赖 TTF/TTC 直读;真实字形宽度进排版)──────────

fn u16_at(b: &[u8], o: usize) -> u32 {
    ((b.get(o).copied().unwrap_or(0) as u32) << 8) | b.get(o + 1).copied().unwrap_or(0) as u32
}
fn u32_at(b: &[u8], o: usize) -> u32 {
    ((b.get(o).copied().unwrap_or(0) as u32) << 24)
        | ((b.get(o + 1).copied().unwrap_or(0) as u32) << 16)
        | ((b.get(o + 2).copied().unwrap_or(0) as u32) << 8)
        | b.get(o + 3).copied().unwrap_or(0) as u32
}

/// 家族名 → 字体文件路径(HKLM/HKCU Fonts 注册表:值名去后缀=家族,值数据=文件名)
fn find_font_file(family: &str) -> Option<std::path::PathBuf> {
    let wanted = family.trim().to_lowercase();
    let mut hives = vec![r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"];
    // HKCU 在下方追加(复用同一解析)
    let mut dirs = vec![std::path::PathBuf::from("C:\\Windows\\Fonts")];
    if let Some(local) = dirs::local_data() {
        dirs.push(local.join("Microsoft\\Windows\\Fonts"));
        hives.push(r"HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts");
    }
    for (i, hive) in hives.iter().enumerate() {
        let out = std::process::Command::new("reg").args(["query", hive]).output().ok()?;
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("HKEY_") {
                continue;
            }
            // 行:家族名 (TrueType)    REG_SZ    文件名 —— 家族名可含空格,
            // 用第一个 " (" 切家族,最后一段空白后是文件名
            let pos = match line.find(" (") {
                Some(p) => p,
                None => continue,
            };
            let fam = line[..pos].trim().to_lowercase();
            let file_name = match line.split_whitespace().last() {
                Some(f) => f.trim(),
                None => continue,
            };
            // 联合家族名(“X & X UI”)任一别名命中即可;含常见中文别名归一
            let aliases: &[(&str, &str)] = &[
                ("微软雅黑", "microsoft yahei"),
                ("宋体", "simsun"),
                ("新宋体", "nsimsun"),
                ("黑体", "simhei"),
                ("楷体", "kaiti"),
                ("仿宋", "fangsong"),
                ("等线", "dengxian"),
                ("隶书", "lisu"),
                ("幼圆", "youyuan"),
            ];
            let wanted_norm = aliases
                .iter()
                .find(|(cn, _)| wanted == *cn)
                .map(|(_, en)| *en)
                .unwrap_or(wanted.as_str());
            let hit = fam
                .split('&')
                .any(|part| part.trim() == wanted_norm || part.trim() == wanted);
            if hit {
                for d in &dirs {
                    let p = d.join(file_name);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
        let _ = i;
    }
    None
}

mod dirs {
    pub fn local_data() -> Option<std::path::PathBuf> {
        std::env::var("LOCALAPPDATA").ok().map(std::path::PathBuf::from)
    }
}

/// 解析 sfnt(裸 TTF/OTF 或 TTC 首字体),返回 (数据, 表目录: tag→(offset,len))
fn load_sfnt(path: &std::path::Path) -> Option<(Vec<u8>, Vec<(String, usize, usize)>)> {
    let data = std::fs::read(path).ok()?;
    let base = if data.len() >= 12 && &data[0..4] == b"ttcf" {
        u32_at(&data, 12) as usize // TTC:取第一个字体
    } else {
        0
    };
    if data.len() < base + 12 {
        return None;
    }
    let num_tables = u16_at(&data, base + 4) as usize;
    let mut tables: Vec<(String, usize, usize)> = Vec::new();
    for i in 0..num_tables {
        let rec = base + 12 + i * 16;
        if rec + 16 > data.len() {
            break;
        }
        let tag = String::from_utf8_lossy(&data[rec..rec + 4]).to_string();
        tables.push((tag, u32_at(&data, rec + 8) as usize, u32_at(&data, rec + 12) as usize));
    }
    Some((data, tables))
}

fn table<'a>(data: &'a [u8], tables: &[(String, usize, usize)], tag: &str) -> Option<&'a [u8]> {
    tables.iter().find(|(t, _, _)| t == tag).and_then(|(_, o, l)| data.get(*o..*o + *l))
}

/// 字形 gid → 宽度(cmap format 4/12 + hmtx;缺字 None)
struct GlyphMap {
    upem: u32,
    segments: Vec<(u32, u32, i32, u32, u32)>, // (end,start,delta,rangeOff,rangeBase) format4
    groups: Vec<(u32, u32, u32)>,             // format12 (start,end,startGID)
    hmtx_off: usize,
    num_hmetrics: u32,
}

impl GlyphMap {
    fn build(data: &[u8], tables: &[(String, usize, usize)]) -> Option<GlyphMap> {
        let head = table(data, tables, "head")?;
        let upem = u16_at(head, 18) as u32;
        if upem == 0 {
            return None;
        }
        let hhea = table(data, tables, "hhea")?;
        let num_hmetrics = u16_at(hhea, 34) as u32;
        let hmtx = table(data, tables, "hmtx")?;
        let hmtx_off = hmtx.as_ptr() as usize - data.as_ptr() as usize;
        let cmap = table(data, tables, "cmap")?;
        let cmap_base = cmap.as_ptr() as usize - data.as_ptr() as usize;
        let n = u16_at(cmap, 2) as usize;
        let mut sub4: Option<(usize, usize)> = None; // (offset,len)
        let mut sub12: Option<(usize, usize)> = None;
        for e in 0..n {
            let rec = 4 + e * 8;
            let plat = u16_at(cmap, rec);
            let enc = u16_at(cmap, rec + 2);
            let off = u32_at(cmap, rec + 4) as usize;
            let fmt = u16_at(cmap, off);
            if plat == 3 && enc == 10 && fmt == 12 {
                sub12 = Some((cmap_base + off, cmap.len() - cmap_base - off));
            } else if plat == 3 && enc == 1 && fmt == 4 {
                sub4 = Some((cmap_base + off, cmap.len() - cmap_base - off));
            } else if plat == 0 && fmt == 4 && sub4.is_none() {
                sub4 = Some((cmap_base + off, cmap.len() - cmap_base - off));
            }
        }
        if sub4.is_none() && sub12.is_none() {
            return None;
        }
        let mut segments: Vec<(u32, u32, i32, u32, u32)> = Vec::new();
        if let Some((off, len)) = sub4 {
            let seg_x2 = u16_at(data, off + 6) as usize;
            let seg = seg_x2 / 2;
            let end_off = off + 14;
            let start_off = end_off + seg_x2 + 2;
            let delta_off = start_off + seg_x2;
            let range_off = delta_off + seg_x2;
            for si in 0..seg {
                let end = u16_at(data, end_off + si * 2) as u32;
                let start = u16_at(data, start_off + si * 2) as u32;
                let delta = u16_at(data, delta_off + si * 2) as u32 as i32; // 保存原始位型
                let ro = u16_at(data, range_off + si * 2) as u32;
                segments.push((end, start, delta, ro, range_off as u32 + si as u32 * 2));
            }
        }
        let mut groups: Vec<(u32, u32, u32)> = Vec::new();
        if let Some((off, len)) = sub12 {
            let ng = u32_at(data, off + 12) as usize;
            for gi in 0..ng.min(200000) {
                let g = off + 16 + gi * 12;
                if g + 12 > off + len {
                    break;
                }
                groups.push((u32_at(data, g), u32_at(data, g + 4), u32_at(data, g + 8)));
            }
        }
        Some(GlyphMap { upem, segments, groups, hmtx_off, num_hmetrics })
    }
    fn gid(&self, data: &[u8], cp: u32) -> Option<u32> {
        for (end, start, delta, ro, rbase) in &self.segments {
            if cp <= *end {
                if cp < *start {
                    return None;
                }
                if *ro == 0 {
                    return Some(((cp as i32 + delta) as u32) & 0xFFFF);
                }
                // idRangeOffset 非零:字形 id 存于 idRangeOffset 项指向的字节数组
                let goff = (*rbase as usize) + (*ro as usize) + (cp.wrapping_sub(*start)) as usize * 2;
                let g = u16_at(data, goff) as u32;
                return if g != 0 { Some((((g as i64) + (*delta as i64)) & 0xFFFF) as u32) } else { None };
            }
        }
        for (gs, ge, gg) in &self.groups {
            if cp >= *gs && cp <= *ge {
                return Some(gg.wrapping_add(cp - *gs));
            }
        }
        None
    }
    fn advance(&self, data: &[u8], gid: u32) -> Option<f64> {
        let idx = gid.min(self.num_hmetrics.saturating_sub(1)) as usize;
        let adv = u16_at(data, self.hmtx_off + idx * 4);
        Some(adv as f64 / self.upem as f64)
    }
}

/// 字体度量:family + 文档字符集(去重)→ 合并区间字宽表(UTF-16 首尾字符 + em 宽)
/// 输出 {"s":..,"e":..,"w":[..]}(s/e 为区间首尾字符,w 为 em 宽数组);缺字字符不出现在表中
#[tauri::command]
async fn core_font_widths(family: String, chars: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match find_font_file(&family) {
            Some(p) => p,
            None => return Err(format!("找不到字体文件:{}", family)),
        };
        let (data, tables) = match load_sfnt(&path) {
            Some(x) => x,
            None => return Err("字体解析失败".into()),
        };
        let gm = match GlyphMap::build(&data, &tables) {
            Some(g) => g,
            None => {
                let tags: Vec<&str> = tables.iter().map(|(t, _, _)| t.as_str()).collect();
                return Err(format!("字体解析失败: upem/cmap/hmtx 缺失, tables={:?}", tags));
            }
        };
        // 收集 (码点, em 宽)
        let mut entries: Vec<(u32, f64)> = Vec::new();
        for cs in &chars {
            if let Some(c) = cs.chars().next() {
                let cp = c as u32;
                if let Some(gid) = gm.gid(&data, cp) {
                    if let Some(w) = gm.advance(&data, gid) {
                        entries.push((cp, (w * 1000.0).round() / 1000.0));
                    }
                }
            }
        }
        entries.sort_by_key(|(cp, _)| *cp);
        // 合并:码点连续且宽度相同的区间
        let mut s = String::new();
        let mut e = String::new();
        let mut w: Vec<f64> = Vec::new();
        let mut i = 0;
        while i < entries.len() {
            let (start_cp, width) = entries[i];
            let mut end_cp = start_cp;
            let mut j = i + 1;
            while j < entries.len() && entries[j].1 == width && entries[j].0 == end_cp + 1 {
                end_cp = entries[j].0;
                j += 1;
            }
            if let Some(c1) = char::from_u32(start_cp) {
                if let Some(c2) = char::from_u32(end_cp) {
                    s.push(c1);
                    e.push(c2);
                    w.push(width);
                }
            }
            i = j;
        }
        let ws = serde_json::to_string(&w).unwrap_or_else(|_| "[]".into());
        Ok(format!("{{\"s\":{},\"e\":{},\"w\":{}}}", serde_json::to_string(&s).unwrap_or_default(), serde_json::to_string(&e).unwrap_or_default(), ws))
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

/// 增量排版:daemon 复用上一轮未变前缀的流,只重排首变之后的尾段,
/// 返回 {pages,recs}(与 op=parse 的分页部分同构)。cfg 必传。
#[tauri::command]
async fn core_relayout(app: AppHandle, src: String, cfg: String, doc: Option<String>, rev: Option<i64>) -> Result<String, String> {
    let cfgv: serde_json::Value =
        serde_json::from_str(&cfg).map_err(|e| format!("cfg 不是合法 JSON:{e}"))?;
    let req = serde_json::json!({ "id": 1, "op": "relayout", "src": src, "cfg": cfgv, "doc": doc.unwrap_or_default(), "rev": rev.unwrap_or(-1) }).to_string();
    let line = daemon_call_retry(&app, &req)?;
    let v: serde_json::Value =
        serde_json::from_str(&line).map_err(|e| format!("daemon 响应解析失败:{e}"))?;
    v.get("result")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "daemon 响应缺 result".to_string())
}

/// 块级增量解析:前端只送脏段 [{bid,text}],daemon 每段独立走权威管线,
/// 返回 [{bid,res}]。O(脏块) 替代 O(全文),打字停顿后的大文档刷新走这里。
#[tauri::command]
async fn core_parse_blocks(app: AppHandle, blocks: String) -> Result<String, String> {
    let arr: serde_json::Value =
        serde_json::from_str(&blocks).map_err(|e| format!("blocks 不是合法 JSON:{e}"))?;
    let req = serde_json::json!({ "id": 1, "op": "parse_blocks", "blocks": arr }).to_string();
    let line = daemon_call_retry(&app, &req)?;
    let v: serde_json::Value =
        serde_json::from_str(&line).map_err(|e| format!("daemon 响应解析失败:{e}"))?;
    v.get("result")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "daemon 响应缺 result".to_string())
}

/// .awen 容器(v0.5)检测:文件尾 8 字节为 magic "AWENBIN"+0x0A
fn is_container_file(path: &str) -> bool {
    if let Ok(mut f) = std::fs::File::open(path) {
        use std::io::{Read, Seek, SeekFrom};
        if f.seek(SeekFrom::End(-8)).is_ok() {
            let mut m = [0u8; 8];
            if f.read_exact(&mut m).is_ok() {
                return &m == b"AWENBIN\n";
            }
        }
    }
    false
}

fn unwrap_container(content: String) -> String {
    if !content.starts_with("# awen v") {
        return content;
    }
    match content.find("# ---") {
        Some(sep) => match content[sep..].find('\n') {
            Some(nl) => content[sep + nl + 1..].to_string(),
            None => String::new(),
        },
        None => content,
    }
}

struct OpenedDoc {
    name: String,
    src: String,
    path: Option<String>,
    media_dir: Option<String>,
}

fn read_doc_path(path: &str) -> Result<OpenedDoc, String> {
    let pb = PathBuf::from(path);
    let name = pb
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名文档".into());
    let content = fs::read_to_string(&pb).map_err(|e| format!("读取失败:{e}"))?;
    Ok(OpenedDoc {
        name,
        src: unwrap_container(content),
        path: Some(path.to_string()),
        media_dir: None,
    })
}

fn pick_and_read(app: &AppHandle) -> Result<Option<OpenedDoc>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("Awen 文档", &["awen", "txt", "md", "markdown"])
        .blocking_pick_file();
    let file = match file {
        Some(f) => f,
        None => return Ok(None),
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    read_doc_any(app, &path.to_string_lossy().to_string()).map(Some)
}

#[derive(serde::Serialize)]
struct OpenedDocPayload {
    name: String,
    src: String,
    path: Option<String>,
    media_dir: Option<String>,
}

#[tauri::command]
async fn core_open_dialog(app: AppHandle) -> Result<Option<OpenedDocPayload>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        pick_and_read(&app).map(|opt| opt.map(read_doc_payload))
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

/// 按已知路径直接读取(单实例/最近文件)
#[tauri::command]
async fn core_read_file(app: AppHandle, path: String) -> Result<OpenedDocPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_doc_any(&app, &path).map(read_doc_payload)
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

// 统一出口:容器文件走引擎解包(拿 media_dir),文本文件走旧剥离逻辑
fn read_doc_payload(d: OpenedDoc) -> OpenedDocPayload {
    OpenedDocPayload {
        name: d.name,
        src: d.src,
        path: d.path,
        media_dir: d.media_dir,
    }
}

// 打开任意路径:.awen 容器 → 引擎解包;文本 → 旧逻辑
fn read_doc_any(app: &AppHandle, path: &str) -> Result<OpenedDoc, String> {
    if is_container_file(path) {
        return open_container_doc(app, path);
    }
    read_doc_path(path)
}

// 容器打开:引擎 unpack(资源落盘 media_dir,源码写明文),壳读回
fn open_container_doc(app: &AppHandle, path: &str) -> Result<OpenedDoc, String> {
    let dir = aine_dir(app)?;
    let exe = dir.join("aine.exe");
    if !exe.is_file() {
        return Err(format!("aine.exe 不存在:{}", exe.display()));
    }
    let build = dir.join("build");
    fs::create_dir_all(&build).map_err(|e| format!("创建 build/ 失败:{e}"))?;
    let pb = PathBuf::from(path);
    let stem = pb
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "doc".into());
    let safe_stem: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let media = local_app_dir().join("media").join(&safe_stem);
    fs::create_dir_all(&media).map_err(|e| format!("创建媒体目录失败:{e}"))?;
    let media_dir = media.to_string_lossy().to_string();
    // 真正调引擎 unpack(此前只读上一次遗留的共享文件=打开陈旧文档):
    // 走 daemon op=unpack,产物落本文档专属临时路径,读回后删除
    let source_out = local_app_dir()
        .join("container_unpack")
        .join(format!("{}.awen", safe_stem));
    fs::create_dir_all(source_out.parent().unwrap())
        .map_err(|e| format!("创建临时目录失败:{e}"))?;
    {
        let req = serde_json::json!({
            "id": 1, "op": "unpack",
            "path": path, "media_dir": media_dir,
            "source_out": source_out.to_string_lossy(),
        });
        let line = daemon_call_retry(app, &req.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&line)
            .map_err(|e| format!("daemon 响应解析失败:{e}"))?;
        if v.get("ok").and_then(|x| x.as_bool()) != Some(true) {
            return Err("容器解包失败".into());
        }
    }
    let source = fs::read_to_string(&source_out).map_err(|e| format!("读取解包源码失败:{e}"))?;
    let _ = fs::remove_file(&source_out);
    let name = pb
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名文档".into());
    Ok(OpenedDoc {
        name,
        src: source,
        path: Some(path.to_string()),
        media_dir: Some(media_dir),
    })
}

#[derive(serde::Serialize)]
struct SaveResult {
    saved: bool,
    path: Option<String>,
}

/// 保存对话框(另存为/无名保存):返回是否保存与最终路径
async fn save_dialog_impl(app: AppHandle, name: String, content: String) -> Result<SaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let suggested = if PathBuf::from(&name).extension().is_some() {
            name.clone()
        } else {
            format!("{name}.awen")
        };
        // save_file 为回调 API,用 channel 等待结果(此版本插件无 blocking 变体)
        let (tx, rx) = std::sync::mpsc::channel();
        app.dialog()
            .file()
            .add_filter("Awen 文档", &["awen", "txt", "md", "html", "doc"])
            .set_file_name(&suggested)
            .save_file(move |file| {
                let _ = tx.send(file);
            });
        let file = rx.recv().map_err(|_| "对话框通道关闭".to_string())?;
        let file = match file {
            Some(f) => f,
            None => return Ok(SaveResult { saved: false, path: None }),
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        fs::write(&path, &content).map_err(|e| format!("写入失败:{e}"))?;
        Ok(SaveResult {
            saved: true,
            path: Some(path.to_string_lossy().to_string()),
        })
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

#[tauri::command]
async fn core_save_dialog(app: AppHandle, name: String, content: String) -> Result<SaveResult, String> {
    save_dialog_impl(app, name, content).await
}

/// 已知路径直写(保存不再弹框)
#[tauri::command]
async fn core_save_file(_app: AppHandle, path: String, content: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = PathBuf::from(&path);
        if let Some(parent) = dir.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&path, content).map_err(|e| format!("写入失败:{e}"))?;
        Ok(true)
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

/// 把文件路径转发给前端(前端经 Bridge.listenOpenPath 接收并加标签)
fn forward_paths(app: &AppHandle, paths: &[String]) {
    if let Some(win) = app.get_webview_window("main") {
        for p in paths {
            let _ = win.emit("awen-open-path", p.clone());
        }
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 前端就绪后拉取启动参数中暂存的文件路径(取出即清空)
#[tauri::command]
fn core_take_pending_paths(state: State<'_, PendingPaths>) -> Vec<String> {
    let mut g = state.0.lock().unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut *g)
}

// ── .awen v0.5 单文件容器(引擎侧编解码:aine 容器模式;壳只做文件 IO/进程)──

// 保存:.awen 容器(引擎抽 data URI 资源化→拼 chunk 容器→write_bytes 原子写)
// 返回资源化后的源码(前端以此为新的 gSrc)与文档 ID
#[tauri::command]
async fn awen_container_save(
    app: AppHandle,
    path: String,
    syntax: String,
    doc_id: String,
    media_dir: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = aine_dir(&app)?;
        let exe = dir.join("aine.exe");
        if !exe.is_file() {
            return Err(format!("aine.exe 不存在:{}", exe.display()));
        }
        let media_base = if media_dir.trim().is_empty() {
            local_app_dir().join("media")
        } else {
            PathBuf::from(&media_dir)
        };
        fs::create_dir_all(&media_base).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        let media_base_s = media_base.to_string_lossy().to_string();
        // daemon 请求:op=pack(引擎抽 data URI 资源化并打容器)
        let req = serde_json::json!({
            "id": 1, "op": "pack", "src": syntax,
            "target": path, "doc_id": doc_id, "media_dir": media_base_s
        })
        .to_string();
        let line = daemon_call_retry(&app, &req)?;
        let v: serde_json::Value =
            serde_json::from_str(&line).map_err(|e| format!("容器打包响应解析失败:{e}"))?;
        let packed = v
            .get("result")
            .and_then(|x| x.as_str())
            .ok_or("容器打包响应缺 result")?
            .to_string();
        let source_json = serde_json::to_string(&packed).unwrap_or_else(|_| "\"\"".into());
        let md_json = serde_json::to_string(&media_base_s).unwrap_or_else(|_| "\"\"".into());
        Ok(format!("{{\"source\":{source_json},\"media_dir\":{md_json}}}"))
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

// 打开:.awen 容器(引擎解包:资源落盘 media 目录,源码写明文文件)
// 返回 {source, media_dir, chunks, document_id}
#[tauri::command]
async fn awen_container_open(
    app: AppHandle,
    _lock: State<'_, AineLock>,
    path: String,
) -> Result<String, String> {

    tauri::async_runtime::spawn_blocking(move || {
        let dir = aine_dir(&app)?;
        let exe = dir.join("aine.exe");
        if !exe.is_file() {
            return Err(format!("aine.exe 不存在:{}", exe.display()));
        }
        let build = dir.join("build");
        fs::create_dir_all(&build).map_err(|e| format!("创建 build/ 失败:{e}"))?;
        let media = local_app_dir().join("media");
        fs::create_dir_all(&media).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        let media_dir = media.to_string_lossy().to_string();
        let source_out = build.join("cli_container_src.awen");
        let source_out_s = source_out.to_string_lossy().to_string();
        // daemon 请求:op=unpack(引擎解包资源+源码落盘)
        let req = serde_json::json!({
            "id": 1, "op": "unpack", "path": path,
            "media_dir": media_dir, "source_out": source_out_s
        })
        .to_string();
        let line = daemon_call_retry(&app, &req)?;
        let v: serde_json::Value =
            serde_json::from_str(&line).map_err(|e| format!("解包响应解析失败:{e}"))?;
        let ok = v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false);
        if !ok {
            return Err(format!("容器打开失败:{}", line));
        }
        let status = line;
        let source = fs::read_to_string(&source_out).map_err(|e| format!("读取解包源码失败:{e}"))?;
        // result 是字符串化 JSON,须二次解析取字段(此前对转义行做明文切分恒失败)
        let rv: serde_json::Value = serde_json::from_str(
            v.get("result").and_then(|x| x.as_str()).unwrap_or("{}"),
        )
        .map_err(|e| format!("解包结果解析失败:{e}"))?;
        let doc_id = rv
            .get("document_id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let chunks_n = rv.get("chunks").and_then(|x| x.as_i64()).unwrap_or(0).to_string();
        let media_json = serde_json::to_string(&media_dir).unwrap_or_else(|_| "\"\"".into());
        let source_json = serde_json::to_string(&source).unwrap_or_else(|_| "\"\"".into());
        let doc_json = serde_json::to_string(&doc_id).unwrap_or_else(|_| "\"\"".into());
        Ok(format!(
            "{{\"source\":{source_json},\"media_dir\":{media_json},\"chunks\":{chunks_n},\"document_id\":{doc_json}}}"
        ))
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

// ── 图片资源化:插入即入媒体目录(源码只写 media/ 引用,容器打包时收集)──

const B64T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for ch in data.chunks(3) {
        let b = [ch[0], *ch.get(1).unwrap_or(&0), *ch.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64T[(n >> 18) as usize & 63] as char);
        out.push(B64T[(n >> 12) as usize & 63] as char);
        out.push(if ch.len() > 1 { B64T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if ch.len() > 2 { B64T[n as usize & 63] as char } else { '=' });
    }
    out
}

// 与引擎 content_hash8 同款滚动哈希 → 8 位 hex(资源命名跨端一致)
fn content_hash8(data: &[u8]) -> String {
    let mut h: i64 = 7;
    for &b in data {
        h = (h * 31 + b as i64) % 2147483647;
    }
    let mut hex = String::new();
    let digits = b"0123456789abcdef";
    for d in (0..8).rev() {
        let nib = (h / pow2i(d * 4)) % 16;
        hex.push(digits[nib as usize] as char);
    }
    hex
}
fn pow2i(n: i64) -> i64 {
    1i64 << n
}

fn mime_of_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

// 确保媒体子目录存在,返回绝对路径(前端存为该标签的 awenMediaDir)
#[tauri::command]
async fn media_ensure(name: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if safe.is_empty() {
        return Err("非法媒体目录名".into());
    }
    let dir = local_app_dir().join("media").join(safe);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建媒体目录失败:{e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct ResourceRef {
    #[serde(rename = "ref")]
    reference: String,
    data_uri: String,
}

// 本地图片文件 → 写入媒体目录 + 返回包内引用与 data URI
#[tauri::command]
async fn image_resource(path: String, media_dir: String) -> Result<ResourceRef, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = fs::read(&path).map_err(|e| format!("读取失败:{e}"))?;
        if data.len() > 20 * 1024 * 1024 {
            return Err("图片超过 20MB".into());
        }
        let ext = path
            .rsplit('.')
            .next()
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let mime = mime_of_ext(&ext);
        let name = format!("img-{}.{}", content_hash8(&data), ext);
        std::fs::create_dir_all(&media_dir).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        std::fs::write(Path::new(&media_dir).join(&name), &data)
            .map_err(|e| format!("写入媒体失败:{e}"))?;
        Ok(ResourceRef {
            reference: format!("media/{name}"),
            data_uri: format!("data:{mime};base64,{}", b64_encode(&data)),
        })
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

// data URI → 写入媒体目录 + 返回包内引用(docx 导入等场景)
#[tauri::command]
async fn data_uri_resource(data_uri: String, media_dir: String) -> Result<ResourceRef, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let rest = data_uri.strip_prefix("data:").ok_or("非 data URI")?;
        let semi = rest.find(';').ok_or("data URI 缺少类型段")?;
        let mime = rest[..semi].to_string();
        let b64 = rest[semi + 1..].strip_prefix("base64,").ok_or("仅支持 base64 data URI")?;
        let mut table = [255u8; 256];
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (i, &c) in alphabet.iter().enumerate() {
            table[c as usize] = i as u8;
        }
        let mut bytes = Vec::with_capacity(b64.len() / 4 * 3);
        let mut acc: u32 = 0;
        let mut bits = 0u32;
        for &c in b64.as_bytes() {
            if c == b'=' || c == b'\n' || c == b'\r' { continue; }
            let v = table[c as usize];
            if v == 255 { continue; }
            acc = (acc << 6) | v as u32;
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                bytes.push((acc >> bits) as u8);
            }
        }
        if bytes.len() > 20 * 1024 * 1024 {
            return Err("图片超过 20MB".into());
        }
        let ext = match mime.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/svg+xml" => "svg",
            _ => "bin",
        };
        let name = format!("img-{}.{}", content_hash8(&bytes), ext);
        std::fs::create_dir_all(&media_dir).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        std::fs::write(Path::new(&media_dir).join(&name), &bytes)
            .map_err(|e| format!("写入媒体失败:{e}"))?;
        Ok(ResourceRef {
            reference: format!("media/{name}"),
            data_uri: data_uri.clone(),
        })
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

fn local_app_dir() -> PathBuf {
    if let Ok(la) = std::env::var("LOCALAPPDATA") {
        if !la.trim().is_empty() {
            return PathBuf::from(la).join("AwenEditor");
        }
    }
    PathBuf::from("awen-data")
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths: Vec<String> = args.iter().skip(1).cloned().collect();
            forward_paths(app, &paths);
        }))
        .manage(AineLock(Arc::new(Mutex::new(()))))
        .manage(PendingPaths(Mutex::new(std::env::args().skip(1).collect())))
        .invoke_handler(tauri::generate_handler![
            core_parse,
            core_parse_blocks,
            core_list_fonts,
            core_batch_resource,
            core_relayout,
            core_font_widths,
            core_open_dialog,
            core_save_dialog,
            core_read_file,
            core_save_file,
            core_take_pending_paths,
            awen_container_save,
            awen_container_open,
            media_ensure,
            image_resource,
            data_uri_resource
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
