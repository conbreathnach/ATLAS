# ATLAS

A private, local-first AI desktop app for Windows. ATLAS runs open-weight models entirely on your machine — no accounts, no cloud, no separate server process. One installer, one app.

![stack](https://img.shields.io/badge/stack-Tauri%202%20%C2%B7%20React%2019%20%C2%B7%20llama.cpp-c8f759)

## Features

- **Streaming chat** — token-by-token responses rendered live, with a stop button
- **Embedded inference** — llama.cpp runs inside the app via Rust bindings; no Ollama, LM Studio, or Open WebUI required
- **Proper chat templates** — each model's own GGUF chat template is applied, with a ChatML fallback
- **Markdown rendering** — headings, lists, tables, and syntax-highlighted code blocks with copy buttons
- **Model library** — import GGUF files, set a default model, remove models; ATLAS manages its own storage
- **Persistent conversations** — create, rename, delete, and search chats; history survives restarts
- **Per-conversation tuning** — system prompt, temperature, top-p, max tokens, context size
- **Keyboard shortcuts** — `Ctrl+N` new chat, `Ctrl+K` search, `Ctrl+M` models, `Ctrl+,` settings
- **Themes** — Dark, Black, and Light themes with four accent colors, applied instantly
- **App-wide LLM defaults** — system prompt, sampling, and context defaults for new chats, plus per-conversation overrides
- **Reasoning-block rendering** — `<think>` output collapses into an expandable "Thought for a moment" block
- **Fence repair** — nested same-length code fences (common in model templates) are rebalanced before rendering
- **Self-healing storage** — atomic writes; corrupted data files are quarantined instead of crashing

## Architecture

```
ATLAS (single Windows app)
├── React 19 + TypeScript frontend
│   ├── components/   Sidebar, ChatView, Composer, Markdown, ModelsView, SearchView…
│   ├── hooks/        useConversations, useModels, useSettings, useToast
│   └── api.ts        typed bridge to native commands
└── Rust + Tauri native core
    ├── engine.rs     llama.cpp: cached model, chat templates, token streaming, cancellation
    ├── chats.rs      conversation persistence and validation
    ├── models.rs     GGUF library management
    ├── settings.rs   app settings (default model)
    └── storage.rs    atomic JSON + corruption recovery
```

Data lives in the ATLAS application-data directory (`models\`, `models.json`, `conversations.json`, `settings.json`). Nothing leaves the device.

## Development

Prerequisites: Node.js, [Rust](https://www.rust-lang.org/tools/install), and LLVM (for `libclang`, used to build the llama.cpp bindings).

```powershell
npm install
npm run tauri dev        # run the app in development
cargo test --manifest-path src-tauri\Cargo.toml   # native unit tests
npm run tauri build      # produce the Windows installer
```

The installer is written to the Cargo target directory under `release\bundle\nsis\` (`ATLAS_<version>_x64-setup.exe`).

## Using a model

1. Download a GGUF model (e.g. a small instruct model such as Qwen, Llama, or Mistral from Hugging Face).
2. In ATLAS: **Models → Add model** and select the file.
3. Click **New chat** and start typing.

Smaller quantized models (Q4_K_M, ~4B parameters or fewer) run best on CPU.
