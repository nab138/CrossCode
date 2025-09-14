use crate::sideloader::device::{get_provider, DeviceInfo};
use idevice::{syslog_relay::SyslogRelayClient, IdeviceService};
use std::sync::Arc;
use tauri::{Emitter, State, Window};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub struct SyslogStream(pub Arc<Mutex<Option<CancellationToken>>>);

#[tauri::command]
pub async fn start_stream_syslog(
    window: Window,
    device: DeviceInfo,
    stream: State<'_, SyslogStream>,
) -> Result<(), String> {
    let mut stream_guard = stream.0.lock().await;
    if let Some(token) = stream_guard.take() {
        token.cancel();
    }

    let provider = get_provider(&device).await?;

    let mut relay_client = SyslogRelayClient::connect(&provider)
        .await
        .map_err(|e| format!("Failed to connect to syslog relay: {}", e))?;

    let cancellation_token = CancellationToken::new();

    *stream_guard = Some(cancellation_token.clone());

    let stream_clone = stream.0.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancellation_token.cancelled() => {
                    println!("Syslog stream cancelled");
                    break;
                }
                message_result = relay_client.next() => {
                    match message_result {
                        Ok(message) => {
                            if let Err(e) = window.emit("syslog-message", &message) {
                                eprintln!("Failed to emit syslog message: {}", e);
                                break;
                            }
                        }
                        Err(e) => {
                            eprintln!("Error reading syslog message: {}", e);
                            let _ = window.emit("syslog-message", format!("Error reading syslog: {}", e));
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

#[tauri::command]
pub async fn stop_stream_syslog(stream: State<'_, SyslogStream>) -> Result<(), String> {
    let mut stream_guard = stream.0.lock().await;

    if let Some(token) = stream_guard.take() {
        token.cancel();
        Ok(())
    } else {
        Err("No active syslog stream found".to_string())
    }
}

#[tauri::command]
pub async fn is_streaming_syslog(stream: State<'_, SyslogStream>) -> Result<bool, String> {
    let stream_guard = stream.0.lock().await;
    Ok(stream_guard.is_some())
}
