use std::{fs, path::Path};

use image::{ImageFormat, ImageReader};

const ICON_FILES: &[(&str, u32)] = &[
    ("AppIcon29x29.png", 29),
    ("AppIcon29x29@2x.png", 58),
    ("AppIcon29x29@3x.png", 87),
    ("AppIcon40x40.png", 40),
    ("AppIcon40x40@2x.png", 80),
    ("AppIcon40x40@3x.png", 120),
    ("AppIcon50x50.png", 50),
    ("AppIcon50x50@2x.png", 100),
    ("AppIcon57x57.png", 57),
    ("AppIcon57x57@2x.png", 114),
    ("AppIcon57x57@3x.png", 171),
    ("AppIcon60x60.png", 60),
    ("AppIcon60x60@2x.png", 120),
    ("AppIcon60x60@3x.png", 180),
    ("AppIcon72x72.png", 72),
    ("AppIcon72x72@2x.png", 144),
    ("AppIcon76x76.png", 76),
    ("AppIcon76x76@2x.png", 152),
];

#[tauri::command]
pub async fn import_icon(project_path: String, icon_path: String) -> Result<(), String> {
    let img = ImageReader::open(icon_path)
        .map_err(|e| format!("Failed to open icon image: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode icon image: {}", e))?;

    let icon_dir = Path::new(&project_path).join("Resources");
    fs::create_dir_all(&icon_dir).map_err(|e| format!("Failed to create icon directory: {}", e))?;

    for (file_name, size) in ICON_FILES {
        let resized = img.resize(*size, *size, image::imageops::FilterType::CatmullRom);
        let output_path = icon_dir.join(file_name);
        resized
            .save_with_format(&output_path, ImageFormat::Png)
            .map_err(|e| format!("Failed to save icon image: {}", e))?;
    }

    Ok(())
}
