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
use std::path::PathBuf;
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

/// .awen 容器(v0.4)解包:取 "# ---" 分隔行之后的明文源码
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
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名文档".into());
    let content = fs::read_to_string(&path).map_err(|e| format!("读取失败:{e}"))?;
    Ok(Some(OpenedDoc {
        name,
        src: unwrap_container(content),
        path: Some(path.to_string_lossy().to_string()),
    }))
}

#[derive(serde::Serialize)]
struct OpenedDocPayload {
    name: String,
    src: String,
    path: Option<String>,
}

#[tauri::command]
async fn core_open_dialog(app: AppHandle) -> Result<Option<OpenedDocPayload>, String> {
    tauri::async_runtime::spawn_blocking(move || pick_and_read(&app))
        .await
        .map_err(|e| format!("任务调度失败:{e}"))?
        .map(|opt| {
            opt.map(|d| OpenedDocPayload {
                name: d.name,
                src: d.src,
                path: d.path,
            })
        })
}

/// 按已知路径直接读取(单实例/最近文件)
#[tauri::command]
async fn core_read_file(path: String) -> Result<OpenedDocPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_doc_path(&path).map(|d| OpenedDocPayload {
            name: d.name,
            src: d.src,
            path: d.path,
        })
    })
    .await
    .map_err(|e| format!("任务调度失败:{e}"))?
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
            core_take_pending_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
