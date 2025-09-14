use isideload::{developer_session::DeveloperSession, AnisetteConfiguration, AppleAccount};
use once_cell::sync::OnceCell;
use serde_json::Value;
use std::{
    sync::{mpsc::RecvTimeoutError, Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Listener, Manager};

use crate::sideloader::apple_commands::{get_stored_credentials, store_credentials};

pub static APPLE_ACCOUNT: OnceCell<Mutex<Option<Arc<AppleAccount>>>> = OnceCell::new();

pub async fn get_account(
    handle: &tauri::AppHandle,
    window: &tauri::Window,
    anisette_server: String,
) -> Result<Arc<AppleAccount>, String> {
    let cell = APPLE_ACCOUNT.get_or_init(|| Mutex::new(None));
    {
        let account_guard = cell.lock().unwrap();
        if let Some(account) = &*account_guard {
            return Ok(account.clone());
        }
    }

    let account = login(handle, window, anisette_server).await?;
    let mut account_guard = cell.lock().unwrap();
    *account_guard = Some(account.clone());
    Ok(account)
}

pub async fn get_developer_session(
    handle: &tauri::AppHandle,
    window: &tauri::Window,
    anisette_server: String,
) -> Result<DeveloperSession, String> {
    let account = get_account(handle, window, anisette_server.clone()).await?;

    let mut dev_session = DeveloperSession::new(account);

    let teams = match dev_session.list_teams().await {
        Ok(t) => t,
        Err(e) => {
            // This code means we have been logged in for too long and we must relogin again
            let is_22411 = match &e {
                isideload::Error::Auth(code, _) => *code == -22411,
                isideload::Error::DeveloperSession(code, _) => *code == -22411,
                _ => false,
            };
            if is_22411 {
                invalidate_account();
                let account = get_account(handle, window, anisette_server).await?;
                dev_session = DeveloperSession::new(account);
                match dev_session.list_teams().await {
                    Ok(t) => t,
                    Err(e) => {
                        return Err(format!("Failed to list teams after re-login: {:?}", e));
                    }
                }
            } else {
                return Err(format!("Failed to list teams: {:?}", e));
            }
        }
    };

    dev_session.set_team(teams[0].clone());

    Ok(dev_session)
}

pub async fn login(
    handle: &tauri::AppHandle,
    window: &tauri::Window,
    anisette_server: String,
) -> Result<Arc<AppleAccount>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let window_clone = window.clone();

    let appleid_closure = move || -> Result<(String, String), String> {
        if let Some((email, password)) = get_stored_credentials() {
            window_clone
                .emit(
                    "build-output",
                    "Using stored Apple ID credentials".to_string(),
                )
                .ok();
            return Ok((email, password));
        }

        window_clone
            .emit("apple-id-required", ())
            .expect("Failed to emit apple-id-required event");

        let tx1 = tx.clone();
        let handler_id_recieved = window_clone.listen("apple-id-recieved", move |event| {
            let json = event.payload();
            let _ = tx1.send(format!("apple-id-recieved:{}", json));
        });

        let tx2 = tx.clone();
        let handler_id_cancelled = window_clone.listen("login-cancelled", move |_event| {
            let _ = tx2.send("login-cancelled".to_string());
        });

        let result = rx.recv_timeout(Duration::from_secs(120));
        window_clone.unlisten(handler_id_recieved);
        window_clone.unlisten(handler_id_cancelled);

        match result {
            Ok(msg) if msg.starts_with("apple-id-recieved:") => {
                let json = &msg["apple-id-recieved:".len()..];
                let json: Value = serde_json::from_str(json).expect("Failed to parse json");
                let apple_id = json
                    .get("appleId")
                    .and_then(Value::as_str)
                    .expect("Failed to get apple_id from json")
                    .to_string();
                let password = json
                    .get("applePass")
                    .and_then(Value::as_str)
                    .expect("Failed to get password from json")
                    .to_string();
                let save_credentials = json
                    .get("saveCredentials")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);

                if save_credentials {
                    if let Err(e) = store_credentials(&apple_id, &password) {
                        window_clone
                            .emit(
                                "build-output",
                                format!("Failed to save credentials: {:?}", e),
                            )
                            .ok();
                    }
                }

                Ok((apple_id, password))
            }
            Ok(msg) if msg == "login-cancelled" => {
                window_clone
                    .emit("build-output", "Login cancelled by user".to_string())
                    .ok();
                Err("Login cancelled by user".to_string())
            }
            Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) | _ => {
                window_clone
                    .emit("build-output", "Login cancelled or timed out".to_string())
                    .ok();
                Err("Login cancelled or timed out".to_string())
            }
        }
    };

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let window_clone = window.clone();
    let tfa_closure = move || -> Result<String, String> {
        window_clone
            .emit("2fa-required", ())
            .expect("Failed to emit 2fa-required event");

        let tx = tx.clone();
        let handler_id = window_clone.listen("2fa-recieved", move |event| {
            let code = event.payload();
            let _ = tx.send(code.to_string());
        });

        let result = rx.recv_timeout(Duration::from_secs(120));
        window_clone.unlisten(handler_id);

        match result {
            Ok(code) => {
                let code = code.trim_matches('"').to_string();
                Ok(code)
            }
            Err(RecvTimeoutError::Timeout) => Err("2FA cancelled or timed out".to_string()),
            Err(RecvTimeoutError::Disconnected) => Err("2FA disconnected".to_string()),
        }
    };

    let config = AnisetteConfiguration::default();
    let config =
        config.set_configuration_path(handle.path().app_config_dir().map_err(|e| e.to_string())?);
    let config = config.set_anisette_url(format!("https://{}", anisette_server));
    window
        .emit("build-output", "Logging in...")
        .map_err(|e| e.to_string())?;

    let account = AppleAccount::login(appleid_closure, tfa_closure, config).await;
    if let Err(e) = account {
        window
            .emit("build-output", "Login failed or cancelled".to_string())
            .ok();
        window.emit("build-output", format!("{:?}", e)).ok();
        return Err(format!("{:?}", e));
    }
    let account = Arc::new(account.unwrap());
    window
        .emit("build-output", "Successfully logged in".to_string())
        .map_err(|e| e.to_string())?;

    Ok(account)
}

pub fn invalidate_account() {
    let cell = APPLE_ACCOUNT.get();
    if let Some(account) = cell {
        let mut account_guard = account.lock().unwrap();
        *account_guard = None;
    }
}
