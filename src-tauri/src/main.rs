// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[macro_use]
mod templates;
#[macro_use]
mod windows;
#[macro_use]
mod builder;
mod operation;
#[macro_use]
mod sideloader;
#[macro_use]
mod sourcekit_lsp;
#[macro_use]
mod lsp_utils;

use builder::crossplatform::{linux_path, windows_path};
use builder::icon::import_icon;
use builder::sdk::install_sdk_operation;
use builder::swift::{
    build_swift, clean_swift, deploy_swift, get_swiftly_toolchains, get_toolchain_info,
    has_darwin_sdk, validate_toolchain,
};
use lsp_utils::{has_limited_ram, validate_project};
use rustls::crypto::{ring, CryptoProvider};
use serde_json::Value;
use sideloader::{
    apple_commands::{
        delete_app_id, delete_stored_credentials, get_apple_email, get_certificates, list_app_ids,
        reset_anisette, revoke_certificate,
    },
    device::{is_ddi_mounted, mount_ddi},
    sideload::refresh_idevice,
    stdout::{is_streaming_stdout, start_stream_stdout, stop_stream_stdout, StdoutStream},
    syslog::{is_streaming_syslog, start_stream_syslog, stop_stream_syslog, SyslogStream},
};
use sourcekit_lsp::{get_server_status, start_sourcekit_server, stop_sourcekit_server};
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_cli::CliExt;
use tauri_plugin_store::StoreExt;
use templates::create_template;
use tokio::sync::Mutex;
use windows::{has_wsl, install_wsl, is_windows};

fn main() {
    CryptoProvider::install_default(ring::default_provider()).unwrap();

    let syslog_stream: SyslogStream = SyslogStream(Arc::new(Mutex::new(None)));
    let stdout_stream: StdoutStream = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(sourcekit_lsp::create_server_state())
        .manage(syslog_stream)
        .manage(stdout_stream)
        .setup(|app| {
            match app.cli().matches() {
                Ok(matches) => {
                    if let Some(arg) = matches.args.get("showMainWindow") {
                        if arg.value == Value::Bool(true) {
                            let window = app.get_webview_window("main").unwrap();
                            window.show().unwrap();
                            window.open_devtools();
                        }
                    }
                }
                Err(_) => {}
            }

            let store = app.store("preferences.json")?;

            let open_last = if store.has("general/startup") {
                store.get("general/startup").unwrap().as_str().unwrap() == "open-last"
            } else {
                true
            };

            if open_last {
                if let Some(last_project) = store.get("last-opened-project") {
                    if last_project.is_string() {
                        let path = last_project.as_str().unwrap();
                        let url_str = format!("/ide/{}", path);
                        app.get_webview_window("main")
                            .unwrap()
                            .eval(&format!("window.location.replace('{}')", url_str))?;
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Destroyed => {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            is_windows,
            has_wsl,
            build_swift,
            deploy_swift,
            clean_swift,
            refresh_idevice,
            delete_stored_credentials,
            reset_anisette,
            get_apple_email,
            revoke_certificate,
            get_certificates,
            list_app_ids,
            delete_app_id,
            create_template,
            get_swiftly_toolchains,
            validate_toolchain,
            get_toolchain_info,
            install_sdk_operation,
            has_darwin_sdk,
            start_sourcekit_server,
            stop_sourcekit_server,
            get_server_status,
            has_limited_ram,
            validate_project,
            linux_path,
            windows_path,
            start_stream_syslog,
            stop_stream_syslog,
            import_icon,
            is_streaming_syslog,
            open_devtools,
            start_stream_stdout,
            stop_stream_stdout,
            is_streaming_stdout,
            install_wsl,
            is_ddi_mounted,
            mount_ddi,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn emit_error_and_return<T>(window: &tauri::Window, msg: &str) -> Result<T, String> {
    window.emit("build-output", msg.to_string()).ok();
    window.emit("build-output", "command.done.999").ok();
    Err(msg.to_string())
}

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main").unwrap().open_devtools();
    Ok(())
}
