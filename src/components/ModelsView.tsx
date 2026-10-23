import type { LocalModel } from "../types";
import { Icon } from "./Icon";

interface Props {
  models: LocalModel[];
  defaultModelId: string | null;
  importing: boolean;
  deletingId: string | null;
  onImport: () => void;
  onDelete: (modelId: string) => void;
  onSetDefault: (modelId: string | null) => void;
  onUseInChat: (modelId: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function ModelsView({
  models,
  defaultModelId,
  importing,
  deletingId,
  onImport,
  onDelete,
  onSetDefault,
  onUseInChat,
}: Props) {
  return (
    <section className="models-view">
      <header className="page-head">
        <div>
          <span className="page-label">Atlas engine</span>
          <h1>Models</h1>
          <p>Import and manage GGUF models. Everything is stored and run on this device.</p>
        </div>
        <button className="btn-primary" onClick={onImport} disabled={importing}>
          <Icon name="plus" size={15} />
          {importing ? "Importing…" : "Add model"}
        </button>
      </header>

      <div className="engine-card">
        <div className="engine-icon">
          <Icon name="cpu" size={20} />
        </div>
        <div className="engine-info">
          <strong>Built-in llama.cpp engine</strong>
          <p>Runs entirely inside ATLAS — no separate server, account, or network connection.</p>
        </div>
        <span className={`engine-badge ${models.length > 0 ? "ready" : ""}`}>
          {models.length > 0 ? "Ready" : "Needs a model"}
        </span>
      </div>

      <div className="library-head">
        <h2>Library</h2>
        <span>{models.length === 0 ? "Empty" : `${models.length} model${models.length === 1 ? "" : "s"}`}</span>
      </div>

      {models.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty-icon">
            <Icon name="models" size={22} />
          </div>
          <h2>Your library is empty</h2>
          <p>Import a GGUF model file (for example from Hugging Face) to start chatting offline.</p>
          <button className="btn-primary" onClick={onImport} disabled={importing}>
            <Icon name="plus" size={15} />
            {importing ? "Importing…" : "Add your first model"}
          </button>
        </div>
      ) : (
        <div className="model-grid">
          {models.map((model) => (
            <div className="model-card" key={model.id}>
              <div className="model-card-top">
                <div className="model-avatar">{model.fileName.slice(0, 1).toUpperCase()}</div>
                <div className="model-id">
                  <strong title={model.fileName}>{model.fileName.replace(/\.gguf$/i, "")}</strong>
                  <span>
                    {formatSize(model.sizeBytes)} · added{" "}
                    {new Date(model.importedAt * 1000).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {defaultModelId === model.id && <span className="default-badge">Default</span>}
              </div>
              <div className="model-card-actions">
                <button className="btn-ghost" onClick={() => onUseInChat(model.id)}>
                  Use in chat
                </button>
                {defaultModelId === model.id ? (
                  <button className="btn-ghost" onClick={() => onSetDefault(null)}>
                    Unset default
                  </button>
                ) : (
                  <button className="btn-ghost" onClick={() => onSetDefault(model.id)}>
                    Set default
                  </button>
                )}
                <button
                  className="btn-danger"
                  onClick={() => onDelete(model.id)}
                  disabled={deletingId === model.id}
                >
                  {deletingId === model.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
