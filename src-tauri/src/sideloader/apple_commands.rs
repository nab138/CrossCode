use isideload::developer_session::{DeveloperDeviceType, ListAppIdsResponse};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::sideloader::apple::APPLE_ACCOUNT;

pub fn store_credentials(email: &str, password: &str) -> Result<(), KeyringError> {
    let email_entry = Entry::new("y-code", "apple_id_email")?;
    email_entry.set_password(email)?;
    let pass_entry = Entry::new("y-code", email)?;
    pass_entry.set_password(password)
}

pub fn get_stored_credentials() -> Option<(String, String)> {
    let email_entry = Entry::new("y-code", "apple_id_email").ok()?;
    let email = email_entry.get_password().ok()?;
    let pass_entry = Entry::new("y-code", &email).ok()?;
    let password = pass_entry.get_password().ok()?;
    Some((email, password))
}

#[tauri::command]
pub fn get_apple_email() -> String {
    let credentials = get_stored_credentials();
    if credentials.is_none() {
        return "".to_string();
    }
    let (email, _) = credentials.unwrap();
    email
}

#[tauri::command]
pub fn delete_stored_credentials() -> Result<(), String> {
    let email_entry =
        Entry::new("y-code", "apple_id_email").map_err(|e| format!("Keyring error: {:?}", e))?;
    let email = match email_entry.get_password() {
        Ok(email) => email,
        Err(_) => {
            return Ok(());
        }
    };
    let pass_entry = Entry::new("y-code", &email).map_err(|e| format!("Keyring error: {:?}", e))?;

    let _ = pass_entry.delete_password();
    email_entry
        .delete_password()
        .map_err(|e| format!("Keyring error: {:?}", e))?;

    if let Some(account) = APPLE_ACCOUNT.get() {
        let mut account_guard = account.lock().unwrap();
        *account_guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn reset_anisette(handle: tauri::AppHandle) -> Result<(), String> {
    let config_dir = handle.path().app_config_dir().map_err(|e| e.to_string())?;
    let status_path = config_dir.join("state.plist");
    if status_path.exists() {
        std::fs::remove_file(&status_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateInfo {
    pub name: String,
    pub certificate_id: String,
    pub serial_number: String,
    pub machine_name: String,
}

#[tauri::command]
pub async fn get_certificates(
    handle: tauri::AppHandle,
    window: tauri::Window,
    anisette_server: String,
) -> Result<Vec<CertificateInfo>, String> {
    let dev_session =
        crate::sideloader::apple::get_developer_session(&handle, &window, anisette_server.clone())
            .await?;
    let team = dev_session
        .get_team()
        .await
        .map_err(|e| format!("Failed to get developer team: {:?}", e))?;
    let certificates = dev_session
        .list_all_development_certs(DeveloperDeviceType::Ios, &team)
        .await
        .map_err(|e| format!("Failed to get development certificates: {:?}", e))?;
    Ok(certificates
        .into_iter()
        .map(|cert| CertificateInfo {
            name: cert.name,
            certificate_id: cert.certificate_id,
            serial_number: cert.serial_number,
            machine_name: cert.machine_name,
        })
        .collect())
}

#[tauri::command]
pub async fn revoke_certificate(
    handle: tauri::AppHandle,
    window: tauri::Window,
    anisette_server: String,
    serial_number: String,
) -> Result<(), String> {
    let dev_session =
        crate::sideloader::apple::get_developer_session(&handle, &window, anisette_server.clone())
            .await?;
    let team = dev_session
        .get_team()
        .await
        .map_err(|e| format!("Failed to get developer team: {:?}", e))?;
    dev_session
        .revoke_development_cert(DeveloperDeviceType::Ios, &team, &serial_number)
        .await
        .map_err(|e| format!("Failed to revoke development certificates: {:?}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_app_ids(
    handle: tauri::AppHandle,
    window: tauri::Window,
    anisette_server: String,
) -> Result<ListAppIdsResponse, String> {
    let dev_session =
        crate::sideloader::apple::get_developer_session(&handle, &window, anisette_server.clone())
            .await?;
    let team = dev_session
        .get_team()
        .await
        .map_err(|e| format!("Failed to get developer team: {:?}", e))?;
    let app_ids = dev_session
        .list_app_ids(DeveloperDeviceType::Ios, &team)
        .await
        .map_err(|e| format!("Failed to list App IDs: {:?}", e))?;
    Ok(app_ids)
}

#[tauri::command]
pub async fn delete_app_id(
    handle: tauri::AppHandle,
    window: tauri::Window,
    anisette_server: String,
    app_id_id: String,
) -> Result<(), String> {
    let dev_session =
        crate::sideloader::apple::get_developer_session(&handle, &window, anisette_server.clone())
            .await?;
    let team = dev_session
        .get_team()
        .await
        .map_err(|e| format!("Failed to get developer team: {:?}", e))?;
    dev_session
        .delete_app_id(DeveloperDeviceType::Ios, &team, app_id_id)
        .await
        .map_err(|e| format!("Failed to delete App ID: {:?}", e))?;
    Ok(())
}
