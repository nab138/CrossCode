use idevice::{
    core_device_proxy::CoreDeviceProxy,
    dvt::{remote_server::RemoteServerClient, screenshot::ScreenshotClient},
    rsd::RsdHandshake,
    IdeviceService,
};

use crate::sideloader::device::{get_provider, DeviceInfo};

#[tauri::command]
pub async fn take_screenshot(device: DeviceInfo) -> Result<Vec<u8>, String> {
    let provider = get_provider(&device).await?;

    let proxy = CoreDeviceProxy::connect(&provider)
        .await
        .map_err(|e| format!("Failed to connect to device proxy: {}", e))?;
    let rsd_port = proxy.handshake.server_rsd_port;

    let adapter = proxy
        .create_software_tunnel()
        .map_err(|e| format!("Failed to create software tunnel: {}", e))?;
    let mut adapter = adapter.to_async_handle();

    let rsd_stream = adapter
        .connect(rsd_port)
        .await
        .map_err(|e| format!("Failed to connect to RSD: {}", e))?;

    let handshake = RsdHandshake::new(rsd_stream)
        .await
        .map_err(|e| format!("Failed to create RSD handshake: {}", e))?;

    let instruments_service = handshake
        .services
        .get("com.apple.instruments.dtservicehub")
        .ok_or("Instruments service not found")?;

    let ts_client_stream = adapter
        .connect(instruments_service.port)
        .await
        .map_err(|e| format!("Failed to connect to remote server: {}", e))?;
    let mut ts_client = RemoteServerClient::new(ts_client_stream);
    ts_client
        .read_message(0)
        .await
        .map_err(|e| format!("Failed to read message: {}", e))?;
    let mut sc = ScreenshotClient::new(&mut ts_client)
        .await
        .map_err(|e| format!("Failed to create screenshot client: {}", e))?;

    let screenshot_data = sc
        .take_screenshot()
        .await
        .map_err(|e| format!("Failed to take screenshot: {}", e))?;

    Ok(screenshot_data)
}
