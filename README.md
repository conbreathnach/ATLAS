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

The initial repository establishes the desktop shell and model-management interface. The `runtime_status` Tauri command is the native boundary where the bundled inference engine and GGUF model import pipeline will be connected.
