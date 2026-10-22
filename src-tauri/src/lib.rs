use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{LlamaModel, params::LlamaModelParams},
    sampling::LlamaSampler,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    num::NonZeroU32,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalModel {
    id: String,
    file_name: String,
    size_bytes: u64,
    imported_at: u64,
}

fn generate_with_model(model_path: PathBuf, prompt: String) -> Result<String, String> {
    let backend = LlamaBackend::init()
        .map_err(|error| format!("Could not start the ATLAS engine: {error}"))?;
    let model_params = LlamaModelParams::default();
    let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
        .map_err(|error| format!("Could not load the selected GGUF model: {error}"))?;
    let context_params = LlamaContextParams::default().with_n_ctx(Some(
        NonZeroU32::new(2048).expect("ATLAS uses a non-zero context window"),
    ));
    let mut context = model
        .new_context(&backend, context_params)
        .map_err(|error| format!("Could not create a local model session: {error}"))?;

    let instruction = format!(
        "You are ATLAS, a helpful private local AI assistant. Answer directly and clearly.\n\nUser: {prompt}\nAssistant:"
    );
    let tokens = model.vocab().tokenize(instruction.as_bytes(), true, true);
    if tokens.is_empty() {
        return Err("The message could not be tokenized by this model.".to_string());
    }
    if tokens.len() >= context.n_ctx() as usize {
        return Err("The message is too long for this model's context window.".to_string());
    }

    let mut batch = LlamaBatch::new(tokens.len(), 1);
    let last_token_index = (tokens.len() - 1) as i32;
    for (position, token) in (0_i32..).zip(tokens) {
        batch
            .add(token, position, &[0], position == last_token_index)
            .map_err(|error| format!("Could not prepare the local model prompt: {error}"))?;
    }
    context
        .decode(&mut batch)
        .map_err(|error| format!("The local model could not process the message: {error}"))?;

    let mut sampler =
        LlamaSampler::chain_simple([LlamaSampler::dist(1234), LlamaSampler::greedy()]);
    let mut response = Vec::new();
    let mut position = batch.n_tokens();
    const MAX_RESPONSE_TOKENS: usize = 512;

    for _ in 0..MAX_RESPONSE_TOKENS {
        let token = sampler.sample(&context, batch.n_tokens() - 1);
        sampler.accept(token);
        if model.vocab().is_eog(token) {
            break;
        }

        response.extend(model.vocab().token_to_piece(token, true, None));
        batch.clear();
        batch
            .add(token, position, &[0], true)
            .map_err(|error| format!("Could not prepare the local model response: {error}"))?;
        context
            .decode(&mut batch)
            .map_err(|error| format!("The local model stopped unexpectedly: {error}"))?;
        position += 1;
    }

    let response = String::from_utf8_lossy(&response).trim().to_string();
    if response.is_empty() {
        return Err("The local model returned an empty response.".to_string());
    }
    Ok(response)
}

fn app_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the ATLAS data directory: {error}"))?;

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the ATLAS data directory: {error}"))?;

    Ok(directory)
}

fn models_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_directory(app)?.join("models");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the ATLAS model directory: {error}"))?;
    Ok(directory)
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join("models.json"))
}

fn load_models(app: &AppHandle) -> Result<Vec<LocalModel>, String> {
    let path = registry_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the ATLAS model registry: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("The ATLAS model registry is invalid: {error}"))
}

fn save_models(app: &AppHandle, models: &[LocalModel]) -> Result<(), String> {
    let path = registry_path(app)?;
    let serialized = serde_json::to_string_pretty(models)
        .map_err(|error| format!("Could not serialize the ATLAS model registry: {error}"))?;

    fs::write(path, serialized)
        .map_err(|error| format!("Could not save the ATLAS model registry: {error}"))
}

fn import_model_file(app: &AppHandle, source_path: &str) -> Result<LocalModel, String> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err("The selected model file does not exist.".to_string());
    }

    let is_gguf = source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("gguf"));
    if !is_gguf {
        return Err("ATLAS only supports GGUF model files.".to_string());
    }

    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The selected model file has an invalid name.".to_string())?
        .to_string();
    let destination = models_directory(app)?.join(&file_name);

    if destination.exists() {
        return Err(format!(
            "{file_name} is already in the ATLAS model library."
        ));
    }

    let size_bytes = fs::metadata(source)
        .map_err(|error| format!("Could not inspect the selected model file: {error}"))?
        .len();
    fs::copy(source, &destination)
        .map_err(|error| format!("Could not copy the model into ATLAS: {error}"))?;

    let imported_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not create model metadata: {error}"))?
        .as_secs();
    let model = LocalModel {
        id: format!("{imported_at}-{}", file_name),
        file_name,
        size_bytes,
        imported_at,
    };

    let mut models = match load_models(app) {
        Ok(models) => models,
        Err(error) => {
            let _ = fs::remove_file(&destination);
            return Err(error);
        }
    };
    models.push(model.clone());
    if let Err(error) = save_models(app, &models) {
        let _ = fs::remove_file(destination);
        return Err(error);
    }

    Ok(model)
}

#[tauri::command]
fn list_models(app: AppHandle) -> Result<Vec<LocalModel>, String> {
    load_models(&app)
}

#[tauri::command]
async fn import_model(app: AppHandle, source_path: String) -> Result<LocalModel, String> {
    tauri::async_runtime::spawn_blocking(move || import_model_file(&app, &source_path))
        .await
        .map_err(|error| format!("The model import task did not complete: {error}"))?
}

#[tauri::command]
async fn generate_response(
    app: AppHandle,
    model_id: String,
    prompt: String,
) -> Result<String, String> {
    let models = load_models(&app)?;
    let model = models
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| "The selected model is no longer in the ATLAS library.".to_string())?;
    let model_path = models_directory(&app)?.join(&model.file_name);
    if !model_path.is_file() {
        return Err("The selected model file is missing from the ATLAS library.".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || generate_with_model(model_path, prompt))
        .await
        .map_err(|error| format!("The local generation task did not complete: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            generate_response,
            import_model,
            list_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
