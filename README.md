# ATLAS

ATLAS is a private, local-first AI desktop application. It uses a ChatGPT-inspired chat experience, an offline workspace search area, and a dedicated **Models** tab for managing the built-in inference engine and local GGUF models.

## Principles

- **One desktop app:** the UI, local model management, and eventual inference runtime belong to ATLAS rather than requiring a separately running model service.
- **Private by default:** chats, model files, and future indexes remain on the device.
- **Portable model format:** the model library is designed around GGUF files.

## Development

Install Node.js dependencies:

```powershell
npm install
```

ATLAS packages as a Windows application through Tauri, which requires the Rust toolchain. After installing [Rust](https://www.rust-lang.org/tools/install), launch the desktop app:

```powershell
npm run tauri dev
```

To create an installer:

```powershell
npm run tauri build
```

## Model library

Use **Models → Add model** to choose a GGUF file. ATLAS copies the file into its own application-data directory and keeps the library registry there, so it does not depend on the original file location.

ATLAS runs compatible imported models through its embedded llama.cpp engine. The initial engine is CPU-first, uses a 2,048-token context window, and generates up to 512 response tokens. GPU acceleration and downloadable models are future enhancements.
