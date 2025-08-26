#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use wslpath2::{convert, Conversion};

#[cfg(target_os = "windows")]
pub fn windows_to_wsl_path(path: &str) -> Result<String, String> {
    println!("Converting Windows path to WSL path: {}", path);
    convert(path, None, Conversion::WindowsToWsl, false).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
pub fn wsl_to_windows_path(path: &str) -> Result<String, String> {
    println!("Converting WSL path to Windows path: {}", path);
    convert(path, None, Conversion::WslToWindows, false).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_wsl() -> bool {
    #[cfg(not(target_os = "windows"))]
    {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("wsl")
            .arg("echo")
            .arg("1")
            .stdout(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .expect("failed to execute process");

        let output = String::from_utf8_lossy(&output.stdout);
        return output.trim() == "1";
    }
}

#[tauri::command]
pub fn is_windows() -> bool {
    cfg!(target_os = "windows")
}
