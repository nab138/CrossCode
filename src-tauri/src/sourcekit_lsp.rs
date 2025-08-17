use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, State, Window};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};

use crate::builder::swift::{validate_toolchain, SwiftBin};

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub is_running: bool,
    pub port: Option<u16>,
    pub connected_clients: usize,
}

pub struct SourceKitServer {
    pub process: Option<Child>,
    pub websocket_listener: Option<TcpListener>,
    pub status: ServerStatus,
    pub abort_handles: Vec<tokio::task::AbortHandle>,
}

impl SourceKitServer {
    pub fn new() -> Self {
        Self {
            process: None,
            websocket_listener: None,
            status: ServerStatus {
                is_running: false,
                port: None,
                connected_clients: 0,
            },
            abort_handles: Vec::new(),
        }
    }
}

pub type ServerState = Arc<RwLock<SourceKitServer>>;

#[tauri::command]
pub async fn start_sourcekit_server(
    window: Window,
    state: State<'_, ServerState>,
    toolchain_path: String,
    folder: String,
) -> Result<u16, String> {
    let mut server = state.write().await;

    if server.status.is_running {
        return Err("Server is already running".to_string());
    }

    if !validate_toolchain(&toolchain_path) {
        return Err(format!("Invalid toolchain path: {}", toolchain_path));
    }

    let swift_bin = SwiftBin::new(&toolchain_path)?;
    let mut child = swift_bin
        .sourcekit_command()
        .current_dir(folder)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start sourcekit-lsp: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind WebSocket server: {}", e))?;

    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get server address: {}", e))?
        .port();

    let (to_lsp_tx, mut to_lsp_rx) = mpsc::unbounded_channel::<String>();
    let (from_lsp_tx, _from_lsp_rx) = broadcast::channel::<String>(100);

    let state_clone = state.inner().clone();

    let ws_state = state_clone.clone();
    let ws_to_lsp = to_lsp_tx.clone();
    let ws_from_lsp = from_lsp_tx.subscribe();
    let ws_task = tokio::spawn(async move {
        handle_websocket_connections(listener, ws_state, ws_to_lsp, ws_from_lsp).await;
    });

    let stdin_task = tokio::spawn(async move {
        while let Some(message) = to_lsp_rx.recv().await {
            let packet = if message.starts_with("Content-Length:") {
                message
            } else {
                format!("Content-Length: {}\r\n\r\n{}", message.len(), message)
            };

            if let Err(e) = stdin.write_all(packet.as_bytes()).await {
                eprintln!("Failed to write to sourcekit-lsp stdin: {}", e);
                break;
            }
            if let Err(e) = stdin.flush().await {
                eprintln!("Failed to flush sourcekit-lsp stdin: {}", e);
                break;
            }
        }
    });

    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut buffer = String::new();

        loop {
            buffer.clear();

            let mut content_length = 0;
            loop {
                buffer.clear();
                match reader.read_line(&mut buffer).await {
                    Ok(0) => return,
                    Ok(_) => {
                        let line = buffer.trim();
                        if line.is_empty() {
                            break;
                        } else if line.starts_with("Content-Length:") {
                            if let Some(length_str) = line.strip_prefix("Content-Length:") {
                                content_length = length_str.trim().parse::<usize>().unwrap_or(0);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to read LSP headers: {}", e);
                        return;
                    }
                }
            }

            if content_length == 0 {
                continue;
            }

            let mut content = vec![0u8; content_length];
            match reader.read_exact(&mut content).await {
                Ok(_) => {
                    let message = String::from_utf8_lossy(&content).to_string();
                    window
                        .emit("lsp-message", message.clone())
                        .unwrap_or_default();
                    if let Err(_) = from_lsp_tx.send(message) {
                        // No receivers, continue
                    }
                }
                Err(e) => {
                    eprintln!("Failed to read LSP content: {}", e);
                    break;
                }
            }
        }
    });

    server.abort_handles.push(ws_task.abort_handle());
    server.abort_handles.push(stdin_task.abort_handle());
    server.abort_handles.push(stdout_task.abort_handle());

    server.process = Some(child);
    server.status.is_running = true;
    server.status.port = Some(actual_port);

    Ok(actual_port)
}

async fn handle_websocket_connections(
    listener: TcpListener,
    state: ServerState,
    to_lsp_tx: mpsc::UnboundedSender<String>,
    mut from_lsp_rx: broadcast::Receiver<String>,
) {
    let (client_tx, mut client_rx) = mpsc::unbounded_channel::<
        futures_util::stream::SplitSink<WebSocketStream<tokio::net::TcpStream>, Message>,
    >();

    let _broadcast_task = tokio::spawn(async move {
        let mut clients = Vec::new();

        loop {
            tokio::select! {
                Some(ws_stream) = client_rx.recv() => {
                    clients.push(ws_stream);

                    let mut server = state.write().await;
                    server.status.connected_clients = clients.len();
                }

                Ok(message) = from_lsp_rx.recv() => {
                    let mut i = 0;
                    while i < clients.len() {
                        if let Err(_) = clients[i].send(Message::Text(message.clone().into())).await {
                            let _ = clients.remove(i);
                        } else {
                            i += 1;
                        }
                    }

                    let mut server = state.write().await;
                    server.status.connected_clients = clients.len();
                }
            }
        }
    });

    while let Ok((stream, _)) = listener.accept().await {
        match accept_async(stream).await {
            Ok(ws_stream) => {
                let (ws_sender, mut ws_receiver) = ws_stream.split();
                let to_lsp_tx_clone = to_lsp_tx.clone();

                let _ = client_tx.send(ws_sender);

                tokio::spawn(async move {
                    while let Some(msg) = ws_receiver.next().await {
                        match msg {
                            Ok(Message::Text(text)) => {
                                if let Err(_) = to_lsp_tx_clone.send(text.to_string()) {
                                    break;
                                }
                            }
                            Ok(Message::Close(_)) => break,
                            Err(_) => break,
                            _ => {}
                        }
                    }
                });
            }
            Err(e) => {
                eprintln!("WebSocket connection error: {}", e);
            }
        }
    }
}

#[tauri::command]
pub async fn stop_sourcekit_server(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let mut server = state.write().await;

    if !server.status.is_running {
        return Err("Server is not running".to_string());
    }

    for handle in server.abort_handles.drain(..) {
        handle.abort();
    }

    if let Some(mut process) = server.process.take() {
        let _ = process.kill().await;
    }

    server.websocket_listener = None;

    server.status = ServerStatus {
        is_running: false,
        port: None,
        connected_clients: 0,
    };

    Ok(())
}

#[tauri::command]
pub async fn get_server_status(
    state: tauri::State<'_, ServerState>,
) -> Result<ServerStatus, String> {
    let server = state.read().await;
    Ok(server.status.clone())
}

pub fn create_server_state() -> ServerState {
    Arc::new(RwLock::new(SourceKitServer::new()))
}
