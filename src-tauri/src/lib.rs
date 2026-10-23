mod chats;
mod engine;
mod error;
mod models;
mod settings;
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let engine = engine::EngineState::new().map_err(|error| error.to_string())?;
            app.manage(engine);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            chats::append_message,
            chats::clear_conversations,
            chats::create_conversation,
            chats::delete_conversation,
            chats::list_conversations,
            chats::remove_last_message,
            chats::rename_conversation,
            chats::set_conversation_model,
            chats::update_conversation_settings,
            engine::generate_response,
            engine::stop_generation,
            models::delete_model,
            models::import_model,
            models::list_models,
            settings::get_settings,
            settings::set_default_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
