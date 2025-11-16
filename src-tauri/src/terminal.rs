use std::collections::HashMap;
use std::sync::Arc;

use tokio::{
    io::{split, AsyncReadExt, AsyncWriteExt, ReadHalf, WriteHalf},
    sync::{Mutex, RwLock},
};

use tokio::process::Child;

use pty_process::Pty;
use tauri::{Emitter, State, Window};

pub struct TermManager {
    pub terminals: Arc<RwLock<HashMap<String, TermInfo>>>,
}

pub struct TermInfo {
    pub writer: Arc<Mutex<WriteHalf<Pty>>>,
    pub child: Arc<Mutex<Option<Child>>>,
}

impl TermManager {
    pub fn new() -> Self {
        TermManager {
            terminals: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl TermInfo {
    pub fn new(writer: WriteHalf<Pty>, child: Child) -> Self {
        TermInfo {
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(Some(child))),
        }
    }
}

#[tauri::command]
pub async fn create_terminal(
    window: Window,
    term_info: State<'_, TermManager>,
    shell: Option<String>,
) -> Result<String, String> {
    let (pty, pts) = pty_process::open().map_err(|e| format!("Failed to spawn terminal: {}", e))?;
    let command = match shell {
        Some(s) => s,
        None => {
            #[cfg(target_os = "windows")]
            {
                String::from("pwsh.exe")
            }
            #[cfg(not(target_os = "windows"))]
            {
                std::env::var("SHELL").unwrap_or_else(|_| String::from("sh"))
            }
        }
    };
    let cmd = pty_process::Command::new(command);
    let child = cmd
        .spawn(pts)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let (reader, writer) = split(pty);

    let (term_id, _) = {
        let mut terms = term_info.terminals.write().await;
        let term_id = format!("term-{}", terms.len() + 1);
        let info = TermInfo::new(writer, child);
        let writer_ref = info.writer.clone();
        terms.insert(term_id.clone(), info);
        (term_id, writer_ref)
    };

    let window = window.clone();
    let term_id_clone = term_id.clone();
    tokio::spawn(async move {
        let mut reader: ReadHalf<Pty> = reader;
        let mut buffer = [0u8; 4096];

        loop {
            match reader.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(data) = std::str::from_utf8(&buffer[..n]) {
                        let _ = window.emit("terminal", (&term_id_clone, data));
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(term_id)
}

#[tauri::command]
pub async fn write_terminal(
    term_info: State<'_, TermManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    let writer = {
        let terms = term_info.terminals.read().await;
        terms
            .get(&id)
            .map(|info| info.writer.clone())
            .ok_or_else(|| "Terminal ID not found".to_string())?
    };

    let mut guard = writer.lock().await;
    guard
        .write_all(data.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to terminal: {}", e))
}

#[tauri::command]
pub async fn close_terminal(term_info: State<'_, TermManager>, id: String) -> Result<(), String> {
    let child = {
        let terms = term_info.terminals.read().await;
        terms
            .get(&id)
            .map(|info| info.child.clone())
            .ok_or_else(|| "Terminal ID not found".to_string())?
    };
    let mut guard = child.lock().await;
    if let Some(mut child_proc) = guard.take() {
        child_proc
            .kill()
            .await
            .map_err(|e| format!("Failed to kill terminal process: {}", e))?;
    }
    Ok(())
}
