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

use sideloader::{
    apple_commands::{
        delete_app_id, delete_stored_credentials, get_apple_email, get_certificates, list_app_ids,
        reset_anisette, revoke_certificate,
    },
    sideload::refresh_idevice,
};
use tauri::Emitter;
use templates::create_template;

use builder::sdk::install_sdk_operation;
use builder::swift::{
    build_swift, clean_swift, deploy_swift, get_swiftly_toolchains, get_toolchain_info,
    has_darwin_sdk, validate_toolchain,
};
use sourcekit_lsp::{get_server_status, start_sourcekit_server, stop_sourcekit_server};

use builder::crossplatform::{linux_path, windows_path};
use lsp_utils::{ensure_lsp_config, has_limited_ram, validate_project};
use windows::{has_wsl, is_windows};

use serde_json::Value;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_os::init())
        .manage(sourcekit_lsp::create_server_state())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            match app.cli().matches() {
                Ok(matches) => {
                    if let Some(arg) = matches.args.get("showMainWindow") {
                        if arg.value == Value::Bool(true) {
                            let window = app.get_webview_window("main").unwrap();
                            window.show().unwrap();
                        }
                    }
                }
                Err(_) => {}
            }
            Ok(())
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
            ensure_lsp_config,
            linux_path,
            windows_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn emit_error_and_return<T>(window: &tauri::Window, msg: &str) -> Result<T, String> {
    window.emit("build-output", msg.to_string()).ok();
    window.emit("build-output", "command.done.999").ok();
    Err(msg.to_string())
}
