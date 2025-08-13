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
use std::path::PathBuf;

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
use sysinfo::System;
use windows::{has_wsl, is_windows};

use crate::builder::config::{ProjectConfig, ProjectValidation};

fn main() {
    tauri::Builder::default()
        .manage(sourcekit_lsp::create_server_state())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
fn has_limited_ram() -> bool {
    let s = System::new_all();
    let mem_gib = s.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    mem_gib < 12.0
}

#[tauri::command]
fn validate_project(project_path: String, toolchain_path: String) -> ProjectValidation {
    ProjectConfig::validate(PathBuf::from(project_path), &toolchain_path)
}
