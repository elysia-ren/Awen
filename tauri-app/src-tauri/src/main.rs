// awen-editor —— Tauri 桌面版后端
//
// 权威解析:JS 侧 Bridge.parse → core_parse 命令 → spawn aine.exe run
// src/tauri_cli.aine(读 build/cli_in.awen,写 build/cli_out.json)。
// aine 运行时(aine.exe + aine.toml + src/)随应用打包为资源目录
// aine-runtime/;开发期可用环境变量 AWEN_AINE_DIR 直接指向仓库根。
//
// aine_cli 路径约定见 src/tauri_cli.aine 头注释;并发由 AineLock 串行化。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

struct AineLock(Arc<Mutex<()>>);

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
    let out = Command::new(&exe)
        .args(["run", "src/tauri_cli.aine"])
        .current_dir(&dir)
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
    tauri::async_runtime::spawn_blocking(move || {
        run_core_parse(&app, &lock, &src)
    })
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
    }))
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
            })
        })
}

#[derive(serde::Serialize)]
struct OpenedDocPayload {
    name: String,
    src: String,
}

#[tauri::command]
async fn core_save_dialog(
    app: AppHandle,
    name: String,
    content: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || pick_and_write(&app, &name, &content))
        .await
        .map_err(|e| format!("任务调度失败:{e}"))?
}

fn pick_and_write(app: &AppHandle, name: &str, content: &str) -> Result<bool, String> {
    let suggested = if PathBuf::from(name).extension().is_some() {
        name.to_string()
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
        None => return Ok(false),
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| format!("写入失败:{e}"))?;
    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AineLock(Arc::new(Mutex::new(()))))
        .invoke_handler(tauri::generate_handler![
            core_parse,
            core_open_dialog,
            core_save_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
