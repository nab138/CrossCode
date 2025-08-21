use std::{
    fs::{self, File},
    io::prelude::*,
    path::PathBuf,
};

use dircpy::CopyBuilder;
use zip::write::SimpleFileOptions;

use crate::builder::config::{BuildSettings, ProjectConfig};

pub fn pack(
    project_path: PathBuf,
    config: &ProjectConfig,
    build_settings: &BuildSettings,
) -> Result<PathBuf, String> {
    let workdir = project_path.join(".crosscode").join("Payload");
    if !workdir.exists() {
        std::fs::create_dir_all(&workdir)
            .map_err(|e| format!("Failed to create work directory: {}", e))?;
    }
    let app_path = workdir.join(format!("{}.app", config.product));
    if app_path.exists() {
        std::fs::remove_dir_all(&app_path)
            .map_err(|e| format!("Failed to remove existing app directory: {}", e))?;
    }
    std::fs::create_dir_all(&app_path)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;

    let exec = project_path
        .join(".build")
        .join("arm64-apple-ios")
        .join(if build_settings.debug {
            "debug"
        } else {
            "release"
        })
        .join(&config.product);

    if !exec.exists() {
        return Err(format!("Executable not found at: {}", exec.display()));
    }

    fs::copy(exec, app_path.join(&config.product))
        .map_err(|e| format!("Failed to copy executable: {}", e))?;

    // TODO: Create default Info.plist if it doesn't exist
    let info_plist = project_path.join("Info.plist");
    if !info_plist.exists() {
        return Err(format!("Info.plist not found at: {}", info_plist.display()));
    }

    let info_content = fs::read_to_string(&info_plist)
        .map_err(|e| format!("Failed to read Info.plist: {}", e))?
        .replace("[[bundle_id]]", &config.bundle_id)
        .replace("[[product]]", &config.product)
        .replace("[[version_num]]", &config.version_num)
        .replace("[[version_string]]", &config.version_string);
    fs::write(&app_path.join("Info.plist"), info_content)
        .map_err(|e| format!("Failed to write Info.plist: {}", e))?;

    let resources = project_path.join("Resources");

    if !resources.exists() {
        std::fs::create_dir_all(&resources)
            .map_err(|e| format!("Failed to create Resources directory: {}", e))?;
    }

    CopyBuilder::new(&resources, &app_path)
        .run()
        .map_err(|e| format!("Failed to copy resources: {}", e))?;

    Ok(app_path)
}

pub fn zip_ipa(app: PathBuf, config: &ProjectConfig) -> Result<PathBuf, String> {
    let payload = app.parent().unwrap_or(&PathBuf::from(".")).to_path_buf();

    if !payload.exists() || !payload.is_dir() {
        return Err(format!(
            "Payload directory does not exist: {}",
            payload.display()
        ));
    }

    let ipa_path = payload
        .parent()
        .unwrap()
        .join(format!("{}.ipa", config.product));
    let zip_file = File::create(&ipa_path)
        .map_err(|e| format!("Failed to create zip file in payload directory: {}", e))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);
    let walkdir = walkdir::WalkDir::new(&payload)
        .into_iter()
        .filter_map(|e| e.ok());

    let prefix = payload.as_path().parent().ok_or(format!(
        "Failed to get parent directory of payload: {}",
        payload.display()
    ))?;

    // https://github.com/zip-rs/zip2/blob/6c78fe381da074610d99e2d59546b0530bcb6e54/examples/write_dir.rs
    let mut buffer = Vec::new();
    for entry in walkdir {
        let path = entry.path();
        let name = path
            .strip_prefix(prefix)
            .map_err(|e| format!("Failed to strip prefix from path: {}", e))?;
        let path_as_string = name
            .to_str()
            .map(str::to_owned)
            .ok_or_else(|| format!("Failed to convert path to string: {}", path.display()))?;

        // Write file or directory explicitly
        // Some unzip tools unzip files with directory paths correctly, some do not!
        if path.is_file() {
            zip.start_file(path_as_string, options)
                .map_err(|e| format!("Failed to start file {}: {}", path.display(), e))?;
            let mut f = File::open(path)
                .map_err(|e| format!("Failed to open file {}: {}", path.display(), e))?;

            f.read_to_end(&mut buffer)
                .map_err(|e| format!("Failed to read file {}: {}", path.display(), e))?;
            zip.write_all(&buffer)
                .map_err(|e| format!("Failed to write file {}: {}", path.display(), e))?;
            buffer.clear();
        } else if !name.as_os_str().is_empty() {
            // Only if not root! Avoids path spec / warning
            // and mapname conversion failed error on unzip
            zip.add_directory(path_as_string, options)
                .map_err(|e| format!("Failed to add directory {}: {}", path.display(), e))?;
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finish zip file: {}", e))?;
    Ok(ipa_path)
}
