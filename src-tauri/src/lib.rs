use serde::Serialize;

#[derive(Serialize)]
struct RuntimeStatus {
    engine: &'static str,
    ready: bool,
    detail: &'static str,
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        engine: "ATLAS Engine",
        ready: false,
        detail: "No local GGUF model has been imported.",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![runtime_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
