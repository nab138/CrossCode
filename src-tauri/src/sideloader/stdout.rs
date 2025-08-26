use crate::{
    builder::config::TomlConfig,
    sideloader::{apple::get_developer_session, device::DeviceInfo},
};
use idevice::{
    core_device::{AppServiceClient, OpenStdioSocketClient},
    core_device_proxy::CoreDeviceProxy,
    rsd::RsdHandshake,
    usbmuxd::{UsbmuxdAddr, UsbmuxdConnection},
    IdeviceService, RsdService,
};
use std::{path::PathBuf, sync::Arc};
use tauri::{AppHandle, Emitter, State, Window};
use tokio::{io::AsyncReadExt, sync::Mutex};
use tokio_util::sync::CancellationToken;

pub type StdoutStream = Arc<Mutex<Option<CancellationToken>>>;

#[tauri::command]
pub async fn start_stream_stdout(
    handle: AppHandle,
    window: Window,
    device: DeviceInfo,
    stream: State<'_, StdoutStream>,
    folder: String,
    anisette_server: String,
) -> Result<(), String> {
    let bundle_id = get_bundle_id(&handle, &window, anisette_server, folder).await?;

    let mut stream_guard = stream.lock().await;
    if let Some(token) = stream_guard.take() {
        token.cancel();
    }

    let mut usbmuxd = UsbmuxdConnection::default()
        .await
        .map_err(|e| format!("Failed to connect to usbmuxd: {}", e))?;
    let device_info = usbmuxd
        .get_device(&device.uuid)
        .await
        .map_err(|e| format!("Failed to get device: {}", e))?;

    let provider = device_info.to_provider(UsbmuxdAddr::from_env_var().unwrap(), "crosscode");

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

    let mut handshake = RsdHandshake::new(rsd_stream)
        .await
        .map_err(|e| format!("Failed to create RSD handshake: {}", e))?;

    let mut stdio_conn = OpenStdioSocketClient::connect_rsd(&mut adapter, &mut handshake)
        .await
        .map_err(|e| format!("Failed to connect to stdio: {}", e))?;

    let stdio_uuid = stdio_conn
        .read_uuid()
        .await
        .map_err(|e| format!("Failed to read stdio UUID: {}", e))?;

    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel();

    let mut adapter_for_launch = adapter;
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(async {
            let mut asc: AppServiceClient<Box<dyn idevice::ReadWrite>> =
                AppServiceClient::connect_rsd(&mut adapter_for_launch, &mut handshake)
                    .await
                    .map_err(|e| format!("Failed to connect to app service: {}", e))?;
            asc.launch_application(bundle_id, &[], true, false, None, None, Some(stdio_uuid))
                .await
                .map_err(|e| format!("Failed to launch application: {}", e))
        });
        let _ = tx.send(result);
    });

    rx.await.map_err(|_| "Launch thread failed".to_string())??;

    let cancellation_token = CancellationToken::new();

    *stream_guard = Some(cancellation_token.clone());

    let stream_clone = stream.inner().clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancellation_token.cancelled() => {
                    println!("Stdout stream cancelled");
                    break;
                }
                result = async {
                    let mut buffer = [0u8; 1024];
                    let n = stdio_conn.inner.read(&mut buffer).await?;
                    Ok::<_, std::io::Error>(buffer[..n].to_vec())
                } => {
                    match result {
                        Ok(data) => {
                            if !data.is_empty() {
                                if let Ok(log_str) = String::from_utf8(data) {
                                    window.emit("stdout-message", log_str).unwrap_or_else(|e| {
                                        eprintln!("Failed to emit stdout message: {}", e);
                                    });
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Error reading from stdio: {}", e);
                            window.emit("stdout-message", "stdout.done").unwrap_or_else(|e| {
                                eprintln!("Failed to emit stdout error: {}", e);
                            });
                            break;
                        }
                    }
                }
            }
        }

        let mut stream_guard = stream_clone.lock().await;
        *stream_guard = None;
    });

    Ok(())
}

async fn get_bundle_id(
    handle: &AppHandle,
    window: &Window,
    anisette_server: String,
    folder: String,
) -> Result<String, String> {
    let config = TomlConfig::load_or_default(PathBuf::from(folder))?;
    let bundle_id = config.project.bundle_id;

    let session = get_developer_session(handle, window, anisette_server).await?;

    let team_id = session
        .get_team()
        .await
        .map_err(|e| format!("Failed to get team: {:?}", e))?
        .team_id;

    Ok(format!("{}.{}", bundle_id, team_id))
}
#[tauri::command]
pub async fn stop_stream_stdout(stream: State<'_, StdoutStream>) -> Result<(), String> {
    let mut stream_guard = stream.lock().await;

    if let Some(token) = stream_guard.take() {
        token.cancel();
        Ok(())
    } else {
        Err("No active stdout stream found".to_string())
    }
}

#[tauri::command]
pub async fn is_streaming_stdout(stream: State<'_, StdoutStream>) -> Result<bool, String> {
    let stream_guard = stream.lock().await;
    Ok(stream_guard.is_some())
}
