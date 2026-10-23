//! Local GGUF model library: staged import, list, remove.
//!
//! Imports copy to a unique staging file first and are promoted by rename only
//! after a successful copy, so interrupted imports never leave a partial model
//! that would block a retry.

use crate::{
    chats,
    error::{AtlasError, AtlasResult},
    settings, storage,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::AppHandle;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub id: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub imported_at: u64,
}

pub fn load_models(app: &AppHandle) -> AtlasResult<Vec<LocalModel>> {
    let path = storage::data_file(app, "models.json")?;
    Ok(storage::read_json(&path)?.unwrap_or_default())
}

fn save_models(app: &AppHandle, models: &[LocalModel]) -> AtlasResult<()> {
    let path = storage::data_file(app, "models.json")?;
    storage::write_json(&path, &models)
}

pub fn model_path(app: &AppHandle, model_id: &str) -> AtlasResult<std::path::PathBuf> {
    let models = load_models(app)?;
    let model = models
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| AtlasError::new("The selected model is no longer in the ATLAS library."))?;
    let path = storage::models_directory(app)?.join(&model.file_name);
    if !path.is_file() {
        return Err(AtlasError::new(
            "The selected model file is missing from the ATLAS library.",
        ));
    }
    Ok(path)
}

fn import_model_file(app: &AppHandle, source_path: &str) -> AtlasResult<LocalModel> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err(AtlasError::new("The selected model file does not exist."));
    }
    let is_gguf = source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("gguf"));
    if !is_gguf {
        return Err(AtlasError::new("ATLAS only supports GGUF model files."));
    }

    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AtlasError::new("The selected model file has an invalid name."))?
        .to_string();
    let library = storage::models_directory(app)?;
    let destination = library.join(&file_name);
    if destination.exists() {
        return Err(AtlasError::new(format!(
            "{file_name} is already in the ATLAS model library."
        )));
    }

    // Stage under a unique name; promote by rename only after a full copy.
    let staged = library.join(format!(".staging-{}", storage::unique_id("import")?));
    let copy_result = fs::copy(source, &staged);
    let size_bytes = match copy_result {
        Ok(size) => size,
        Err(error) => {
            let _ = fs::remove_file(&staged);
            return Err(AtlasError::context(
                "Could not copy the model into ATLAS",
                error,
            ));
        }
    };
    if let Err(error) = fs::rename(&staged, &destination) {
        let _ = fs::remove_file(&staged);
        return Err(AtlasError::context(
            "Could not finalize the model import",
            error,
        ));
    }

    let model = LocalModel {
        id: storage::unique_id("model")?,
        file_name,
        size_bytes,
        imported_at: storage::now_seconds()?,
    };

    let _guard = storage::lock_store();
    let mut models = load_models(app)?;
    models.push(model.clone());
    if let Err(error) = save_models(app, &models) {
        let _ = fs::remove_file(&destination);
        return Err(error);
    }
    Ok(model)
}

#[tauri::command]
pub fn list_models(app: AppHandle) -> AtlasResult<Vec<LocalModel>> {
    let _guard = storage::lock_store();
    load_models(&app)
}

#[tauri::command]
pub async fn import_model(app: AppHandle, source_path: String) -> AtlasResult<LocalModel> {
    tauri::async_runtime::spawn_blocking(move || import_model_file(&app, &source_path))
        .await
        .map_err(|error| AtlasError::context("The model import task did not complete", error))?
}

#[tauri::command]
pub fn delete_model(app: AppHandle, model_id: String) -> AtlasResult<()> {
    let _guard = storage::lock_store();
    let mut models = load_models(&app)?;
    let index = models
        .iter()
        .position(|model| model.id == model_id)
        .ok_or_else(|| AtlasError::new("The selected model was not found."))?;
    let removed = models[index].clone();

    // Remove the file first; if that fails the registry entry stays intact.
    let file = storage::models_directory(&app)?.join(&removed.file_name);
    if file.exists() {
        fs::remove_file(&file).map_err(|error| {
            AtlasError::context(
                "Could not remove the model file (it may be in use while generating)",
                error,
            )
        })?;
    }

    models.remove(index);
    save_models(&app, &models)?;

    // Detach the removed model from conversations and the default setting.
    let mut conversations = chats::load_conversations(&app)?;
    let mut changed = false;
    for conversation in &mut conversations {
        if conversation.model_id.as_deref() == Some(model_id.as_str()) {
            conversation.model_id = None;
            changed = true;
        }
    }
    if changed {
        chats::save_conversations(&app, &conversations)?;
    }
    let mut app_settings = settings::load_settings(&app)?;
    if app_settings.default_model_id.as_deref() == Some(model_id.as_str()) {
        app_settings.default_model_id = None;
        settings::save_settings(&app, &app_settings)?;
    }
    Ok(())
}
