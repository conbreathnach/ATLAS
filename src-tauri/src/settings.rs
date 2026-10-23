//! App-wide settings persisted in the ATLAS data directory.

use crate::{
    error::{AtlasError, AtlasResult},
    models, storage,
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub default_model_id: Option<String>,
}

pub fn load_settings(app: &AppHandle) -> AtlasResult<AppSettings> {
    let path = storage::data_file(app, "settings.json")?;
    Ok(storage::read_json(&path)?.unwrap_or_default())
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> AtlasResult<()> {
    let path = storage::data_file(app, "settings.json")?;
    storage::write_json(&path, settings)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AtlasResult<AppSettings> {
    load_settings(&app)
}

#[tauri::command]
pub fn set_default_model(app: AppHandle, model_id: Option<String>) -> AtlasResult<AppSettings> {
    let _guard = storage::lock_store();
    if let Some(id) = model_id.as_deref() {
        let models = models::load_models(&app)?;
        if !models.iter().any(|model| model.id == id) {
            return Err(AtlasError::new("The selected default model was not found."));
        }
    }
    let settings = AppSettings {
        default_model_id: model_id,
    };
    save_settings(&app, &settings)?;
    Ok(settings)
}
