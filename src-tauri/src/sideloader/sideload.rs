use std::{path::PathBuf, sync::Arc};

use crate::sideloader::device::{list_devices, DeviceInfo};
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};
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
    let mut usbmuxd = UsbmuxdConnection::default()
        .await
        .map_err(|e| format!("Failed to connect to usbmuxd: {}", e))?;
    let device = usbmuxd
        .get_device(&device.uuid)
        .await
        .map_err(|e| format!("Failed to get device: {}", e))?;

    let config = SideloadConfiguration::new()
        .set_store_dir(store_dir.clone())
        .set_logger(Box::new(logger))
        .set_machine_name("YCode".to_string());

    let provider = device.to_provider(UsbmuxdAddr::from_env_var().unwrap(), "y-code");
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
