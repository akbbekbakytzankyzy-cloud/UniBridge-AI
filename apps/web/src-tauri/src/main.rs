#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! UniBridgeAI desktop shell.
//!
//! Starts the bundled Node.js server (embedded PostgreSQL + API + web UI) on
//! 127.0.0.1, shows it in the window, stops it cleanly on exit so the database
//! files are closed properly, and installs signed updates from GitHub Releases.

use std::collections::hash_map::RandomState;
use std::fs::{self, OpenOptions};
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

const PORT: u16 = 3417;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);

struct Server {
    child: Mutex<Option<Child>>,
    token: String,
}

fn random_token() -> String {
    // Two independently seeded SipHash states give 128 random bits from the OS.
    let a = RandomState::new().build_hasher().finish();
    let mut h = RandomState::new().build_hasher();
    h.write_u128(Instant::now().elapsed().as_nanos() ^ std::process::id() as u128);
    format!("{a:016x}{:016x}", h.finish())
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

fn start_server(app: &AppHandle, token: &str, data_dir: &PathBuf) -> Result<Child, String> {
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

fn check_for_update(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = app.updater() else { return };
        let Ok(Some(update)) = updater.check().await else { return };
        let handle = app.clone();
        app.dialog()
            .message(format!(
                "Доступна новая версия {} (у вас {}).\n\n{}\n\nУстановить сейчас? Приложение перезапустится.",
                update.version,
                update.current_version,
                update.body.clone().unwrap_or_default()
            ))
            .title("Обновление UniBridgeAI")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Установить".into(),
                "Позже".into(),
            ))
            .show(move |install| {
                if !install {
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    // Close the database before the installer replaces files.
                    let h = handle.clone();
                    let _ = tauri::async_runtime::spawn_blocking(move || stop_server(&h)).await;
                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => handle.restart(),
                        Err(e) => fail(&handle, format!("Обновление не установлено: {e}")),
                    }
                });
            });
    });
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
            let child = match start_server(&handle, &token, &data_dir) {
                Ok(child) => Some(child),
                Err(e) => {
                    fail(&handle, format!("Не удалось запустить сервер UniBridgeAI.\n{e}"));
                    None
                }
            };
            app.manage(Server {
                child: Mutex::new(child),
                token,
            });
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
                check_for_update(handle);
            });
            Ok(())
        })
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
