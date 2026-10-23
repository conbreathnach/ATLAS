//! Embedded llama.cpp inference: cached model, chat templates, token streaming.
//!
//! Generation is single-flight (one response at a time, appropriate for a
//! local single-user app) and request-scoped: every token event carries the
//! request ID, and stop requests only cancel the matching active request.

use crate::{
    chats::{ChatMessage, GenerationSettings},
    error::{AtlasError, AtlasResult},
    models,
};
use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{LlamaChatMessage, LlamaModel, params::LlamaModelParams},
    sampling::LlamaSampler,
};
use serde::Serialize;
use std::{
    num::NonZeroU32,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{AppHandle, Emitter, Manager};

pub const TOKEN_EVENT: &str = "atlas://token";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenPayload {
    pub request_id: String,
    pub conversation_id: String,
    pub token: String,
}

struct CachedModel {
    path: PathBuf,
    model: LlamaModel,
}

/// Shared engine state. `active_request` is only held briefly to claim or
/// release a generation slot; `cache` is held for the whole generation.
pub struct EngineState {
    backend: LlamaBackend,
    cache: Mutex<Option<CachedModel>>,
    active_request: Mutex<Option<String>>,
    cancel: Arc<AtomicBool>,
}

impl EngineState {
    pub fn new() -> AtlasResult<Self> {
        Ok(Self {
            backend: LlamaBackend::init()
                .map_err(|error| AtlasError::context("Could not start the ATLAS engine", error))?,
            cache: Mutex::new(None),
            active_request: Mutex::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
        })
    }
}

struct GenerationClaim<'a> {
    state: &'a EngineState,
}

impl<'a> GenerationClaim<'a> {
    fn acquire(state: &'a EngineState, request_id: &str) -> AtlasResult<Self> {
        let mut active = state
            .active_request
            .lock()
            .map_err(|_| AtlasError::new("The engine state is unavailable."))?;
        if active.is_some() {
            return Err(AtlasError::new(
                "ATLAS is already generating a response. Stop it or wait for it to finish.",
            ));
        }
        *active = Some(request_id.to_string());
        state.cancel.store(false, Ordering::SeqCst);
        Ok(Self { state })
    }
}

impl Drop for GenerationClaim<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.state.active_request.lock() {
            *active = None;
        }
    }
}

/// Manual ChatML formatting used when a GGUF file carries no chat template.
fn fallback_chatml(messages: &[(String, String)]) -> String {
    let mut prompt = String::new();
    for (role, content) in messages {
        prompt.push_str(&format!("<|im_start|>{role}\n{content}<|im_end|>\n"));
    }
    prompt.push_str("<|im_start|>assistant\n");
    prompt
}

/// Build the model-ready prompt, applying the model's own chat template when present.
fn build_prompt(model: &LlamaModel, messages: &[(String, String)]) -> AtlasResult<String> {
    match model.chat_template(None) {
        Ok(template) => {
            let chat = messages
                .iter()
                .map(|(role, content)| LlamaChatMessage::new(role.clone(), content.clone()))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| {
                    AtlasError::context("A message contains unsupported characters", error)
                })?;
            model
                .apply_chat_template(&template, &chat, true)
                .map_err(|error| {
                    AtlasError::context("Could not apply the model's chat template", error)
                })
        }
        Err(_) => Ok(fallback_chatml(messages)),
    }
}

/// Assemble system + recent turns, dropping the oldest complete turns until
/// the prompt fits the context window. Returns the messages and the output
/// token budget actually available.
fn fit_messages(
    model: &LlamaModel,
    system_prompt: &str,
    messages: &[ChatMessage],
    context_size: usize,
    max_tokens: usize,
) -> AtlasResult<(Vec<(String, String)>, usize)> {
    let mut history: Vec<(String, String)> = messages
        .iter()
        .map(|message| (message.role.clone(), message.content.clone()))
        .collect();

    loop {
        let mut assembled = Vec::with_capacity(history.len() + 1);
        if !system_prompt.trim().is_empty() {
            assembled.push(("system".to_string(), system_prompt.trim().to_string()));
        }
        assembled.extend(history.iter().cloned());

        let prompt_tokens = model
            .vocab()
            .tokenize(build_prompt(model, &assembled)?.as_bytes(), true, true)
            .len();
        let budget = context_size.saturating_sub(prompt_tokens);
        if budget >= 1 {
            return Ok((assembled, max_tokens.min(budget)));
        }
        if history.len() <= 1 {
            return Err(AtlasError::new(
                "The latest message is too long for the configured context window.",
            ));
        }
        // Drop the oldest full turn (user message plus its assistant reply).
        history.remove(0);
        if history.first().is_some_and(|(role, _)| role == "assistant") {
            history.remove(0);
        }
    }
}

fn build_sampler(settings: &GenerationSettings) -> LlamaSampler {
    if settings.temperature <= 0.0 {
        return LlamaSampler::chain_simple([LlamaSampler::greedy()]);
    }
    LlamaSampler::chain_simple([
        LlamaSampler::top_p(settings.top_p, 1),
        LlamaSampler::temp(settings.temperature),
        LlamaSampler::dist(1337),
    ])
}

/// Split a byte buffer into its valid UTF-8 prefix, keeping any incomplete
/// trailing sequence in the buffer for the next token piece.
fn drain_valid_utf8(buffer: &mut Vec<u8>) -> String {
    loop {
        match std::str::from_utf8(buffer) {
            Ok(valid) => {
                let text = valid.to_string();
                buffer.clear();
                return text;
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                if valid_up_to > 0 {
                    return String::from_utf8(buffer.drain(..valid_up_to).collect())
                        .unwrap_or_default();
                }
                if error.error_len().is_some() {
                    buffer.remove(0);
                    continue;
                }
                return String::new();
            }
        }
    }
}

fn generate(
    app: &AppHandle,
    request_id: &str,
    conversation_id: &str,
    model_path: PathBuf,
    messages: Vec<ChatMessage>,
    settings: GenerationSettings,
) -> AtlasResult<String> {
    let state = app.state::<EngineState>();
    let _claim = GenerationClaim::acquire(&state, request_id)?;
    let cancel = state.cancel.clone();

    // Hold the cache lock for the whole generation so the loaded model cannot
    // be swapped out mid-request, and so generations stay single-flight.
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| AtlasError::new("The model cache is unavailable."))?;
    let needs_load = cache
        .as_ref()
        .is_none_or(|cached| cached.path != model_path);
    if needs_load {
        let model =
            LlamaModel::load_from_file(&state.backend, &model_path, &LlamaModelParams::default())
                .map_err(|error| {
                AtlasError::context("Could not load the selected GGUF model", error)
            })?;
        *cache = Some(CachedModel {
            path: model_path,
            model,
        });
    }
    if cancel.load(Ordering::Relaxed) {
        return Ok(String::new());
    }
    let model = &cache.as_ref().expect("model was just loaded").model;

    let context_size = (settings.context_size as usize)
        .min(model.n_ctx_train() as usize)
        .max(256);
    let (fitted, max_tokens) = fit_messages(
        model,
        &settings.system_prompt,
        &messages,
        context_size,
        settings.max_tokens,
    )?;
    let prompt = build_prompt(model, &fitted)?;
    let tokens = model.vocab().tokenize(prompt.as_bytes(), true, true);
    if tokens.is_empty() {
        return Err(AtlasError::new("The message could not be tokenized."));
    }

    let context_params = LlamaContextParams::default().with_n_ctx(Some(
        NonZeroU32::new(context_size as u32)
            .ok_or_else(|| AtlasError::new("Invalid context size."))?,
    ));
    let mut context = model
        .new_context(&state.backend, context_params)
        .map_err(|error| AtlasError::context("Could not create a model session", error))?;

    let mut batch = LlamaBatch::new(tokens.len().max(512), 1);
    let last_index = (tokens.len() - 1) as i32;
    for (position, token) in (0_i32..).zip(tokens) {
        batch
            .add(token, position, &[0], position == last_index)
            .map_err(|error| AtlasError::context("Could not prepare the prompt", error))?;
    }
    context
        .decode(&mut batch)
        .map_err(|error| AtlasError::context("The model could not process the message", error))?;

    let mut sampler = build_sampler(&settings);
    let mut utf8_tail: Vec<u8> = Vec::new();
    let mut full_response = String::new();
    for position in (batch.n_tokens()..).take(max_tokens) {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let token = sampler.sample(&context, batch.n_tokens() - 1);
        sampler.accept(token);
        if model.vocab().is_eog(token) {
            break;
        }
        utf8_tail.extend(model.vocab().token_to_piece(token, true, None));
        let text = drain_valid_utf8(&mut utf8_tail);
        if !text.is_empty() {
            full_response.push_str(&text);
            let _ = app.emit(
                TOKEN_EVENT,
                TokenPayload {
                    request_id: request_id.to_string(),
                    conversation_id: conversation_id.to_string(),
                    token: text,
                },
            );
        }
        batch.clear();
        batch
            .add(token, position, &[0], true)
            .map_err(|error| AtlasError::context("Could not continue the response", error))?;
        context
            .decode(&mut batch)
            .map_err(|error| AtlasError::context("The model stopped unexpectedly", error))?;
    }

    // Untrimmed so the saved message matches exactly what was streamed.
    Ok(full_response)
}

#[tauri::command]
pub async fn generate_response(
    app: AppHandle,
    request_id: String,
    conversation_id: String,
    model_id: String,
    messages: Vec<ChatMessage>,
    settings: GenerationSettings,
) -> AtlasResult<String> {
    if messages.is_empty() || messages.last().is_none_or(|message| message.role != "user") {
        return Err(AtlasError::new("A local response needs a user message."));
    }
    let model_path = models::model_path(&app, &model_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        generate(
            &app,
            &request_id,
            &conversation_id,
            model_path,
            messages,
            settings,
        )
    })
    .await
    .map_err(|error| AtlasError::context("The generation task did not complete", error))?
}

#[tauri::command]
pub fn stop_generation(app: AppHandle, request_id: String) {
    let state = app.state::<EngineState>();
    if let Ok(active) = state.active_request.lock()
        && active.as_deref() == Some(request_id.as_str())
    {
        state.cancel.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chatml_fallback_format() {
        let messages = vec![
            ("system".to_string(), "sys".to_string()),
            ("user".to_string(), "hi".to_string()),
        ];
        let prompt = fallback_chatml(&messages);
        assert!(prompt.starts_with("<|im_start|>system\nsys<|im_end|>"));
        assert!(prompt.ends_with("<|im_start|>assistant\n"));
    }

    #[test]
    fn utf8_drain_handles_split_sequences() {
        let mut buffer = vec![0xE2, 0x82]; // incomplete '€'
        assert_eq!(drain_valid_utf8(&mut buffer), "");
        buffer.push(0xAC);
        assert_eq!(drain_valid_utf8(&mut buffer), "€");
        assert!(buffer.is_empty());
    }

    #[test]
    fn utf8_drain_skips_invalid_bytes() {
        let mut buffer = vec![0xFF, b'a'];
        assert_eq!(drain_valid_utf8(&mut buffer), "a");
    }
}
