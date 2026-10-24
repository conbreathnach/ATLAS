# ATLAS

A private, local-first AI desktop app for Windows. ATLAS runs open-weight models entirely on your machine — no accounts, no cloud, no separate server process. One installer, one app.

![stack](https://img.shields.io/badge/stack-Tauri%202%20%C2%B7%20React%2019%20%C2%B7%20llama.cpp-c8f759)

---

## Quick start

### 1. Install ATLAS

Grab the installer from [**Releases**](../../releases/latest):

| Platform | File | Notes |
|---|---|---|
| **Windows** | `…_x64-setup.exe` | Available now. SmartScreen may prompt for unsigned apps: **More info → Run anyway** |
| **macOS / Linux** | planned | Not yet available — watch Releases for future builds |

Then launch ATLAS. There is nothing else to install: no Ollama, no Docker, no Python, no server.

### 2. Add a model

ATLAS runs **GGUF** models (the standard format for local LLMs). If you don't have one yet:

1. Go to [Hugging Face](https://huggingface.co/models?library=gguf&sort=downloads) and pick a model — good starters:
   - **Qwen 2.5 / Qwen 3 (3–4B, Q4_K_M)** — fast on CPU, good quality, supports reasoning mode
   - **Llama 3.2 (3B, Q4_K_M)** — small and quick
   - **Mistral 7B (Q4_K_M)** — better answers, slower on CPU
2. Download the `.gguf` file (the `Q4_K_M` variant is the best size/quality balance for CPU).
3. In ATLAS, open **Models** (sidebar) → **Add model** → select the downloaded file.

ATLAS copies the file into its own library — you can delete the original download afterwards.

> **Rule of thumb:** a model needs roughly its file size in free RAM. A 4B Q4 model is ~2.5 GB and runs comfortably on most machines; 7–8B needs ~5 GB and patience on CPU.

### 3. Chat

1. Click **New chat** (or `Ctrl+N`).
2. Type a message and press **Enter** (`Shift+Enter` for a new line).
3. Watch the answer stream in, token by token. Click the **stop button** any time to cut it off.

The model name in the top-left shows which model the chat uses — switch it any time from the dropdown.

---

## Doing everything

### Chats

| Action | How |
|---|---|
| New chat | `Ctrl+N` or the **New chat** button |
| Switch chats | Click one in the sidebar (grouped by Today / Yesterday / Previous 7 days) |
| Rename | Double-click its title in the sidebar (or hover → pencil icon) |
| Delete | Hover a chat → trash icon |
| Erase everything | **Settings → Data → Erase all conversations** (asks twice) |
| Search | `Ctrl+K` or **Search chats** — matches titles and message text, click a result to jump in |
| Regenerate the last answer | Hover the answer → retry icon |
| Copy a message | Hover it → copy icon |

Chats are saved automatically as you go. Closing the app mid-answer keeps whatever was generated.

### Reasoning models ("thinking")

Models like Qwen 3 emit a hidden reasoning trace. ATLAS renders it as a collapsed **"Thought for a moment"** row — click it to expand and read the trace. While generating, it stays open with a shimmer so you can watch it think.

### Formatting

Responses render full Markdown: headings, lists, tables, links, and code blocks with a language label, syntax highlighting, and a copy button.

### Per-chat settings

Click the **gear icon** next to the model name (top bar) to tune just that conversation:

- **System prompt** — e.g. "You are a terse senior Rust reviewer"
- **Temperature** — 0 = deterministic, higher = more creative
- **Top P** — nucleus sampling cutoff
- **Max response tokens** — cap on answer length (keep ≥ 2048 for reasoning models; thinking spends tokens before the answer)
- **Context window** — how much history the model can see; older turns are dropped automatically when full

### App-wide settings

Open **Settings** (`Ctrl+,` or sidebar):

- **Appearance** — Dark, Black (pure black), or Light theme, plus four accent colors. Applies instantly.
- **Assistant defaults** — default model and generation defaults inherited by every *new* chat.
- **Data** — erase all conversations.

### Models

**Models** (`Ctrl+M`) shows your library:

- **Add model** — import another `.gguf`
- **Use in chat** — starts a new chat with that model
- **Set default** — new chats pre-select it
- **Remove** — deletes ATLAS's copy and detaches it from existing chats

### Where your data lives

Everything is under `%APPDATA%\io.github.conbreathnach.atlas\`:

```
models\            imported GGUF files
models.json        model registry
conversations.json chat history
settings.json      theme, defaults
```

Delete the folder to fully reset ATLAS. Nothing is ever uploaded anywhere.

---

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl+N` | New chat |
| `Ctrl+K` | Search chats |
| `Ctrl+M` | Models |
| `Ctrl+,` | Settings |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Esc` | Clear search / cancel rename |

## Build from source

Prerequisites: Node.js, [Rust](https://www.rust-lang.org/tools/install), and [LLVM](https://releases.llvm.org/) (provides `libclang` for the llama.cpp bindings).

```powershell
git clone https://github.com/conbreathnach/ATLAS.git
cd ATLAS
npm install
npm run tauri dev        # run in development
npm test                 # frontend unit tests
cargo test --manifest-path src-tauri\Cargo.toml   # native unit tests
npm run tauri build      # produce the installer
```

The installer is written to the Cargo target directory under `release\bundle\nsis\`.

## Architecture

```
ATLAS (single Windows app)
├── React 19 + TypeScript frontend
│   ├── components/   Sidebar, ChatView, Composer, Markdown, ThinkBlock, ModelsView, SearchView, SettingsView…
│   ├── hooks/        useConversations, useModels, useSettings, useToast
│   ├── lib/          think-block parser, fence rebalancer, date grouping
│   └── api.ts        typed bridge to native commands
└── Rust + Tauri native core
    ├── engine.rs     llama.cpp: cached model, chat templates, token streaming, cancellation
    ├── chats.rs      conversation persistence and validation
    ├── models.rs     staged GGUF import, library management
    ├── settings.rs   app settings (theme, accent, defaults)
    └── storage.rs    atomic JSON writes + corruption recovery
```

## Feature summary

- **Streaming chat** — token-by-token responses rendered live, with a stop button
- **Embedded inference** — llama.cpp inside the app; no external runtime or server
- **Proper chat templates** — each model's own GGUF chat template, ChatML fallback
- **Thinking blocks** — collapsible reasoning traces for models that emit them
- **Fence repair** — nested code fences in model output are rebalanced before rendering
- **Themes & accents** — Dark / Black / Light, four accent colors
- **Persistent conversations** — rename, delete, search, grouped by date
- **Model library** — staged imports, default model, per-chat model override
- **Self-healing storage** — atomic writes; corrupted files are quarantined, not fatal
