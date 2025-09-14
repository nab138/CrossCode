use std::path::PathBuf;

use idevice::{
    lockdown::LockdownClient,
    mobile_image_mounter::ImageMounter,
    provider::UsbmuxdProvider,
    usbmuxd::{UsbmuxdAddr, UsbmuxdConnection},
    IdeviceService,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Window};

const BUILD_MANIFEST_URL: &str =
    "https://github.com/doronz88/DeveloperDiskImage/raw/refs/heads/main/PersonalizedImages/Xcode_iOS_DDI_Personalized/BuildManifest.plist";
const PERSONALIZED_IMAGE_URL: &str =
    "https://github.com/doronz88/DeveloperDiskImage/raw/refs/heads/main/PersonalizedImages/Xcode_iOS_DDI_Personalized/Image.dmg";
const TRUST_CACHE_URL: &str = "https://github.com/doronz88/DeveloperDiskImage/raw/refs/heads/main/PersonalizedImages/Xcode_iOS_DDI_Personalized/Image.dmg.trustcache";

#[derive(Deserialize, Serialize, Clone)]
pub struct DeviceInfo {
    pub name: String,
    pub id: u32,
    pub uuid: String,
}

pub async fn list_devices() -> Result<Vec<DeviceInfo>, String> {
    let usbmuxd = UsbmuxdConnection::default().await;
    if usbmuxd.is_err() {
        eprintln!("Failed to connect to usbmuxd: {:?}", usbmuxd.err());
        return Err("Failed to connect to usbmuxd".to_string());
    }
    let mut usbmuxd = usbmuxd.unwrap();

    let devs = usbmuxd.get_devices().await.unwrap();
    if devs.is_empty() {
        return Ok(vec![]);
    }

    let device_info_futures: Vec<_> = devs
        .iter()
        .map(|d| async move {
            let provider = d.to_provider(UsbmuxdAddr::from_env_var().unwrap(), "crosscode");
            let device_uid = d.device_id;

            let mut lockdown_client = match LockdownClient::connect(&provider).await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("Unable to connect to lockdown: {e:?}");
                    return DeviceInfo {
                        name: String::from("Unknown Device"),
                        id: device_uid,
                        uuid: d.udid.clone(),
                    };
                }
            };

            let device_name = lockdown_client
                .get_value(Some("DeviceName"), None)
                .await
                .expect("Failed to get device name")
                .as_string()
                .expect("Failed to convert device name to string")
                .to_string();

            DeviceInfo {
                name: device_name,
                id: device_uid,
                uuid: d.udid.clone(),
            }
        })
        .collect();

    Ok(futures::future::join_all(device_info_futures).await)
}

pub async fn get_provider(device: &DeviceInfo) -> Result<UsbmuxdProvider, String> {
    let mut usbmuxd = UsbmuxdConnection::default()
        .await
        .map_err(|e| format!("Failed to connect to usbmuxd: {}", e))?;
    let device_info = usbmuxd
        .get_device(&device.uuid)
        .await
        .map_err(|e| format!("Failed to get device: {}", e))?;

    let provider = device_info.to_provider(UsbmuxdAddr::from_env_var().unwrap(), "crosscode");
    Ok(provider)
}

#[tauri::command]
pub async fn is_ddi_mounted(device: DeviceInfo) -> Result<bool, String> {
    let provider = get_provider(&device).await?;

    let mut mounter_client = ImageMounter::connect(&provider).await.map_err(|e| {
        format!(
            "Failed to connect to mobile image mounter on device {}: {}",
            device.name, e
        )
    })?;

    let devices = mounter_client.copy_devices().await.map_err(|e| {
        format!(
            "Failed to get mounted images on device {}: {}",
            device.name, e
        )
    })?;

    Ok(devices.len() > 0)
}

// https://github.com/jkcoxson/idevice/blob/master/tools/src/mounter.rs
#[tauri::command]
pub async fn mount_ddi(app: AppHandle, window: Window, device: DeviceInfo) -> Result<(), String> {
    let provider = get_provider(&device).await?;

    let mut mounter_client = ImageMounter::connect(&provider).await.map_err(|e| {
        format!(
            "Failed to connect to mobile image mounter on device {}: {}",
            device.name, e
        )
    })?;

    let mut lockdown_client = LockdownClient::connect(&provider)
        .await
        .map_err(|e| format!("Failed to connect to lockdown: {}", e))?;

    let product_version = lockdown_client
        .get_value(Some("ProductVersion"), None)
        .await
        .map_err(|e| format!("Failed to get product version: {}", e))?;

    let product_version = product_version
        .as_string()
        .ok_or("Unexpected value for ProductVersion")?;

    let product_version_num = product_version.split('.').collect::<Vec<&str>>()[0]
        .parse::<u8>()
        .map_err(|e| format!("Failed to parse product version: {}", e))?;

    if product_version_num < 17 {
        // make sure product version is x.x, trimming the final .x if it exists
        let product_version = if product_version.matches('.').count() > 1 {
            let mut parts = product_version.split('.').collect::<Vec<&str>>();
            parts.pop();
            parts.join(".")
        } else {
            product_version.to_string()
        };

        let (image, signature) = download_ddi(&app, &product_version).await?;

        let image = tokio::fs::read(image)
            .await
            .map_err(|e| format!("Unable to read image: {}", e))?;
        let signature = tokio::fs::read(signature)
            .await
            .map_err(|e| format!("Unable to read signature: {}", e))?;

        mounter_client
            .mount_developer(&image, signature)
            .await
            .map_err(|e| format!("Unable to mount: {}", e))?;
    } else {
        let (manifest, trust_cache, image) = download_personalized_image(&app).await?;

        let image = tokio::fs::read(image)
            .await
            .map_err(|e| format!("Unable to read image: {}", e))?;

        let build_manifest = &tokio::fs::read(manifest)
            .await
            .map_err(|e| format!("Unable to read build manifest: {}", e))?;

        let trust_cache = tokio::fs::read(trust_cache)
            .await
            .map_err(|e| format!("Unable to read trust cache: {}", e))?;

        let unique_chip_id = lockdown_client
            .get_value(Some("UniqueChipID"), None)
            .await
            .map_err(|e| format!("Failed to get UniqueChipID: {}", e))?
            .as_unsigned_integer()
            .ok_or("Unexpected value for UniqueChipID")?;

        mounter_client
            .mount_personalized_with_callback(
                &provider,
                image,
                trust_cache,
                build_manifest,
                None,
                unique_chip_id,
                async |((n, d), _)| {
                    let percent = (n as f64 / d as f64) * 100.0;
                    window
                        .emit("ddi-mount-progress", percent)
                        .unwrap_or_else(|e| {
                            eprintln!("Failed to emit ddi-mount-progress: {}", e);
                        });
                },
                (),
            )
            .await
            .map_err(|e| format!("Unable to mount image: {}", e))?;
    }

    Ok(())
}

pub async fn download_ddi(
    app: &AppHandle,
    product_version: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let ddi_path = config_dir.join("DDI");

    let image_path = ddi_path.join("DeveloperDiskImage.dmg");
    let sig_path = ddi_path.join("DeveloperDiskImage.dmg.signature");

    if !ddi_path.exists() {
        tokio::fs::create_dir_all(&ddi_path)
            .await
            .map_err(|e| format!("Failed to create DDI directory: {}", e))?;
    }

    let mut download_futures = vec![];
    if !image_path.exists() {
        let url = format!(
        "https://github.com/doronz88/DeveloperDiskImage/raw/refs/heads/main/DeveloperDiskImages/{}/DeveloperDiskImage.dmg",
        product_version
    );
        download_futures.push(download(url, &image_path));
    }
    if !sig_path.exists() {
        let url = format!(
        "https://github.com/doronz88/DeveloperDiskImage/raw/refs/heads/main/DeveloperDiskImages/{}/DeveloperDiskImage.dmg.signature",
        product_version
    );
        download_futures.push(download(url, &sig_path));
    }

    futures::future::join_all(download_futures).await;

    return Ok((image_path, sig_path));
}

pub async fn download_personalized_image(
    app: &AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let ddi_path = config_dir.join("DDI");

    let build_manifest_path = ddi_path.join("BuildManifest.plist");
    let trust_cache_path = ddi_path.join("Image.dmg.trustcache");
    let image_path = ddi_path.join("Image.dmg");

    if !ddi_path.exists() {
        tokio::fs::create_dir_all(&ddi_path)
            .await
            .map_err(|e| format!("Failed to create DDI directory: {}", e))?;
    }

    let mut download_futures = vec![];
    if !build_manifest_path.exists() {
        download_futures.push(download(BUILD_MANIFEST_URL, &build_manifest_path));
    }
    if !trust_cache_path.exists() {
        download_futures.push(download(TRUST_CACHE_URL, &trust_cache_path));
    }
    if !image_path.exists() {
        download_futures.push(download(PERSONALIZED_IMAGE_URL, &image_path));
    }
    futures::future::join_all(download_futures).await;

    return Ok((build_manifest_path, trust_cache_path, image_path));
}

pub async fn download(url: impl AsRef<str>, dest: &PathBuf) -> Result<(), String> {
    let response = reqwest::get(url.as_ref())
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download file: HTTP {}",
            response.status()
        ));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
