use std::collections::HashMap;
use std::sync::Arc;

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Mutex, RwLock},
};

use tokio::process::Child;

use pty_process::Pty;
use tauri::{Emitter, State, Window};

pub struct TermManager {
    pub terminals: Arc<RwLock<HashMap<String, TermInfo>>>,
}

pub struct TermInfo {
    pub pty: Arc<Mutex<Pty>>,
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
    pub fn new(pty: Pty, child: Child) -> Self {
        TermInfo {
            pty: Arc::new(Mutex::new(pty)),
            child: Arc::new(Mutex::new(Some(child))),
        }
    }
}

#[tauri::command]
pub async fn create_terminal(
    window: Window,
    term_info: State<'_, TermManager>,
) -> Result<String, String> {
    let (pty, pts) = pty_process::open().map_err(|e| format!("Failed to spawn terminal: {}", e))?;
    let mut cmd = pty_process::Command::new("/bin/bash");
    let child = cmd
        .spawn(pts)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let (term_id, pty_ref) = {
        let mut terms = term_info.terminals.write().await;
        let term_id = format!("term-{}", terms.len() + 1);
        let info = TermInfo::new(pty, child);
        let pty_ref = info.pty.clone();
        terms.insert(term_id.clone(), info);
        (term_id, pty_ref)
    };

    let window = window.clone();
    let term_id_clone = term_id.clone();
    tokio::spawn(async move {
        let mut buffer = [0u8; 4096];

        loop {
            let read_result = {
                let mut pty_guard = pty_ref.lock().await;
                pty_guard.read(&mut buffer).await
            };

            match read_result {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).into_owned();
                    if !data.is_empty() {
                        let _ = window.emit("terminal", (&term_id_clone, &data));
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
    println!("Writing to terminal {}: {}", id, data);

    let pty_ref = {
        let terms = term_info.terminals.read().await;
        match terms.get(&id) {
            Some(info) => info.pty.clone(),
            None => return Err("Terminal ID not found".to_string()),
        }
    };

    let mut pty_guard = pty_ref.lock().await;
    println!("PTY found, writing data");
    pty_guard
        .write_all(data.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to terminal: {}", e))?;

    Ok(())
}
