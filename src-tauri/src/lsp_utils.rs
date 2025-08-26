use std::path::PathBuf;

use sysinfo::System;

use crate::builder::config::{ProjectConfig, ProjectValidation};

#[tauri::command]
pub fn has_limited_ram() -> bool {
    let s = System::new_all();
    let mem_gib = s.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    // This is intended to be 16gb, however 16gb of physical ram does not always translate to 16gb of usable memory.
    mem_gib < 14.0
}

#[tauri::command]
pub fn validate_project(project_path: String, toolchain_path: String) -> ProjectValidation {
    ProjectConfig::validate(PathBuf::from(project_path), &toolchain_path)
}

// #[tauri::command]
// pub fn ensure_lsp_config(project_path: String) -> Result<(), String> {
//     let project_path = PathBuf::from(project_path);
//     if !project_path.exists() {
//         return Err(format!("Project path does not exist: {:?}", project_path));
//     }

//     let sourcekit_lsp_path = project_path.join(".sourcekit-lsp");
//     if !sourcekit_lsp_path.exists() {
//         fs::create_dir_all(sourcekit_lsp_path).map_err(|e| e.to_string())?;
//     }

//     let config_path = project_path.join(".sourcekit-lsp").join("config.json");
//     if !config_path.exists() {
//         fs::write(config_path, "{
//   \"$schema\": \"https://raw.githubusercontent.com/swiftlang/sourcekit-lsp/refs/heads/release/6.1/config.schema.json\",
//   \"swiftPM\": {
//     \"swiftSDK\": \"arm64-apple-ios\"
//   }
// }").map_err(|e| e.to_string())?;
//     }
//     Ok(())
// }
