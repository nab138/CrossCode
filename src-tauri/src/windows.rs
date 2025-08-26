use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use wslpath2::{convert, Conversion};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
pub fn windows_to_wsl_path(path: &str) -> String {
    convert(path, None, Conversion::WindowsToWsl, false).unwrap()
}

#[cfg(target_os = "windows")]
pub fn wsl_to_windows_path(path: &str) -> String {
    convert(path, None, Conversion::WslToWindows, false).unwrap()
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
