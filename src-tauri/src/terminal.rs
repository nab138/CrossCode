use std::sync::Arc;
use std::{
    collections::HashMap,
    io::{Read, Write},
};

use tokio::sync::RwLock;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtyPair, PtySize};
use tauri::{async_runtime::Mutex, Emitter, State, Window};

pub struct TermManager {
    pub terminals: Arc<RwLock<HashMap<String, TermInfo>>>,
}

pub struct TermInfo {
    pty_pair: Arc<Mutex<PtyPair>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
}

impl TermManager {
    pub fn new() -> Self {
        TermManager {
            terminals: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn create_terminal(
    window: Window,
    term_info: State<'_, TermManager>,
    shell: Option<String>,
    directory: Option<String>,
) -> Result<String, String> {
    println!(
        "Creating terminal with shell: {:?} and directory: {:?}",
        shell, directory
    );
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {}", e))?;

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
    let mut cmd = CommandBuilder::new(command);
    cmd.cwd(directory.unwrap_or_else(|| String::from(".")));
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell command in pty: {}", e.to_string()))?;

    println!(
        "Spawned terminal process with PID: {:?}",
        child.process_id()
    );

    let mut reader = pair.master.try_clone_reader().unwrap();
    let writer = pair.master.take_writer().unwrap();

    let (term_id, _) = {
        let mut terms = term_info.terminals.write().await;
        let term_id = format!("term-{}", terms.len() + 1);
        let info = TermInfo {
            pty_pair: Arc::new(Mutex::new(pair)),
            writer: Arc::new(Mutex::new(Box::new(writer))),
            killer: Arc::new(Mutex::new(child.clone_killer())),
        };
        let writer_ref = info.writer.clone();
        terms.insert(term_id.clone(), info);
        (term_id, writer_ref)
    };

    let window = window.clone();
    let term_id_clone = term_id.clone();
    tokio::spawn(async move {
        let mut buffer = [0u8; 4096];

        loop {
            match reader.read(&mut buffer) {
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
        .map_err(|e| format!("Failed to write to terminal: {}", e))
}

#[tauri::command]
pub async fn resize_terminal(
    term_info: State<'_, TermManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terms = term_info.terminals.read().await;
    let info = terms
        .get(&id)
        .ok_or_else(|| "Terminal ID not found".to_string())?;

    let pty_pair_guard = info.pty_pair.lock().await;
    pty_pair_guard
        .master
        .resize(PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| {
            format!(
                "Failed to resize terminal (cols: {}, rows: {}): {}",
                cols, rows, e
            )
        })
}

#[tauri::command]
pub async fn close_terminal(term_info: State<'_, TermManager>, id: String) -> Result<(), String> {
    let terms = term_info.terminals.read().await;
    let info = terms
        .get(&id)
        .ok_or_else(|| "Terminal ID not found".to_string())?;

    let mut killer_guard = info.killer.lock().await;
    killer_guard
        .kill()
        .map_err(|e| format!("Failed to kill terminal process: {}", e))
}
