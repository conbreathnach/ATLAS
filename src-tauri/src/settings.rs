//! App-wide settings persisted in the ATLAS data directory.

use crate::{
    chats::GenerationSettings,
    error::{AtlasError, AtlasResult},
    models, storage,
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const THEMES: [&str; 3] = ["dark", "light", "black"];
pub const ACCENTS: [&str; 4] = ["lime", "blue", "violet", "amber"];

fn default_theme() -> String {
    "dark".to_string()
}

fn default_accent() -> String {
    "lime".to_string()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub default_model_id: Option<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    /// App-wide generation defaults applied to newly created conversations.
    #[serde(default)]
    pub default_generation: GenerationSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_model_id: None,
            theme: default_theme(),
            accent: default_accent(),
            default_generation: GenerationSettings::default(),
        }
    }
}

pub fn load_settings(app: &AppHandle) -> AtlasResult<AppSettings> {
    let path = storage::data_file(app, "settings.json")?;
    Ok(storage::read_json(&path)?.unwrap_or_default())
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> AtlasResult<()> {
    let path = storage::data_file(app, "settings.json")?;
    storage::write_json(&path, settings)
}

fn validate(settings: &AppSettings) -> AtlasResult<()> {
    if !THEMES.contains(&settings.theme.as_str()) {
        return Err(AtlasError::new("Unknown theme."));
    }
    if !ACCENTS.contains(&settings.accent.as_str()) {
        return Err(AtlasError::new("Unknown accent color."));
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AtlasResult<AppSettings> {
    let _guard = storage::lock_store();
    load_settings(&app)
}

/// Replace app settings after validation; clears a default model that no
/// longer exists instead of rejecting the whole update.
#[tauri::command]
pub fn update_app_settings(app: AppHandle, settings: AppSettings) -> AtlasResult<AppSettings> {
    let _guard = storage::lock_store();
    validate(&settings)?;
    let mut settings = settings;
    if let Some(id) = settings.default_model_id.as_deref() {
        if !models::load_models(&app)?
            .iter()
            .any(|model| model.id == id)
        {
            settings.default_model_id = None;
        }
    }
    save_settings(&app, &settings)?;
    Ok(settings)
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
    let mut settings = load_settings(&app)?;
    settings.default_model_id = model_id;
    save_settings(&app, &settings)?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_theme() {
        let mut settings = AppSettings::default();
        settings.theme = "purple".to_string();
        assert!(validate(&settings).is_err());
    }

    #[test]
    fn accepts_defaults() {
        assert!(validate(&AppSettings::default()).is_ok());
    }
}
