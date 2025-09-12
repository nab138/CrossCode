#[cfg(target_os = "windows")]
use crate::windows::{has_wsl, windows_to_wsl_path, wsl_to_windows_path};
#[cfg(not(target_os = "windows"))]
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn symlink(target: &str, link: &str) -> std::io::Result<()> {
    #[cfg(not(target_os = "windows"))]
    {
        return std::os::unix::fs::symlink(target, link);
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "WSL is not available",
            ));
        }
        let path = windows_to_wsl_path(link).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Path conversion error: {}", e),
            )
        })?;
        let output = Command::new("wsl")
            .arg("ln")
            .arg("-s")
            .arg(target)
            .arg(path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .expect("failed to execute process");
        if !output.status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "failed to create symlink: {}",
                    String::from_utf8_lossy(&output.stderr)
                ),
            ));
        }
        return Ok(());
    }
}

pub fn linux_env(key: &str) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return std::env::var(key).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Err("WSL is not available".to_string());
        }
        let output = Command::new("wsl")
            .args(["bash", "-l", "-c"])
            .arg(format!("printenv {}", key))
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .expect("failed to execute process");
        if output.status.success() {
            let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if res.is_empty() {
                Err("Environment variable not found".to_string())
            } else {
                Ok(res)
            }
        } else {
            Err(format!(
                "Failed to get environment variable '{}': {}",
                key,
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }
}

#[tauri::command]
pub fn windows_path(path: &str) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Ok(path.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Ok(path.to_string());
        }
        return wsl_to_windows_path(path);
    }
}

#[tauri::command]
pub fn linux_path(path: &str) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Ok(path.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Ok(path.to_string());
        }
        return windows_to_wsl_path(path);
    }
}

pub fn linux_temp_dir() -> Result<PathBuf, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Ok(std::env::temp_dir());
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Err("WSL is not available".to_string());
        }
        let path = wsl_to_windows_path("/tmp")?;
        Ok(PathBuf::from(path))
    }
}

pub fn remove_dir_all(path: &PathBuf) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        return fs::remove_dir_all(path).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Err("WSL is not available".to_string());
        }
        let path = windows_to_wsl_path(&path.to_string_lossy().to_string())?;
        let output = Command::new("wsl")
            .arg("rm")
            .arg("-rf")
            .arg(path)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .expect("failed to execute process");
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
}
