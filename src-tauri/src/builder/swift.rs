#[cfg(target_os = "windows")]
use crate::windows::has_wsl;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::{
    builder::{
        config::{BuildSettings, ProjectConfig},
        crossplatform::{linux_env, windows_path},
        packer::{pack, zip_ipa},
    },
    emit_error_and_return,
    sideloader::{device::DeviceInfo, sideload::sideload_app},
};
use serde::{Deserialize, Serialize};
use std::{
    io::{self, BufRead, BufReader},
    path::PathBuf,
    process::{Command, Output, Stdio},
    thread,
};
use tauri::{Emitter, Window};
use tokio::process::Command as TokioCommand;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainResult {
    pub swiftly_installed: bool,
    pub swiftly_version: Option<String>,
    pub toolchains: Vec<Toolchain>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Toolchain {
    pub version: String,
    pub path: String,
    pub is_swiftly: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SwiftlyConfig {
    pub installed_toolchains: Vec<String>,
    pub version: String,
}

#[derive(Debug, Clone)]
pub struct SwiftBin {
    pub bin_path: String,
    pub sourcekit_path: String,
}

impl SwiftBin {
    pub fn new(toolchain_path: &str) -> Result<Self, String> {
        #[cfg(target_os = "windows")]
        {
            if !has_wsl() {
                return Err("WSL is not available".to_string());
            }
            let output = Command::new("wsl")
                .args([
                    "bash",
                    "-c",
                    &format!("test -f \"{}/usr/bin/swift\"", toolchain_path),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("Failed to execute command: {}", e))?;
            if !output.status.success() {
                return Err(format!(
                    "Swift toolchain invalid: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }
            Ok(SwiftBin {
                bin_path: format!("{}/usr/bin/swift", toolchain_path),
                sourcekit_path: format!("{}/usr/bin/sourcekit-lsp", toolchain_path),
            })
        }
        #[cfg(not(target_os = "windows"))]
        {
            let path = PathBuf::from(toolchain_path);

            if !path.exists() || !path.is_dir() {
                return Err("Invalid toolchain path".to_string());
            }
            let swift_path = path.join("usr").join("bin").join("swift");

            if !swift_path.exists() || !swift_path.is_file() {
                return Err("Swift binary not found in toolchain".to_string());
            }

            let sourcekit_path = path.join("usr").join("bin").join("sourcekit-lsp");
            if !sourcekit_path.exists() || !sourcekit_path.is_file() {
                return Err("SourceKit-LSP binary not found in toolchain".to_string());
            }
            Ok(SwiftBin {
                bin_path: swift_path.to_string_lossy().to_string(),
                sourcekit_path: sourcekit_path.to_string_lossy().to_string(),
            })
        }
    }

    pub fn output(&self, args: &[&str]) -> io::Result<Output> {
        #[cfg(target_os = "windows")]
        {
            if !has_wsl() {
                return Err(io::Error::new(io::ErrorKind::Other, "WSL is not available"));
            }
            let mut cmd = Command::new("wsl");
            cmd.args(["bash", "-l", "-c"])
                .arg(format!("\"{}\" {}", self.bin_path, args.join(" ")))
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = Command::new(&self.bin_path);
            cmd.args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
        }
    }

    pub fn command(&self) -> Command {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("wsl");
            cmd.arg(&self.bin_path);
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd
        }
        #[cfg(not(target_os = "windows"))]
        {
            Command::new(&self.bin_path)
        }
    }

    pub fn sourcekit_command(&self) -> TokioCommand {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = TokioCommand::new("wsl");
            cmd.arg(&self.sourcekit_path);
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd
        }
        #[cfg(not(target_os = "windows"))]
        {
            TokioCommand::new(&self.sourcekit_path)
        }
    }
}

#[tauri::command]
pub fn has_darwin_sdk(toolchain_path: &str) -> String {
    let swift_bin = SwiftBin::new(toolchain_path);
    if swift_bin.is_err() {
        return "none".to_string();
    }
    let swift_bin = swift_bin.unwrap();

    let output = swift_bin.output(&["sdk", "list"]);
    if output.is_err() {
        return "none".to_string();
    }
    let output = output.unwrap();
    if !output.status.success() {
        return "none".to_string();
    }
    let output_str = String::from_utf8_lossy(&output.stdout);
    if !output_str.contains("darwin") {
        return "none".to_string();
    }

    let output = swift_bin.output(&[
        "sdk",
        "configure",
        "--show-configuration",
        "darwin",
        "arm64-apple-ios",
    ]);
    if output.is_err() {
        return "none".to_string();
    }
    let output = output.unwrap();
    if !output.status.success() {
        return "none".to_string();
    }

    let output_str = String::from_utf8_lossy(&output.stdout);

    let sdk_version = output_str.lines().find_map(|line| {
        if line.starts_with("sdkRootPath:") {
            let parts: Vec<&str> = line.split('/').collect();
            for part in parts {
                if part.starts_with("iPhoneOS") && part.ends_with(".sdk") {
                    let version = part.trim_start_matches("iPhoneOS").trim_end_matches(".sdk");
                    return Some(version.to_string());
                }
            }
        }
        None
    });

    if let Some(version) = sdk_version {
        version
    } else {
        "none".to_string()
    }
}

#[tauri::command]
pub fn validate_toolchain(toolchain_path: &str) -> bool {
    let swift_path = SwiftBin::new(toolchain_path);
    if swift_path.is_err() {
        return false;
    }
    let swift_path = swift_path.unwrap();

    let output = swift_path.output(&["--version"]);
    if output.is_err() {
        return false;
    }
    let output = output.unwrap();
    if !output.status.success() {
        return false;
    }

    true
}

#[tauri::command]
pub async fn get_toolchain_info(
    toolchain_path: String,
    is_swiftly: bool,
) -> Result<Toolchain, String> {
    if !validate_toolchain(&toolchain_path) {
        return Err("Invalid toolchain path".to_string());
    }
    let swift_path = SwiftBin::new(&toolchain_path)?;

    let output = swift_path
        .output(&["--version"])
        .map_err(|e| format!("Failed to run swift command: {}", e))?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let version = version
        .split_whitespace()
        .nth(2)
        .ok_or("Failed to parse swift version".to_string())?
        .to_string();
    Ok(Toolchain {
        version,
        path: toolchain_path.clone(),
        is_swiftly,
    })
}

#[tauri::command]
pub async fn get_swiftly_toolchains() -> Result<ToolchainResult, String> {
    let swiftly_home_dir = get_swiftly_path();
    if get_swiftly_config().is_err() {
        return Ok(ToolchainResult {
            swiftly_installed: false,
            swiftly_version: None,
            toolchains: vec![],
        });
    }
    if let Some(_) = swiftly_home_dir {
        let config = get_swiftly_config()?;
        let toolchains_unfiltered: Vec<Toolchain> = config
            .installed_toolchains
            .iter()
            .map(|version| {
                #[cfg(target_os = "windows")]
                {
                    let path = format!(
                        "{}/toolchains/{}",
                        swiftly_home_dir.as_ref().unwrap(),
                        version
                    );
                    Toolchain {
                        version: version.clone(),
                        path,
                        is_swiftly: true,
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let path = PathBuf::from(swiftly_home_dir.as_ref().unwrap())
                        .join("toolchains")
                        .join(version);
                    Toolchain {
                        version: version.clone(),
                        path: path.to_string_lossy().to_string(),
                        is_swiftly: true,
                    }
                }
            })
            .collect();

        let mut toolchains = Vec::new();
        for toolchain in toolchains_unfiltered {
            if validate_toolchain(&toolchain.path) {
                toolchains.push(toolchain);
            }
        }

        return Ok(ToolchainResult {
            swiftly_installed: true,
            swiftly_version: Some(config.version),
            toolchains,
        });
    } else {
        return Ok(ToolchainResult {
            swiftly_installed: false,
            swiftly_version: None,
            toolchains: vec![],
        });
    }
}

fn get_swiftly_config() -> Result<SwiftlyConfig, String> {
    let swiftly_home_dir = get_swiftly_path().ok_or("Swiftly home directory not found")?;
    let swiftly_home_dir = windows_path(&swiftly_home_dir)?;

    let config_path = format!("{}/config.json", swiftly_home_dir);

    let content = std::fs::read_to_string(&config_path)
        .map_err(|_| "Failed to read config file".to_string())?;

    // TODO: why?
    let content = content.trim_end_matches('%').to_string();
    let config: SwiftlyConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;

    Ok(config)
}

fn get_swiftly_path() -> Option<String> {
    let swiftly_home_dir = linux_env("SWIFTLY_HOME_DIR").unwrap_or_default();
    if !swiftly_home_dir.is_empty() {
        return Some(swiftly_home_dir);
    }
    let home_dir = linux_env("HOME").unwrap_or_default();
    if !home_dir.is_empty() {
        let swiftly_path = format!("{}/.local/share/swiftly", home_dir);
        if std::path::Path::new(&swiftly_path).exists() {
            return Some(swiftly_path);
        }
    }

    None
}

async fn build_swift_internal(
    window: &Window,
    folder: &str,
    toolchain_path: &str,
    build_settings: BuildSettings,
    emit_exit_code: bool,
) -> Result<(PathBuf, ProjectConfig), String> {
    let config = match ProjectConfig::load(PathBuf::from(&folder), &toolchain_path) {
        Ok(config) => config,
        Err(e) => {
            return emit_error_and_return(&window, &format!("Failed to load project config: {}", e))
        }
    };
    let swift_bin = SwiftBin::new(&toolchain_path)?;
    let mut cmd = swift_bin.command();
    cmd.arg("build")
        .arg("-c")
        .arg(if build_settings.debug {
            "debug"
        } else {
            "release"
        })
        .arg("--swift-sdk")
        .arg("arm64-apple-ios")
        .current_dir(&folder);

    pipe_command(&mut cmd, &window, emit_exit_code).await?;

    match pack(PathBuf::from(&folder), &config, &build_settings) {
        Ok(app) => {
            window
                .emit("build-output", "Pack Success")
                .expect("failed to send output");
            Ok((app, config))
        }
        Err(e) => emit_error_and_return(&window, &format!("Failed to pack app: {}", e)),
    }
}

#[tauri::command]
pub async fn build_swift(
    window: tauri::Window,
    folder: String,
    toolchain_path: String,
    debug: bool,
) -> Result<(), String> {
    let build_settings = BuildSettings { debug };
    if !validate_toolchain(&toolchain_path) {
        return emit_error_and_return(&window, "Invalid Toolchain");
    }

    let (app, config) =
        build_swift_internal(&window, &folder, &toolchain_path, build_settings, true).await?;

    let ipa_path = zip_ipa(app, &config);
    if ipa_path.is_err() {
        return emit_error_and_return(
            &window,
            &format!("Failed to zip IPA: {}", ipa_path.err().unwrap()),
        );
    }
    let ipa_path = ipa_path.unwrap();

    window
        .emit(
            "build-output",
            format!("Build Success, output file at {}", ipa_path.display()),
        )
        .expect("failed to send output");

    Ok(())
}

#[tauri::command]
pub async fn clean_swift(
    window: tauri::Window,
    folder: String,
    toolchain_path: String,
) -> Result<(), String> {
    let swift_bin = SwiftBin::new(&toolchain_path)?;
    let mut cmd = swift_bin.command();
    cmd.arg("package").arg("clean").current_dir(folder);

    window
        .emit("build-output", "Cleaning...")
        .expect("failed to send output");

    pipe_command(&mut cmd, &window, true).await
}

#[tauri::command]
pub async fn deploy_swift(
    handle: tauri::AppHandle,
    window: tauri::Window,
    anisette_server: String,
    device: DeviceInfo,
    folder: String,
    toolchain_path: String,
    debug: bool,
) -> Result<(), String> {
    let build_settings = BuildSettings { debug };
    if !validate_toolchain(&toolchain_path) {
        return emit_error_and_return(&window, "Invalid Toolchain");
    }

    let (app, _) =
        build_swift_internal(&window, &folder, &toolchain_path, build_settings, false).await?;

    sideload_app(&handle, &window, anisette_server, device, app)
        .await
        .map_err(|e| format!("Failed to sideload app: {}", e))?;

    window
        .emit("build-output", "Build & Install Success")
        .expect("failed to send output");

    Ok(())
}

pub async fn pipe_command(
    cmd: &mut Command,
    window: &tauri::Window,
    emit_exit_code: bool,
) -> Result<(), String> {
    let name = "build-output";
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut command = match cmd.spawn() {
        Ok(cmd) => cmd,
        Err(_) => {
            return emit_error_and_return(&window, "Failed to spawn build command");
        }
    };

    let stdout = match command.stdout.take() {
        Some(out) => out,
        None => {
            return emit_error_and_return(&window, "Failed to get stdout");
        }
    };

    let stderr = match command.stderr.take() {
        Some(err) => err,
        None => {
            return emit_error_and_return(&window, "Failed to get stderr");
        }
    };

    let stdout_handle = spawn_output_thread(stdout, window.clone(), name.to_string());
    let stderr_handle = spawn_output_thread(stderr, window.clone(), name.to_string());

    stdout_handle.join().expect("stdout thread panicked");
    stderr_handle.join().expect("stderr thread panicked");

    let exit_status = match command.wait() {
        Ok(status) => status,
        Err(_) => {
            return emit_error_and_return(&window, "Failed to wait for command");
        }
    };

    let exit_code = exit_status.code().unwrap_or(1);

    if exit_code != 0 || emit_exit_code {
        window
            .emit(name, format!("command.done.{}", exit_code))
            .expect("failed to send output");
    }

    if exit_code != 0 {
        return Err(format!("Command exited with code {}", exit_code));
    }

    Ok(())
}

fn spawn_output_thread<R: std::io::Read + Send + 'static>(
    reader: R,
    window: tauri::Window,
    name: String,
) -> std::thread::JoinHandle<()> {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    window.emit(&name, line).expect("failed to send output");
                }
                Err(err) => {
                    window
                        .emit(&name, "command.done.999".to_string())
                        .expect("failed to send output");
                    eprintln!("Error reading output: {}", err);
                    return;
                }
            }
        }
    })
}
