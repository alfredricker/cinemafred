use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    // R2 Configuration
    pub r2_account_id: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_bucket_name: String,
    
    // Processing Settings
    pub gpu_enabled: bool,
    pub parallel_processing_count: u32,
    pub max_parallel_processing: u32,
    
    // Deletion Settings
    pub delete_original_after_conversion: bool,
    pub cleanup_hls_temp_files: bool,
    pub keep_original_mp4: bool,
    
    // Quality Settings
    pub include_480p: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            r2_account_id: String::new(),
            r2_access_key_id: String::new(),
            r2_secret_access_key: String::new(),
            r2_bucket_name: String::new(),
            gpu_enabled: true,
            parallel_processing_count: 2,
            max_parallel_processing: 4,
            delete_original_after_conversion: false,
            cleanup_hls_temp_files: true,
            keep_original_mp4: true,
            include_480p: false,
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn load_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let store = tauri_plugin_store::StoreExt::get_store(&app, "settings.json")
        .ok_or("Failed to get store")?;
    
    // Try to load existing settings
    let settings = match store.get("app_settings") {
        Some(value) => {
            serde_json::from_value(value.clone())
                .unwrap_or_else(|_| AppSettings::default())
        }
        None => AppSettings::default(),
    };
    
    Ok(settings)
}

#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let store = tauri_plugin_store::StoreExt::get_store(&app, "settings.json")
        .ok_or("Failed to get store")?;
    
    let settings_value = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("app_settings", settings_value);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn test_gpu_capabilities() -> Result<HashMap<String, serde_json::Value>, String> {
    // This would integrate with the GPU detector from the existing scripts
    // For now, return a mock response
    let mut capabilities = HashMap::new();
    capabilities.insert("has_nvidia".to_string(), serde_json::Value::Bool(false));
    capabilities.insert("has_amd".to_string(), serde_json::Value::Bool(false));
    capabilities.insert("has_intel".to_string(), serde_json::Value::Bool(false));
    capabilities.insert("recommended_encoder".to_string(), serde_json::Value::String("libx264".to_string()));
    capabilities.insert("gpu_available".to_string(), serde_json::Value::Bool(false));
    
    Ok(capabilities)
}

#[tauri::command]
async fn validate_r2_connection(settings: AppSettings) -> Result<bool, String> {
    // This would test the R2 connection with the provided credentials
    // For now, just validate that all required fields are present
    if settings.r2_account_id.is_empty() || 
       settings.r2_access_key_id.is_empty() || 
       settings.r2_secret_access_key.is_empty() || 
       settings.r2_bucket_name.is_empty() {
        return Err("All R2 credentials are required".to_string());
    }
    
    // TODO: Implement actual R2 connection test
    Ok(true)
}

#[tauri::command]
fn detect_display_server() -> HashMap<String, serde_json::Value> {
    let mut info = HashMap::new();
    
    // Check for Wayland
    let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
    let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    let is_wayland = !wayland_display.is_empty() || session_type == "wayland";
    
    info.insert("is_wayland".to_string(), serde_json::Value::Bool(is_wayland));
    info.insert("session_type".to_string(), serde_json::Value::String(session_type));
    info.insert("wayland_display".to_string(), serde_json::Value::String(wayland_display));
    
    // Check current environment variables
    let gdk_backend = std::env::var("GDK_BACKEND").unwrap_or_default();
    let webkit_compositing = std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").unwrap_or_default();
    
    info.insert("gdk_backend".to_string(), serde_json::Value::String(gdk_backend));
    info.insert("webkit_compositing_disabled".to_string(), serde_json::Value::String(webkit_compositing));
    
    info
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            load_settings,
            save_settings,
            test_gpu_capabilities,
            validate_r2_connection,
            detect_display_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
