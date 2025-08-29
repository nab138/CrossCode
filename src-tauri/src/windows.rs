#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
pub fn windows_to_wsl_path(path: &str) -> Result<String, String> {
    let res = convert(path, Conversion::WindowsToWsl, false, true).map_err(|e| e.to_string());
    match res {
        Ok(path) => Ok(path),
        Err(err) => {
            let res2 = convert(path, Conversion::WindowsToWsl, false, false);
            match res2 {
                Ok(path) => Ok(path),
                Err(_) => Err(err),
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub fn wsl_to_windows_path(path: &str) -> Result<String, String> {
    let res = convert(path, Conversion::WslToWindows, false, true).map_err(|e| e.to_string());
    match res {
        Ok(path) => Ok(path),
        Err(err) => {
            let res2 = convert(path, Conversion::WslToWindows, false, false);
            match res2 {
                Ok(path) => Ok(path),
                Err(_) => Err(err),
            }
        }
    }
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
            .output();

        if let Err(err) = output {
            println!("Failed to execute WSL: {}", err);
            return false;
        }

        let output = output.unwrap();

        let output = String::from_utf8_lossy(&output.stdout);
        return output.trim() == "1";
    }
}

#[tauri::command]
pub fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

#[tauri::command]
pub fn install_wsl() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("powershell")
            .arg("-Command")
            .arg("Start-Process powershell -Verb runAs -ArgumentList 'wsl --install'")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Taken from wslpath2 crate and modified
#[cfg(target_os = "windows")]
#[derive(Debug)]
pub enum Conversion {
    /// Convert Windows path to WSL path
    WindowsToWsl,
    /// Convert WSL path to Windows path
    WslToWindows,
    /// Convert WSL path to Windows path using Linux style path separators
    WslToWindowsLinuxStyle,
}

#[cfg(target_os = "windows")]
pub fn convert(
    path: &str,
    options: Conversion,
    force_absolute_path: bool,
    replace_backslash: bool,
) -> Result<String, Box<dyn std::error::Error>> {
    let mut args = Vec::new();

    args.push("-e");
    args.push("wslpath");

    args.push(match options {
        Conversion::WindowsToWsl => "-u",
        Conversion::WslToWindows => "-w",
        Conversion::WslToWindowsLinuxStyle => "-m",
    });

    if force_absolute_path {
        args.push("-a");
    }

    let mut cmd = Command::new("wsl.exe");
    cmd.args(args);
    let real_path = if replace_backslash {
        path.replace('\\', "\\\\")
    } else {
        path.to_string()
    };
    cmd.arg(real_path);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .map_err(|e| format!("Error executing wsl.exe: {}", e))?;

    let code = output.status.code().unwrap_or(-1);
    if code != 0 {
        return Err(format!("Error getting wslpath: {}", code).into());
    }

    Ok(std::str::from_utf8(&output.stdout)
        .map_err(|e| format!("Error converting output to string: {}", e))?
        .trim()
        .to_string())
}
