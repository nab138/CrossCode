// Reference: https://github.com/xtool-org/xtool/blob/main/Sources/XToolSupport/SDKBuilder.swift
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use tauri::Window;

use crate::builder::crossplatform::{
    linux_path, linux_temp_dir, read_link, remove_dir_all, symlink,
};
use crate::builder::swift::{validate_toolchain, SwiftBin};
use crate::operation::Operation;

#[cfg(target_os = "windows")]
use crate::windows::windows_to_wsl_path;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const DARWIN_TOOLS_VERSION: &str = "1.0.1";

#[tauri::command]
pub async fn install_sdk_operation(
    window: Window,
    xcode_path: String,
    toolchain_path: String,
    is_dir: bool,
) -> Result<(), String> {
    let op = Operation::new("install_sdk".to_string(), &window);
    op.start("create_stage")?;
    let work_dir = op
        .fail_if_err("create_stage", linux_temp_dir())?
        .join("DarwinSDKBuild");
    let res = install_sdk_internal(xcode_path, toolchain_path, work_dir.clone(), is_dir, &op).await;
    op.start("cleanup")?;
    let cleanup_result = if work_dir.exists() {
        remove_dir_all(&work_dir)
    } else {
        Ok(())
    };

    let cleanup_result_for_match = cleanup_result
        .as_ref()
        .map(|_| ())
        .map_err(|e| format!("{}", e));

    let cleanup_result = op.fail_if_err_map("cleanup", cleanup_result, |e| {
        format!("Failed to remove temp dir: {}", e)
    });

    if cleanup_result.is_ok() {
        op.complete("cleanup")?;
    }

    match (res, cleanup_result_for_match) {
        (Err(main_err), Err(cleanup_err)) => Err(format!(
            "{main_err} (additionally, failed to clean up temp dir: {cleanup_err})"
        )),
        (Err(main_err), _) => Err(main_err),
        (Ok(_), Err(cleanup_err)) => Err(format!(
            "Install succeeded, but failed to clean up temp dir: {cleanup_err}"
        )),
        (Ok(val), Ok(_)) => Ok(val),
    }
}
async fn install_sdk_internal(
    xcode_path: String,
    toolchain_path: String,
    work_dir: PathBuf,
    is_dir: bool,
    op: &Operation<'_>,
) -> Result<(), String> {
    if xcode_path.is_empty() || (!xcode_path.ends_with(".xip") && !is_dir) {
        return op.fail("create_stage", "Xcode not found".to_string());
    }
    if toolchain_path.is_empty() {
        return op.fail("create_stage", "Toolchain not found".to_string());
    }
    if !validate_toolchain(&toolchain_path) {
        return op.fail("create_stage", "Invalid toolchain path".to_string());
    }

    let swift_bin = SwiftBin::new(&toolchain_path);
    if swift_bin.is_err() {
        return op.fail("create_stage", "Invalid toolchain path".to_string());
    }
    let swift_bin = swift_bin.unwrap();
    let output = swift_bin.output(&["sdk", "remove", "darwin"]);
    if let Ok(output) = output {
        if !output.status.success() && output.status.code() != Some(1) {
            return op.fail(
                "create_stage",
                format!(
                    "Failed to remove existing darwin SDK: {}",
                    String::from_utf8_lossy(&output.stderr)
                ),
            );
        }
    }

    let output_dir = work_dir.join("darwin.artifactbundle");
    if output_dir.exists() {
        op.fail_if_err_map("create_stage", remove_dir_all(&output_dir), |e| {
            format!("Failed to remove existing output directory: {}", e)
        })?;
    }
    op.fail_if_err_map("create_stage", fs::create_dir_all(&output_dir), |e| {
        format!("Failed to create output directory: {}", e)
    })?;

    op.move_on("create_stage", "install_toolset")?;
    op.fail_if_err("install_toolset", install_toolset(&output_dir).await)?;
    op.complete("install_toolset")?;
    let dev = install_developer(&output_dir, &xcode_path, is_dir, op).await?;
    op.start("write_metadata")?;

    let iphone_os_sdk = sdk(&dev, "iPhoneOS")?;
    let mac_os_sdk = sdk(&dev, "MacOSX")?;
    let iphone_simulator_sdk = sdk(&dev, "iPhoneSimulator")?;

    let info = "{
    \"schemaVersion\": \"1.0\",
    \"artifacts\": {
        \"darwin\": {
            \"type\": \"swiftSDK\",
            \"version\": \"0.0.1\",
            \"variants\": [
                {
                    \"path\": \".\",
                    \"supportedTriples\": [\"aarch64-unknown-linux-gnu\", \"x86_64-unknown-linux-gnu\"]
                }
            ]
        }
    }
}";
    op.fail_if_err_map(
        "write_metadata",
        fs::write(output_dir.join("info.json"), info),
        |e| format!("Failed to write info.json: {}", e),
    )?;

    let toolset = "{
    \"schemaVersion\": \"1.0\",
    \"rootPath\": \"toolset/bin\",
    \"linker\": {
        \"path\": \"ld64.lld\"
    },
    \"swiftCompiler\": {
        \"extraCLIOptions\": [
            \"-use-ld=lld\"
        ]
    }
}";
    op.fail_if_err_map(
        "write_metadata",
        fs::write(output_dir.join("toolset.json"), toolset),
        |e| format!("Failed to write toolset.json: {}", e),
    )?;

    let sdk_def = SDKDefinition {
        schema_version: "4.0".to_string(),
        target_triples: HashMap::from([
            (
                "arm64-apple-ios".to_string(),
                Triple::from_sdk("iPhoneOS", &iphone_os_sdk),
            ),
            (
                "arm64-apple-ios-simulator".to_string(),
                Triple::from_sdk("iPhoneSimulator", &iphone_simulator_sdk),
            ),
            (
                "x86_64-apple-ios-simulator".to_string(),
                Triple::from_sdk("iPhoneSimulator", &iphone_simulator_sdk),
            ),
            (
                "arm64-apple-macos".to_string(),
                Triple::from_sdk("MacOSX", &mac_os_sdk),
            ),
            (
                "x86_64-apple-macos".to_string(),
                Triple::from_sdk("MacOSX", &mac_os_sdk),
            ),
        ]),
    };

    let sdk_def_path = output_dir.join("swift-sdk.json");
    op.fail_if_err_map(
        "write_metadata",
        fs::write(
            sdk_def_path,
            op.fail_if_err_map(
                "write_metadata",
                serde_json::to_string_pretty(&sdk_def),
                |e| format!("Failed to serialize SDKDefinition: {}", e),
            )?,
        ),
        |e| format!("Failed to write swift-sdk.json: {}", e),
    )?;

    let sdk_version_path = output_dir.join("darwin-sdk-version.txt");
    op.fail_if_err_map(
        "write_metadata",
        fs::write(&sdk_version_path, "develop"),
        |e| format!("Failed to write darwin-sdk-version.txt: {}", e),
    )?;
    op.move_on("write_metadata", "install_sdk")?;

    let real_output_dir =
        op.fail_if_err("install_sdk", linux_path(&output_dir.to_string_lossy()))?;
    let output = op.fail_if_err_map(
        "install_sdk",
        swift_bin.output(&["sdk", "install", &real_output_dir]),
        |e| format!("Failed to execute swift command: {}", e),
    )?;

    if !output.status.success() {
        return op.fail(
            "install_sdk",
            format!(
                "Swift command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ),
        );
    }
    op.complete("install_sdk")?;

    Ok(())
}

fn sdk(dev: &PathBuf, platform: &str) -> Result<String, String> {
    let dir = dev.join(format!("Platforms/{}.platform/Developer/SDKs", platform));
    let regex = Regex::new(&format!(r"^{}\d+\.\d+\.sdk$", regex::escape(platform)))
        .map_err(|e| format!("Invalid regex: {}", e))?;

    let entries =
        fs::read_dir(&dir).map_err(|e| format!("Failed to read SDKs directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if regex.is_match(&name_str) {
            return Ok(name_str.into_owned());
        }
    }

    Err(format!("Could not find SDK for {}/{}", platform, platform))
}

async fn install_toolset(output_path: &PathBuf) -> Result<(), String> {
    let toolset_dir = output_path.join("toolset");
    fs::create_dir_all(&toolset_dir)
        .map_err(|e| format!("Failed to create toolset directory: {}", e))?;

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        return Err("Unsupported architecture".to_string());
    };
    let toolset_url = format!(
        "https://github.com/xtool-org/darwin-tools-linux-llvm/releases/download/v{}/toolset-{}.tar.gz",
        DARWIN_TOOLS_VERSION, arch
    );

    let response = reqwest::get(&toolset_url)
        .await
        .map_err(|e| format!("Failed to download toolset: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("Failed to download toolset: {}", response.status()));
    }
    let tar_gz = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(&*tar_gz));
    archive
        .unpack(&toolset_dir)
        .map_err(|e| format!("Failed to extract toolset: {}", e))?;
    #[cfg(target_os = "windows")]
    {
        // I'm guessing this has to be done because I'm extracting the tar from windows into the wsl file system and windows doesn't play nice with permissions, but im too lazy to do this properly
        let wsl_toolset_path =
            windows_to_wsl_path(&toolset_dir.join("bin").to_string_lossy().to_string())?;
        let output = Command::new("wsl")
            .arg("chmod")
            .arg("+x")
            .arg(format!("{}/*", wsl_toolset_path))
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to run chmod: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "Failed to set executable permissions: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }
    Ok(())
}

async fn install_developer(
    output_path: &PathBuf,
    xcode_path: &str,
    is_dir: bool,
    op: &Operation<'_>,
) -> Result<PathBuf, String> {
    op.start("extract_xip")?;

    let dev_stage = output_path.join("DeveloperStage");
    let mut app_path = PathBuf::from(xcode_path);
    if !is_dir {
        op.fail_if_err_map("extract_xip", fs::create_dir_all(&dev_stage), |e| {
            format!("Failed to create DeveloperStage directory: {}", e)
        })?;

        #[cfg(target_os = "windows")]
        panic!("Not implemented on windows");

        #[cfg(not(target_os = "windows"))]
        {
            let mut file = fs::File::open(xcode_path)
                .map_err(|e| format!("Failed to open xip file: {}", e))?;
            unxip_rs::unxip(&mut file, &dev_stage)
                .map_err(|e| format!("Failed to extract xip file: {}", e))?;
        }

        let app_dirs = op
            .fail_if_err_map("extract_xip", fs::read_dir(&dev_stage), |e| {
                format!("Failed to read DeveloperStage directory: {}", e)
            })?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "app"))
            .collect::<Vec<_>>();
        if app_dirs.len() != 1 {
            return op.fail(
                "extract_xip",
                format!(
                    "Expected one .app in DeveloperStage, found {}",
                    app_dirs.len()
                ),
            );
        }

        app_path = app_dirs[0].path();
    }

    op.move_on("extract_xip", "copy_files")?;
    let dev = output_path.join("Developer");
    op.fail_if_err_map("copy_files", fs::create_dir_all(&dev), |e| {
        format!("Failed to create Developer directory: {}", e)
    })?;

    let contents_developer = app_path.join("Contents").join("Developer");
    if !contents_developer.exists() {
        return op.fail(
            "copy_files",
            "Contents/Developer not found in .app".to_string(),
        );
    }

    op.fail_if_err(
        "copy_files",
        copy_developer(&contents_developer, &dev, Path::new("Contents/Developer")),
    )?;
    if dev_stage.exists() {
        op.fail_if_err_map("copy_files", remove_dir_all(&dev_stage), |e| {
            format!("Failed to remove DeveloperStage directory: {}", e)
        })?;
    }

    for platform in ["iPhoneOS", "MacOSX", "iPhoneSimulator"] {
        let lib = "../../../../../Library";
        let dest = dev.join(format!(
            "Platforms/{}.platform/Developer/SDKs/{}.sdk/System/Library/Frameworks",
            platform, platform
        ));

        let links = [
            (
                "Testing.framework",
                format!("{}/Frameworks/Testing.framework", lib),
            ),
            (
                "XCTest.framework",
                format!("{}/Frameworks/XCTest.framework", lib),
            ),
            (
                "XCUIAutomation.framework",
                format!("{}/Frameworks/XCUIAutomation.framework", lib),
            ),
            (
                "XCTestCore.framework",
                format!("{}/PrivateFrameworks/XCTestCore.framework", lib),
            ),
        ];

        for (name, target) in &links {
            let link_path = dest.join(name);
            op.fail_if_err_map(
                "copy_files",
                symlink(target, &link_path.to_string_lossy().to_string()),
                |e| {
                    format!(
                        "Failed to create symlink {:?} -> {:?}: {}",
                        link_path, target, e
                    )
                },
            )?;
        }
    }

    op.complete("copy_files")?;

    Ok(dev)
}

fn copy_developer(src: &Path, dst: &Path, rel: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name();
        let rel_path = rel.join(&file_name);
        if !is_wanted(&rel_path) {
            continue;
        }
        let src_path = entry.path();

        let mut rel_components = rel_path.components();
        if let Some(c) = rel_components.next() {
            if c.as_os_str() != "Contents" {
                rel_components = rel_path.components();
            }
        }
        if let Some(c) = rel_components.next() {
            if c.as_os_str() != "Developer" {
                rel_components = rel_path.components();
            }
        }
        let dst_path = dst.join(rel_components.as_path());

        let metadata = fs::symlink_metadata(&src_path)
            .map_err(|e| format!("Failed to get metadata: {}", e))?;

        if metadata.file_type().is_symlink() {
            let target = read_link(&src_path)?;
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            symlink(
                &target.to_string_lossy().to_string(),
                &dst_path.to_string_lossy().to_string(),
            )
            .map_err(|e| format!("Failed to create symlink: {}", e))?;
        } else if metadata.is_dir() {
            fs::create_dir_all(&dst_path).map_err(|e| format!("Failed to create dir: {}", e))?;
            copy_developer(&src_path, dst, &rel_path)?;
        } else if metadata.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            match fs::rename(&src_path, &dst_path) {
                Ok(_) => {}
                Err(e) => {
                    if e.kind() == ErrorKind::CrossesDevices {
                        fs::copy(&src_path, &dst_path)
                            .map_err(|e2| format!("Failed to copy file across devices: {}", e2))?;
                    } else {
                        return Err(format!("Failed to move file: {}", e));
                    }
                }
            }
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Triple {
    sdk_root_path: String,
    include_search_paths: Vec<String>,
    library_search_paths: Vec<String>,
    swift_resources_path: String,
    swift_static_resources_path: String,
    toolset_paths: Vec<String>,
}

impl Triple {
    fn from_sdk(platform: &str, sdk: &str) -> Self {
        Triple {
            sdk_root_path: format!(
                "Developer/Platforms/{}.platform/Developer/SDKs/{}",
                platform, sdk
            ),
            include_search_paths: vec![format!(
                "Developer/Platforms/{}.platform/Developer/usr/lib",
                platform
            )],
            library_search_paths: vec![format!(
                "Developer/Platforms/{}.platform/Developer/usr/lib",
                platform
            )],
            swift_resources_path: format!(
                "Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift"
            ),
            swift_static_resources_path: format!(
                "Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift_static"
            ),
            toolset_paths: vec![format!("toolset.json")],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SDKDefinition {
    schema_version: String,
    target_triples: HashMap<String, Triple>,
}

#[derive(Debug, Clone)]
struct SDKEntry {
    names: HashSet<String>,
    values: Vec<SDKEntry>,
}

impl SDKEntry {
    // empty = wildcard
    fn new(names: HashSet<String>, values: Vec<SDKEntry>) -> Self {
        SDKEntry { names, values }
    }

    fn from_name(name: &str, values: Vec<SDKEntry>) -> Self {
        let mut set = HashSet::new();
        set.insert(name.to_string());
        SDKEntry::new(set, values)
    }

    fn matches<'a, I>(&self, path: I) -> bool
    where
        I: Iterator<Item = &'a str> + Clone,
    {
        let mut path_clone = path.clone();
        let first = path_clone.next();
        if first.is_none() {
            return true;
        }
        let first = first.unwrap();
        if !self.names.is_empty() && !self.names.contains(first) {
            return false;
        }
        if self.values.is_empty() {
            return true;
        }
        let after_name = path_clone;
        for value in &self.values {
            if value.matches(after_name.clone()) {
                return true;
            }
        }
        false
    }

    fn e(name: Option<&str>, values: Vec<SDKEntry>) -> SDKEntry {
        if let Some(name) = name {
            let parts: Vec<&str> = name.split('/').collect();
            let mut entry = SDKEntry::from_name(parts.last().unwrap(), values);
            for part in parts.iter().rev().skip(1) {
                entry = SDKEntry::from_name(part, vec![entry]);
            }
            entry
        } else {
            SDKEntry::new(HashSet::new(), values)
        }
    }
}

// Build the wanted tree
fn wanted_sdk_entry() -> SDKEntry {
    SDKEntry::e(
        Some("Contents/Developer"),
        vec![
            SDKEntry::e(
                Some("Toolchains/XcodeDefault.xctoolchain/usr/lib"),
                vec![
                    SDKEntry::e(Some("swift"), vec![]),
                    SDKEntry::e(Some("swift_static"), vec![]),
                    SDKEntry::e(Some("clang"), vec![]),
                ],
            ),
            SDKEntry::e(
                Some("Platforms"),
                ["iPhoneOS", "MacOSX", "iPhoneSimulator"]
                    .iter()
                    .map(|plat| {
                        SDKEntry::e(
                            Some(&format!("{}.platform/Developer", plat)),
                            vec![
                                SDKEntry::e(Some("SDKs"), vec![]),
                                SDKEntry::e(
                                    Some("Library"),
                                    vec![
                                        SDKEntry::e(Some("Frameworks"), vec![]),
                                        SDKEntry::e(Some("PrivateFrameworks"), vec![]),
                                    ],
                                ),
                                SDKEntry::e(Some("usr/lib"), vec![]),
                            ],
                        )
                    })
                    .collect(),
            ),
        ],
    )
}

fn is_wanted(path: &Path) -> bool {
    let mut components: Vec<String> = path
        .components()
        .filter_map(|c| match c {
            Component::Normal(os) => Some(os.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();

    if let Some(first) = components.first() {
        if first == "." {
            components.remove(0);
        }
    }
    if let Some(first) = components.first() {
        if first.ends_with(".app") {
            components.remove(0);
        }
    }

    if !wanted_sdk_entry().matches(components.iter().map(|s| s.as_str())) {
        return false;
    }

    if components.len() >= 10
        && components[9] == "prebuilt-modules"
        && components.starts_with(
            &[
                "Contents",
                "Developer",
                "Toolchains",
                "XcodeDefault.xctoolchain",
                "usr",
                "lib",
                "swift",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>(),
        )
    {
        return false;
    }

    true
}
