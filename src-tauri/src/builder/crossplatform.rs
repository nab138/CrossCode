#[cfg(target_os = "windows")]
use crate::windows::{has_wsl, windows_to_wsl_path, wsl_to_windows_path};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
};

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
        let output = Command::new("wsl")
            .arg("ln")
            .arg("-s")
            .arg(target)
            .arg(windows_to_wsl_path(link))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
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
    }
    Ok(())
}

pub fn read_link(path: &PathBuf) -> Result<PathBuf, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return fs::read_link(path).map_err(|e| format!("Failed to read symlink: {}", e));
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return Err("WSL is not available".to_string());
        }
        let output = Command::new("wsl")
            .arg("readlink")
            .arg(windows_to_wsl_path(&path.to_string_lossy().to_string()))
            .output()
            .expect("failed to execute process");
        if output.status.success() {
            let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(PathBuf::from(res))
        } else {
            Err(format!(
                "Failed to read symlink '{}': {}",
                path.display(),
                String::from_utf8_lossy(&output.stderr)
            ))
        }
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
pub fn windows_path(path: &str) -> String {
    #[cfg(not(target_os = "windows"))]
    {
        return path.to_string();
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return path.to_string();
        }
        return wsl_to_windows_path(path);
    }
}

#[tauri::command]
pub fn linux_path(path: &str) -> String {
    #[cfg(not(target_os = "windows"))]
    {
        return path.to_string();
    }
    #[cfg(target_os = "windows")]
    {
        if !has_wsl() {
            return path.to_string();
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
        Ok(PathBuf::from(wsl_to_windows_path("/tmp")))
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
        let output = Command::new("wsl")
            .arg("rm")
            .arg("-rf")
            .arg(windows_to_wsl_path(&path.to_string_lossy().to_string()))
            .output()
            .expect("failed to execute process");
        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
}
