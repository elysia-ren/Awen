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
use std::process::Command;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct AineLock(Arc<Mutex<()>>);

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

fn run_core_parse(app: &AppHandle, lock: &Mutex<()>, src: &str) -> Result<String, String> {
    let dir = aine_dir(app)?;
    let exe = dir.join("aine.exe");
    if !exe.is_file() {
        return Err(format!("aine.exe 不存在:{}", exe.display()));
    }
    let build = dir.join("build");
    fs::create_dir_all(&build).map_err(|e| format!("创建 build/ 失败:{e}"))?;
    fs::write(build.join("cli_in.awen"), src).map_err(|e| format!("写入 cli_in.awen 失败:{e}"))?;

    let _g = lock.lock().map_err(|_| "内部锁中毒".to_string())?;
    let mut cmd = Command::new(&exe);
    cmd.args(["run", "src/tauri_cli.aine"]).current_dir(&dir);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd
        .output()
        .map_err(|e| format!("启动 aine.exe 失败:{e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!("aine 解析失败:{}{}", stderr.trim(), stdout.trim()));
    }
    fs::read_to_string(build.join("cli_out.json")).map_err(|e| format!("读取 cli_out.json 失败:{e}"))
}

#[tauri::command]
async fn core_parse(app: AppHandle, lock: State<'_, AineLock>, src: String) -> Result<String, String> {
    let lock = lock.0.clone();
    tauri::async_runtime::spawn_blocking(move || run_core_parse(&app, &lock, &src))
        .await
        .map_err(|e| format!("任务调度失败:{e}"))?
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

fn pick_and_read(app: &AppHandle, lock: &Mutex<()>) -> Result<Option<OpenedDoc>, String> {
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
    read_doc_any(app, lock, &path.to_string_lossy().to_string()).map(Some)
}

#[derive(serde::Serialize)]
struct OpenedDocPayload {
    name: String,
    src: String,
    path: Option<String>,
    media_dir: Option<String>,
}

#[tauri::command]
async fn core_open_dialog(app: AppHandle, lock: State<'_, AineLock>) -> Result<Option<OpenedDocPayload>, String> {
    let lock = lock.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        pick_and_read(&app, &lock).map(|opt| opt.map(read_doc_payload))
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
}

/// 按已知路径直接读取(单实例/最近文件)
#[tauri::command]
async fn core_read_file(app: AppHandle, lock: State<'_, AineLock>, path: String) -> Result<OpenedDocPayload, String> {
    let lock = lock.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        read_doc_any(&app, &lock, &path).map(read_doc_payload)
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
fn read_doc_any(app: &AppHandle, lock: &Mutex<()>, path: &str) -> Result<OpenedDoc, String> {
    if is_container_file(path) {
        return open_container_doc(app, lock, path);
    }
    read_doc_path(path)
}

// 容器打开:引擎 unpack(资源落盘 media_dir,源码写明文),壳读回
fn open_container_doc(app: &AppHandle, lock: &Mutex<()>, path: &str) -> Result<OpenedDoc, String> {
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
    let media = local_app_dir().join("media").join(safe_stem);
    fs::create_dir_all(&media).map_err(|e| format!("创建媒体目录失败:{e}"))?;
    let media_dir = media.to_string_lossy().to_string();
    let source_out = build.join("cli_container_src.awen");
    let source_out_s = source_out.to_string_lossy().to_string();
    let _g = lock.lock().map_err(|_| "内部锁中毒".to_string())?;
    let mut cmd = Command::new(&exe);
    cmd.args(["run", "src/tauri_cli.aine", "unpack", path, &media_dir, &source_out_s])
        .current_dir(&dir);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().map_err(|e| format!("启动 aine.exe 失败:{e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!("容器解包失败:{}{}", stderr.trim(), stdout.trim()));
    }
    let status = fs::read_to_string(build.join("cli_out.json"))
        .map_err(|e| format!("读取 cli_out.json 失败:{e}"))?;
    if !status.contains("\"ok\":true") {
        return Err(format!("容器打开失败:{status}"));
    }
    let source = fs::read_to_string(&source_out).map_err(|e| format!("读取解包源码失败:{e}"))?;
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
async fn core_save_file(app: AppHandle, path: String, content: String) -> Result<bool, String> {
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
    lock: State<'_, AineLock>,
    path: String,
    syntax: String,
    doc_id: String,
) -> Result<String, String> {
    let lock = lock.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = aine_dir(&app)?;
        let exe = dir.join("aine.exe");
        if !exe.is_file() {
            return Err(format!("aine.exe 不存在:{}", exe.display()));
        }
        let build = dir.join("build");
        fs::create_dir_all(&build).map_err(|e| format!("创建 build/ 失败:{e}"))?;
        fs::write(build.join("cli_in.awen"), &syntax).map_err(|e| format!("写入 cli_in.awen 失败:{e}"))?;
        let media_base = local_app_dir().join("media");
        fs::create_dir_all(&media_base).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        let media_base_s = media_base.to_string_lossy().to_string();
        let _g = lock.lock().map_err(|_| "内部锁中毒".to_string())?;
        let mut cmd = Command::new(&exe);
        cmd.args(["run", "src/tauri_cli.aine", "pack", "build/cli_in.awen", &path, &doc_id, &media_base_s])
            .current_dir(&dir);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let out = cmd.output().map_err(|e| format!("启动 aine.exe 失败:{e}"))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            return Err(format!("容器打包失败:{}{}", stderr.trim(), stdout.trim()));
        }
        let packed = fs::read_to_string(build.join("cli_container_src.awen"))
            .map_err(|e| format!("读取资源化源码失败:{e}"))?;
        let media_dir = media_base.to_string_lossy().to_string();
        let source_json = serde_json::to_string(&packed).unwrap_or_else(|_| "\"\"".into());
        let md_json = serde_json::to_string(&media_dir).unwrap_or_else(|_| "\"\"".into());
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
    lock: State<'_, AineLock>,
    path: String,
) -> Result<String, String> {
    let lock = lock.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = aine_dir(&app)?;
        let exe = dir.join("aine.exe");
        if !exe.is_file() {
            return Err(format!("aine.exe 不存在:{}", exe.display()));
        }
        let build = dir.join("build");
        fs::create_dir_all(&build).map_err(|e| format!("创建 build/ 失败:{e}"))?;
        // 媒体目录:按文件名派生,预先创建(write_bytes 不建父目录)
        let stem = Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "doc".into());
        let safe_stem: String = stem
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        let media = local_app_dir().join("media");
        fs::create_dir_all(&media).map_err(|e| format!("创建媒体目录失败:{e}"))?;
        let media_dir = media.to_string_lossy().to_string();
        let source_out = build.join("cli_container_src.awen");
        let source_out_s = source_out.to_string_lossy().to_string();
        let _g = lock.lock().map_err(|_| "内部锁中毒".to_string())?;
        let mut cmd = Command::new(&exe);
        cmd.args(["run", "src/tauri_cli.aine", "unpack", &path, &media_dir, &source_out_s])
            .current_dir(&dir);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let out = cmd.output().map_err(|e| format!("启动 aine.exe 失败:{e}"))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            return Err(format!("容器解包失败:{}{}", stderr.trim(), stdout.trim()));
        }
        let status = fs::read_to_string(build.join("cli_out.json"))
            .map_err(|e| format!("读取 cli_out.json 失败:{e}"))?;
        if !status.contains("\"ok\":true") {
            return Err(format!("容器打开失败:{status}"));
        }
        let source = fs::read_to_string(&source_out).map_err(|e| format!("读取解包源码失败:{e}"))?;
        // document_id 从状态 JSON 里粗提取(前端仅用于媒体目录标识)
        let doc_id = status
            .split("\"document_id\":\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .unwrap_or("")
            .to_string();
        let chunks_n = status
            .split("\"chunks\":")
            .nth(1)
            .and_then(|s| s.split(',').next())
            .unwrap_or("0")
            .to_string();
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

// 读取本地图片为 data URI(路径由前端 dialog.open 选择;对话框不能在
// spawn_blocking 线程 blocking 调用,故选择在前端、读取在此)
#[tauri::command]
async fn read_image_data_uri(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = fs::read(&path).map_err(|e| format!("读取失败:{e}"))?;
        if data.len() > 20 * 1024 * 1024 {
            return Err("图片超过 20MB".into());
        }
        let mime = match path
            .rsplit('.')
            .next()
            .map(|e| e.to_lowercase())
            .unwrap_or_default()
            .as_str()
        {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "application/octet-stream",
        };
        const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut b64 = String::with_capacity((data.len() + 2) / 3 * 4);
        for ch in data.chunks(3) {
            let b = [ch[0], *ch.get(1).unwrap_or(&0), *ch.get(2).unwrap_or(&0)];
            let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
            b64.push(T[(n >> 18) as usize & 63] as char);
            b64.push(T[(n >> 12) as usize & 63] as char);
            b64.push(if ch.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
            b64.push(if ch.len() > 2 { T[n as usize & 63] as char } else { '=' });
        }
        Ok(format!("data:{};base64,{}", mime, b64))
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
            core_open_dialog,
            core_save_dialog,
            core_read_file,
            core_save_file,
            core_take_pending_paths,
            awen_container_save,
            awen_container_open,
            read_image_data_uri
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
