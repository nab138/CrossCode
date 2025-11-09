use std::{path::PathBuf, sync::Arc};

use crate::sideloader::device::{get_provider, list_devices, DeviceInfo};
use isideload::{sideload, Error, SideloadConfiguration, SideloadLogger};
use tauri::{Emitter, Manager, Window};

pub struct TauriLogger {
    window: Arc<Window>,
}

impl SideloadLogger for TauriLogger {
    fn log(&self, message: &str) {
        self.window.emit("build-output", message.to_string()).ok();
    }

    fn error(&self, error: &Error) {
        self.window
            .emit("build-output", format!("Error: {}", error))
            .ok();
    }
}

pub async fn sideload_app(
    handle: &tauri::AppHandle,
    window: &tauri::Window,
    anisette_server: String,
    device: DeviceInfo,
    app_path: PathBuf,
) -> Result<(), String> {
    let dev_session =
        crate::sideloader::apple::get_developer_session(&handle, &window, anisette_server.clone())
            .await?;
    let logger = TauriLogger {
        window: Arc::new(window.clone()),
    };
    let store_dir = handle.path().app_config_dir().map_err(|e| e.to_string())?;

    let config = SideloadConfiguration::new()
        .set_store_dir(store_dir.clone())
        .set_logger(&logger)
        .set_machine_name("CrossCode".to_string());

    let provider = get_provider(&device).await?;
    sideload::sideload_app(&provider, &dev_session, app_path, config)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn refresh_idevice(window: tauri::Window) {
    match list_devices().await {
        Ok(devices) => {
            window
                .emit("idevices", devices)
                .expect("Failed to send devices");
        }
        Err(e) => {
            window
                .emit("idevices", Vec::<DeviceInfo>::new())
                .expect("Failed to send error");
            eprintln!("Failed to list devices: {}", e);
        }
    };
}
