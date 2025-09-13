use std::{
    collections::HashSet,
    fs::{self, read_link},
    io::ErrorKind,
    os::unix::fs::symlink,
    path::{Component, Path},
};

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

    if let Some(first) = components.first()
        && first == "."
    {
        components.remove(0);
    }
    if let Some(first) = components.first()
        && first.ends_with(".app")
    {
        components.remove(0);
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

pub fn copy_developer(
    src: &Path,
    dst: &Path,
    rel: &Path,
    crosses_devices: bool,
) -> Result<(), String> {
    let mut has_crossed_device = crosses_devices;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name();
        let rel_path = rel.join(&file_name);
        if !is_wanted(&rel_path) {
            continue;
        }
        let src_path = entry.path();

        let mut rel_components = rel_path.components();
        if let Some(c) = rel_components.next()
            && c.as_os_str() != "Contents"
        {
            rel_components = rel_path.components();
        }
        if let Some(c) = rel_components.next()
            && c.as_os_str() != "Developer"
        {
            rel_components = rel_path.components();
        }
        let dst_path = dst.join(rel_components.as_path());

        let metadata = fs::symlink_metadata(&src_path)
            .map_err(|e| format!("Failed to get metadata: {}", e))?;

        if metadata.file_type().is_symlink() {
            let target =
                read_link(&src_path).map_err(|e| format!("Failed to read symlink: {}", e))?;
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            symlink(&target, &dst_path).map_err(|e| format!("Failed to create symlink: {}", e))?;
        } else if metadata.is_dir() {
            fs::create_dir_all(&dst_path).map_err(|e| format!("Failed to create dir: {}", e))?;
            copy_developer(&src_path, dst, &rel_path, has_crossed_device)?;
        } else if metadata.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            if has_crossed_device {
                fs::copy(&src_path, &dst_path)
                    .map_err(|e| format!("Failed to copy file across devices: {}", e))?;
                continue;
            }
            match fs::rename(&src_path, &dst_path) {
                Ok(_) => {}
                Err(e) => {
                    if e.kind() == ErrorKind::CrossesDevices {
                        has_crossed_device = true;
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
