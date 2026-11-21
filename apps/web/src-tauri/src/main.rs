#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! UniBridgeAI desktop shell.
//!
//! Starts the bundled Node.js server (embedded PostgreSQL + API + web UI) on
//! 127.0.0.1, shows it in the window, stops it cleanly on exit so the database
//! files are closed properly, and installs signed updates from GitHub Releases.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{State, Webview};

use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;


const PORT: u16 = 3417;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);

struct Server {
    child: Mutex<Option<Child>>,
    token: String,
    capture_token: String,
}

struct ImportCode(Mutex<Option<String>>);

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("operating system random generator failed");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Minimal HTTP/1.1 request to the local server; returns the status code.
fn local_request(method: &str, path: &str, token: &str, timeout: Duration) -> Option<u16> {
    let mut stream = TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), timeout).ok()?;
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost:{PORT}\r\nx-shutdown-token: {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut head = [0u8; 32];
    let n = stream.read(&mut head).ok()?;
    std::str::from_utf8(&head[..n])
        .ok()?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

fn start_server(app: &AppHandle, token: &str, capture_token: &str, data_dir: &PathBuf) -> Result<Child, String> {
    let server_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("server");
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("no executable directory")?
        .to_path_buf();
    let node = exe_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("server.log"))
        .map_err(|e| e.to_string())?;
    let mut cmd = Command::new(&node);
    cmd.arg(server_dir.join("apps").join("api").join("src").join("local.js"))
        .current_dir(&server_dir)
        .env("UB_DATA_DIR", data_dir)
        .env("UB_PORT", PORT.to_string())
        .env("UB_ORIGIN", format!("http://localhost:{PORT}"))
        .env("UB_STATIC_DIR", server_dir.join("web"))
        .env("UB_SHUTDOWN_TOKEN", token)
        .env("UB_NATIVE_CAPTURE_TOKEN", capture_token)
        .env("UB_EXIT_WITH_STDIN", "1")
        .env_remove("NODE_ENV")
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::piped())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
        .map_err(|e| format!("Could not start {}: {e}", node.display()))
}

fn supported_source(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(url.host_str(), Some(
            "du.astanait.edu.kz" | "my-du.astanait.edu.kz" | "lms.astanait.edu.kz"
            | "linkedin.com" | "www.linkedin.com" | "scopus.com" | "www.scopus.com"
            | "researchgate.net" | "www.researchgate.net" | "orcid.org"
        ))
}

fn post_native_capture(secret: &str, code: &str, source: &str, content: &str) -> Result<(), String> {
    let body = serde_json::json!({"token":code,"sourceUrl":source,"content":content}).to_string();
    let mut stream = TcpStream::connect_timeout(&([127,0,0,1], PORT).into(), Duration::from_secs(3)).map_err(|_| "UniBridgeAI local server is unavailable".to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|e| e.to_string())?;
    let request = format!("POST /api/browser-import/native-capture HTTP/1.1\r\nHost: localhost:{PORT}\r\nOrigin: http://localhost:{PORT}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nx-unibridge-capture: {secret}\r\nConnection: close\r\n\r\n{body}", body.len());
    stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(|e| e.to_string())?;
    let (head, payload) = response.split_once("\r\n\r\n").ok_or("Invalid local server response")?;
    let status: u16 = head.lines().next().and_then(|line| line.split_whitespace().nth(1)).and_then(|code| code.parse().ok()).ok_or("Invalid local server status")?;
    if status == 201 { return Ok(()); }
    let message = serde_json::from_str::<serde_json::Value>(payload).ok().and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string)).unwrap_or_else(|| "Could not import this page".to_string());
    Err(message)
}

#[tauri::command]
async fn open_university_browser(app: AppHandle, state: State<'_, ImportCode>, url: String, code: String) -> Result<(), String> {
    if code.len() != 64 || !code.bytes().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
        return Err("Generate a fresh import code first".into());
    }
    let url = Url::parse(&url).map_err(|_| "Invalid university URL")?;
    if !supported_source(&url) { return Err("This website is not supported yet".into()); }
    if let Some(existing) = app.get_webview_window("university-source") {
        existing.navigate(url.clone()).map_err(|e| format!("Could not open the university page: {e}"))?;
        let _ = existing.set_focus();
        *state.0.lock().map_err(|_| "Import window is busy")? = Some(code);
        return Ok(());
    }
    *state.0.lock().map_err(|_| "Import window is busy")? = Some(code);
    WebviewWindowBuilder::new(&app, "university-source", WebviewUrl::External(url))
        .title("UniBridgeAI · University account")
        .inner_size(1200.0, 820.0)
        .initialization_script(include_str!("../scripts/page-bridge.js"))
        .build()
        .map(|_| ())
        .map_err(|e| format!("Could not open the in-app browser: {e}"))
}

#[tauri::command]
fn capture_university_page(content: String, webview: Webview, server: State<'_, Server>, code: State<'_, ImportCode>) -> Result<(), String> {
    if webview.label() != "university-source" { return Err("Capture is available only in the UniBridgeAI university window".into()); }
    if content.trim().is_empty() || content.encode_utf16().count() > 30_000 { return Err("Select or shorten the text (maximum 30,000 characters)".into()); }
    let url = webview.url().map_err(|_| "Could not read the current page")?;
    if !supported_source(&url) { return Err("This page is outside the supported university and research sites".into()); }
    let import_code = code.0.lock().map_err(|_| "Import window is busy")?.clone().ok_or("Return to UniBridgeAI and generate a new import code")?;
    let source = format!("{}{}", url.origin().ascii_serialization(), url.path());
    post_native_capture(&server.capture_token, &import_code, &source, content.trim())?;
    *code.0.lock().map_err(|_| "Import window is busy")? = None;
    Ok(())
}

/// Ask the server to close the database, then make sure the process is gone.
fn stop_server(app: &AppHandle) {
    let Some(state) = app.try_state::<Server>() else { return };
    let Some(mut child) = state.child.lock().unwrap().take() else { return };
    let _ = local_request("POST", "/__shutdown", &state.token, Duration::from_secs(2));
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn fail(app: &AppHandle, message: String) {
    let handle = app.clone();
    app.dialog()
        .message(message)
        .title("UniBridgeAI")
        .kind(MessageDialogKind::Error)
        .show(move |_| {
            stop_server(&handle);
            handle.exit(1);
        });
}

fn show_first_run_credentials(app: &AppHandle, data_dir: &PathBuf) {
    let marker = data_dir.join(".credentials-shown");
    let file = data_dir.join("local-access.txt");
    if marker.exists() {
        return;
    }
    if let Ok(text) = fs::read_to_string(&file) {
        let _ = fs::write(&marker, "");
        app.dialog()
            .message(format!(
                "Аккаунты для входа (сохранены в файле):\n{}\n\n{}",
                file.display(),
                text.trim()
            ))
            .title("UniBridgeAI — первый запуск")
            .kind(MessageDialogKind::Info)
            .show(|_| {});
    }
}

// Writes one line to update.log in the app data folder, so a silent failure
// (network, firewall, antivirus, signature) can be diagnosed later.
fn log_update(app: &AppHandle, line: &str) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&dir);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(dir.join("update.log")) {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(file, "[{stamp}] {line}");
        }
    }
}

// `manual` is true when the user pressed "Check for updates"; then every
// outcome is shown. The automatic start-up check stays quiet unless an update exists.
fn check_for_update(app: AppHandle, manual: bool) {
    tauri::async_runtime::spawn(async move {
        let outcome = match app.updater() {
            Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        };
        match outcome {
            Err(e) => {
                log_update(&app, &format!("check failed: {e}"));
                if manual {
                    app.dialog()
                        .message(format!("Не удалось проверить обновления.\n\n{e}\n\nПодробности записаны в update.log."))
                        .title("Обновление UniBridgeAI")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
            }
            Ok(None) => {
                log_update(&app, "no update available");
                if manual {
                    app.dialog()
                        .message(format!("У вас установлена последняя версия ({}).", app.package_info().version))
                        .title("Обновление UniBridgeAI")
                        .kind(MessageDialogKind::Info)
                        .show(|_| {});
                }
            }
            Ok(Some(update)) => {
                log_update(&app, &format!("update {} available (current {})", update.version, update.current_version));
                let handle = app.clone();
                app.dialog()
                    .message(format!(
                        "Доступна новая версия {} (у вас {}).\n\n{}\n\nУстановить сейчас? Программа закроется, обновится и откроется снова. Ваши данные не удаляются.",
                        update.version,
                        update.current_version,
                        update.body.clone().unwrap_or_default()
                    ))
                    .title("Обновление UniBridgeAI")
                    .buttons(MessageDialogButtons::OkCancelCustom("Установить".into(), "Позже".into()))
                    .show(move |install| {
                        if !install {
                            log_update(&handle, "update postponed by user");
                            return;
                        }
                        tauri::async_runtime::spawn(async move {
                            // Close the database before the installer replaces files.
                            let h = handle.clone();
                            let _ = tauri::async_runtime::spawn_blocking(move || stop_server(&h)).await;
                            match update.download_and_install(|_, _| {}, || {}).await {
                                Ok(()) => {
                                    log_update(&handle, "update installed; restarting");
                                    handle.restart();
                                }
                                Err(e) => {
                                    log_update(&handle, &format!("install failed: {e}"));
                                    fail(&handle, format!("Обновление не установлено: {e}"));
                                }
                            }
                        });
                    });
            }
        }
    });
}

#[tauri::command]
fn check_for_updates(app: AppHandle) {
    check_for_update(app, true);
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let token = random_token();
            let capture_token = random_token();
            let child = match start_server(&handle, &token, &capture_token, &data_dir) {
                Ok(child) => Some(child),
                Err(e) => {
                    fail(&handle, format!("Не удалось запустить сервер UniBridgeAI.\n{e}"));
                    None
                }
            };
            app.manage(Server {
                child: Mutex::new(child),
                token,
                capture_token,
            });
            app.manage(ImportCode(Mutex::new(None)));
            std::thread::spawn(move || {
                let started = Instant::now();
                loop {
                    if local_request("GET", "/api/health", "", Duration::from_secs(2)) == Some(200) {
                        break;
                    }
                    let exited = handle
                        .state::<Server>()
                        .child
                        .lock()
                        .unwrap()
                        .as_mut()
                        .map_or(true, |c| matches!(c.try_wait(), Ok(Some(_))));
                    if exited || started.elapsed() > STARTUP_TIMEOUT {
                        fail(
                            &handle,
                            format!(
                                "Локальный сервер не запустился. Возможно, UniBridgeAI уже открыт.\nЖурнал: {}",
                                data_dir.join("server.log").display()
                            ),
                        );
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(300));
                }
                // Open the campus window on the local server, then close the
                // loading window. (Navigating the loading webview from the app
                // scheme to http is not reliable on every platform.)
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    let url: Url = format!("http://localhost:{PORT}/").parse().unwrap();
                    let built = WebviewWindowBuilder::new(&h, "main", WebviewUrl::External(url))
                        .title("UniBridgeAI")
                        .inner_size(1280.0, 850.0)
                        .min_inner_size(800.0, 600.0)
                        .build();
                    match built {
                        Ok(_) => {
                            if let Some(loading) = h.get_webview_window("loading") {
                                let _ = loading.close();
                            }
                        }
                        Err(e) => fail(&h, format!("Не удалось открыть окно: {e}")),
                    }
                });
                show_first_run_credentials(&handle, &data_dir);
                check_for_update(handle, false);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_university_browser, capture_university_page, check_for_updates])
        .build(tauri::generate_context!())
        .expect("Failed to launch UniBridgeAI");
    app.run(|handle, event| {
        if let RunEvent::ExitRequested { api, code: None, .. } = &event {
            // Closing the loading window before the campus window exists is not an exit.
            if handle.get_webview_window("main").is_none()
                && handle.state::<Server>().child.lock().unwrap().is_some()
            {
                api.prevent_exit();
            }
        }
        if let RunEvent::Exit = event {
            stop_server(handle);
        }
    });
}
