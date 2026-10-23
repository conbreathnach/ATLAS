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

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Conversation {
    id: String,
    title: String,
    messages: Vec<ChatMessage>,
    model_id: Option<String>,
    created_at: u64,
    updated_at: u64,
}

fn now_timestamp_seconds() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not create local timestamp: {error}"))
        .map(|duration| duration.as_secs())
}

fn now_timestamp_nanos() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not create local timestamp: {error}"))
        .map(|duration| duration.as_nanos())
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

fn models_registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join("models.json"))
}

fn conversations_registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_directory(app)?.join("conversations.json"))
}

fn replace_json_file(path: &Path, contents: &str, label: &str) -> Result<(), String> {
    let temporary_path = path.with_extension("json.tmp");
    fs::write(&temporary_path, contents)
        .map_err(|error| format!("Could not write {label}: {error}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Could not replace {label}: {error}"))?;
    }
    fs::rename(&temporary_path, path)
        .map_err(|error| format!("Could not finalize {label}: {error}"))
}

fn load_models(app: &AppHandle) -> Result<Vec<LocalModel>, String> {
    let path = models_registry_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the ATLAS model registry: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("The ATLAS model registry is invalid: {error}"))
}

fn save_models(app: &AppHandle, models: &[LocalModel]) -> Result<(), String> {
    let path = models_registry_path(app)?;
    let serialized = serde_json::to_string_pretty(models)
        .map_err(|error| format!("Could not serialize the ATLAS model registry: {error}"))?;
    replace_json_file(&path, &serialized, "the ATLAS model registry")
}

fn load_conversations(app: &AppHandle) -> Result<Vec<Conversation>, String> {
    let path = conversations_registry_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read local conversations: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Local conversation storage is invalid: {error}"))
}

fn save_conversations(app: &AppHandle, conversations: &[Conversation]) -> Result<(), String> {
    let path = conversations_registry_path(app)?;
    let serialized = serde_json::to_string_pretty(conversations)
        .map_err(|error| format!("Could not serialize local conversations: {error}"))?;
    replace_json_file(&path, &serialized, "local conversations")
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

    let imported_at = now_timestamp_seconds()?;
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

fn generate_with_model(model_path: PathBuf, messages: Vec<ChatMessage>) -> Result<String, String> {
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

    let recent_messages = messages
        .iter()
        .rev()
        .take(10)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .filter_map(|message| match message.role.as_str() {
            "user" => Some(format!("User: {}", message.content)),
            "assistant" => Some(format!("Assistant: {}", message.content)),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let instruction = format!(
        "You are ATLAS, a helpful private local AI assistant. Answer directly and clearly.\n\n{recent_messages}\n\nAssistant:"
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

#[tauri::command]
fn list_models(app: AppHandle) -> Result<Vec<LocalModel>, String> {
    load_models(&app)
}

#[tauri::command]
fn delete_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let mut models = load_models(&app)?;
    let model_index = models
        .iter()
        .position(|model| model.id == model_id)
        .ok_or_else(|| "The selected model is no longer in the ATLAS model library.".to_string())?;
    let removed_model = models.remove(model_index);
    save_models(&app, &models)?;

    let model_path = models_directory(&app)?.join(removed_model.file_name);
    if model_path.exists() {
        fs::remove_file(&model_path)
            .map_err(|error| format!("Could not remove the local model file: {error}"))?;
    }

    let mut conversations = load_conversations(&app)?;
    let mut changed = false;
    for conversation in &mut conversations {
        if conversation.model_id.as_deref() == Some(model_id.as_str()) {
            conversation.model_id = None;
            changed = true;
        }
    }
    if changed {
        save_conversations(&app, &conversations)?;
    }

    Ok(())
}

#[tauri::command]
fn list_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let mut conversations = load_conversations(&app)?;
    conversations.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(conversations)
}

#[tauri::command]
fn create_conversation(app: AppHandle) -> Result<Conversation, String> {
    let created_at = now_timestamp_seconds()?;
    let conversation = Conversation {
        id: format!("chat-{}", now_timestamp_nanos()?),
        title: "New chat".to_string(),
        messages: Vec::new(),
        model_id: None,
        created_at,
        updated_at: created_at,
    };

    let mut conversations = load_conversations(&app)?;
    conversations.push(conversation.clone());
    save_conversations(&app, &conversations)?;
    Ok(conversation)
}

#[tauri::command]
fn save_conversation(app: AppHandle, conversation: Conversation) -> Result<Conversation, String> {
    if conversation.title.trim().is_empty() {
        return Err("A conversation needs a title.".to_string());
    }
    if conversation.messages.iter().any(|message| {
        !matches!(message.role.as_str(), "user" | "assistant") || message.content.trim().is_empty()
    }) {
        return Err("A conversation contains an invalid message.".to_string());
    }
    if conversation.updated_at < conversation.created_at {
        return Err("A conversation has invalid timestamps.".to_string());
    }

    let mut conversations = load_conversations(&app)?;
    if let Some(existing_conversation) = conversations
        .iter_mut()
        .find(|existing_conversation| existing_conversation.id == conversation.id)
    {
        *existing_conversation = conversation.clone();
    } else {
        conversations.push(conversation.clone());
    }
    save_conversations(&app, &conversations)?;
    Ok(conversation)
}

#[tauri::command]
fn delete_conversation(app: AppHandle, conversation_id: String) -> Result<(), String> {
    let mut conversations = load_conversations(&app)?;
    let previous_length = conversations.len();
    conversations.retain(|conversation| conversation.id != conversation_id);
    if conversations.len() == previous_length {
        return Err("The selected conversation was not found.".to_string());
    }
    save_conversations(&app, &conversations)
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
    messages: Vec<ChatMessage>,
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
    if messages.is_empty() || messages.last().is_none_or(|message| message.role != "user") {
        return Err("A local response needs a user message.".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || generate_with_model(model_path, messages))
        .await
        .map_err(|error| format!("The local generation task did not complete: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_conversation,
            delete_conversation,
            delete_model,
            generate_response,
            import_model,
            list_conversations,
            list_models,
            save_conversation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
