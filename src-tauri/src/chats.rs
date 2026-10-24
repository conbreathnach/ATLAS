//! Persistent local conversations with granular, race-safe commands.
//!
//! Mutations are small server-side operations (`append_message`,
//! `update_settings`, …) applied under the store lock to the freshest copy,
//! so asynchronous work (streaming replies, debounced setting writes) can
//! never resurrect deleted chats or clobber newer edits with stale snapshots.

use crate::{
    error::{AtlasError, AtlasResult},
    storage,
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const DEFAULT_SYSTEM_PROMPT: &str = "You are ATLAS, a helpful AI assistant running locally on the user's device. Answer directly, clearly, and concisely.";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub created_at: u64,
}

/// Per-conversation generation settings. Serde defaults keep old saved data loadable.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationSettings {
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_top_p")]
    pub top_p: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: usize,
    #[serde(default = "default_context_size")]
    pub context_size: u32,
    #[serde(default = "default_system_prompt")]
    pub system_prompt: String,
}

fn default_temperature() -> f32 {
    0.7
}
fn default_top_p() -> f32 {
    0.9
}
fn default_max_tokens() -> usize {
    // Generous default: reasoning models spend tokens inside <think> blocks
    // before any visible answer is produced.
    2048
}
fn default_context_size() -> u32 {
    8192
}
fn default_system_prompt() -> String {
    DEFAULT_SYSTEM_PROMPT.to_string()
}

impl Default for GenerationSettings {
    fn default() -> Self {
        Self {
            temperature: default_temperature(),
            top_p: default_top_p(),
            max_tokens: default_max_tokens(),
            context_size: default_context_size(),
            system_prompt: default_system_prompt(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub model_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub settings: GenerationSettings,
}

pub fn load_conversations(app: &AppHandle) -> AtlasResult<Vec<Conversation>> {
    let path = storage::data_file(app, "conversations.json")?;
    Ok(storage::read_json(&path)?.unwrap_or_default())
}

pub fn save_conversations(app: &AppHandle, conversations: &[Conversation]) -> AtlasResult<()> {
    let path = storage::data_file(app, "conversations.json")?;
    storage::write_json(&path, &conversations)
}

fn validate_settings(settings: &GenerationSettings) -> AtlasResult<()> {
    if !(0.0..=2.0).contains(&settings.temperature)
        || !(0.0..=1.0).contains(&settings.top_p)
        || settings.max_tokens == 0
        || settings.max_tokens > 8192
        || !(256..=131_072).contains(&settings.context_size)
    {
        return Err(AtlasError::new("Generation settings are out of range."));
    }
    Ok(())
}

fn validate_message(message: &ChatMessage) -> AtlasResult<()> {
    if !matches!(message.role.as_str(), "user" | "assistant") {
        return Err(AtlasError::new("A message has an invalid role."));
    }
    if message.content.trim().is_empty() {
        return Err(AtlasError::new("A message cannot be empty."));
    }
    Ok(())
}

/// Short sidebar title from the first user message.
pub fn derive_title(message: &str) -> String {
    const MAX: usize = 48;
    let collapsed: String = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= MAX {
        collapsed
    } else {
        let mut title: String = collapsed.chars().take(MAX).collect();
        title.push('…');
        title
    }
}

fn find_mut<'a>(
    conversations: &'a mut [Conversation],
    conversation_id: &str,
) -> AtlasResult<&'a mut Conversation> {
    conversations
        .iter_mut()
        .find(|conversation| conversation.id == conversation_id)
        .ok_or_else(|| AtlasError::new("The conversation no longer exists."))
}

#[tauri::command]
pub fn list_conversations(app: AppHandle) -> AtlasResult<Vec<Conversation>> {
    let _guard = storage::lock_store();
    let mut conversations = load_conversations(&app)?;
    conversations.sort_by_key(|conversation| std::cmp::Reverse(conversation.updated_at));
    Ok(conversations)
}

#[tauri::command]
pub fn create_conversation(app: AppHandle) -> AtlasResult<Conversation> {
    let _guard = storage::lock_store();
    let now = storage::now_seconds()?;
    let generation_defaults = crate::settings::load_settings(&app)
        .map(|settings| settings.default_generation)
        .unwrap_or_default();
    let conversation = Conversation {
        id: storage::unique_id("chat")?,
        title: "New chat".to_string(),
        messages: Vec::new(),
        model_id: settings_default_model(&app),
        created_at: now,
        updated_at: now,
        settings: generation_defaults,
    };
    let mut conversations = load_conversations(&app)?;
    conversations.push(conversation.clone());
    save_conversations(&app, &conversations)?;
    Ok(conversation)
}

fn settings_default_model(app: &AppHandle) -> Option<String> {
    let settings = crate::settings::load_settings(app).ok()?;
    let default_id = settings.default_model_id?;
    crate::models::load_models(app)
        .ok()?
        .iter()
        .any(|model| model.id == default_id)
        .then_some(default_id)
}

/// Append one message to the freshest stored copy of a conversation.
#[tauri::command]
pub fn append_message(
    app: AppHandle,
    conversation_id: String,
    message: ChatMessage,
) -> AtlasResult<Conversation> {
    let _guard = storage::lock_store();
    validate_message(&message)?;
    let mut conversations = load_conversations(&app)?;
    let conversation = find_mut(&mut conversations, &conversation_id)?;
    if conversation.title == "New chat" && message.role == "user" {
        conversation.title = derive_title(&message.content);
    }
    conversation.messages.push(message);
    conversation.updated_at = storage::now_seconds()?;
    let updated = conversation.clone();
    save_conversations(&app, &conversations)?;
    Ok(updated)
}

/// Remove a trailing assistant message (used by "regenerate").
#[tauri::command]
pub fn remove_last_message(app: AppHandle, conversation_id: String) -> AtlasResult<Conversation> {
    let _guard = storage::lock_store();
    let mut conversations = load_conversations(&app)?;
    let conversation = find_mut(&mut conversations, &conversation_id)?;
    if conversation
        .messages
        .last()
        .is_some_and(|message| message.role == "assistant")
    {
        conversation.messages.pop();
        conversation.updated_at = storage::now_seconds()?;
    }
    let updated = conversation.clone();
    save_conversations(&app, &conversations)?;
    Ok(updated)
}

#[tauri::command]
pub fn update_conversation_settings(
    app: AppHandle,
    conversation_id: String,
    settings: GenerationSettings,
) -> AtlasResult<Conversation> {
    let _guard = storage::lock_store();
    validate_settings(&settings)?;
    let mut conversations = load_conversations(&app)?;
    let conversation = find_mut(&mut conversations, &conversation_id)?;
    conversation.settings = settings;
    let updated = conversation.clone();
    save_conversations(&app, &conversations)?;
    Ok(updated)
}

#[tauri::command]
pub fn set_conversation_model(
    app: AppHandle,
    conversation_id: String,
    model_id: String,
) -> AtlasResult<Conversation> {
    let _guard = storage::lock_store();
    let models = crate::models::load_models(&app)?;
    if !models.iter().any(|model| model.id == model_id) {
        return Err(AtlasError::new("The selected model is not in the library."));
    }
    let mut conversations = load_conversations(&app)?;
    let conversation = find_mut(&mut conversations, &conversation_id)?;
    conversation.model_id = Some(model_id);
    let updated = conversation.clone();
    save_conversations(&app, &conversations)?;
    Ok(updated)
}

#[tauri::command]
pub fn rename_conversation(
    app: AppHandle,
    conversation_id: String,
    title: String,
) -> AtlasResult<()> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AtlasError::new("A conversation needs a title."));
    }
    let _guard = storage::lock_store();
    let mut conversations = load_conversations(&app)?;
    let conversation = find_mut(&mut conversations, &conversation_id)?;
    conversation.title = title.to_string();
    save_conversations(&app, &conversations)
}

#[tauri::command]
pub fn delete_conversation(app: AppHandle, conversation_id: String) -> AtlasResult<()> {
    let _guard = storage::lock_store();
    let mut conversations = load_conversations(&app)?;
    let before = conversations.len();
    conversations.retain(|conversation| conversation.id != conversation_id);
    if conversations.len() == before {
        return Err(AtlasError::new("The conversation was not found."));
    }
    save_conversations(&app, &conversations)
}

#[tauri::command]
pub fn clear_conversations(app: AppHandle) -> AtlasResult<()> {
    let _guard = storage::lock_store();
    save_conversations(&app, &[])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_is_collapsed_and_truncated() {
        assert_eq!(derive_title("hello   world"), "hello world");
        let long = "word ".repeat(30);
        let title = derive_title(&long);
        assert!(title.chars().count() <= 49);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn short_title_is_kept() {
        assert_eq!(derive_title("hi"), "hi");
    }

    #[test]
    fn settings_validation_bounds() {
        let mut settings = GenerationSettings::default();
        assert!(validate_settings(&settings).is_ok());
        settings.temperature = 2.5;
        assert!(validate_settings(&settings).is_err());
        settings.temperature = 0.7;
        settings.max_tokens = 0;
        assert!(validate_settings(&settings).is_err());
    }
}
