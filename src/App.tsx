import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

type View = "chat" | "search" | "models";

type LocalModel = {
  id: string;
  fileName: string;
  sizeBytes: number;
  importedAt: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
};

type SearchResult = {
  conversationId: string;
  title: string;
  snippet: string;
  updatedAt: number;
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    search: "m20 20-4.3-4.3m1.3-5.2a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
    models: "M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-13ZM9 7h6m-6 4h6m-6 4h3",
    plus: "M12 5v14M5 12h14",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    arrow: "m10 17 5-5-5-5",
    spark: "m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z",
    trash: "M3 6h18M8 6v-1.2c0-.9.7-1.8 1.8-1.8h4.4c1.1 0 1.8.9 1.8 1.8V6m-1 0v13c0 1.1-.9 2-2 2H11c-1.1 0-2-.9-2-2V6m2 4v7m4-7v7",
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={paths[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatFileSize(sizeBytes: number) {
  return `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatRelativeTime(timestamp: number) {
  const elapsedSeconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
  if (elapsedSeconds < 60) return "Now";
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function isDesktopApp() {
  return "__TAURI_INTERNALS__" in window;
}

function App() {
  const [view, setView] = useState<View>("chat");
  const [prompt, setPrompt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [models, setModels] = useState<LocalModel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  const hasModel = models.length > 0;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const selectedModel = models.find((model) => model.id === activeConversation?.modelId) ?? models[0] ?? null;

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return conversations
      .flatMap((conversation) => {
        const fromTitle = conversation.title.toLowerCase().includes(query)
          ? [{
            conversationId: conversation.id,
            title: conversation.title,
            snippet: conversation.messages[0]?.content ?? "Conversation title match",
            updatedAt: conversation.updatedAt,
          }]
          : [];
        const fromMessages = conversation.messages
          .filter((message) => message.content.toLowerCase().includes(query))
          .slice(0, 3)
          .map((message) => ({
            conversationId: conversation.id,
            title: conversation.title,
            snippet: message.content,
            updatedAt: conversation.updatedAt,
          }));
        return [...fromTitle, ...fromMessages];
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 20);
  }, [conversations, searchQuery]);

  const loadModels = useCallback(async () => {
    if (!isDesktopApp()) return;

    try {
      setModels(await invoke<LocalModel[]>("list_models"));
    } catch (error) {
      setNotice(`Could not load the local model library: ${String(error)}`);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    if (!isDesktopApp()) return;

    try {
      const savedConversations = await invoke<Conversation[]>("list_conversations");
      setConversations(savedConversations);
      setActiveConversationId((currentId) =>
        savedConversations.some((conversation) => conversation.id === currentId)
          ? currentId
          : (savedConversations[0]?.id ?? null),
      );
    } catch (error) {
      setNotice(`Could not load local conversations: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    void loadModels();
    void loadConversations();
  }, [loadConversations, loadModels]);

  async function upsertConversation(conversation: Conversation) {
    const savedConversation = await invoke<Conversation>("save_conversation", { conversation });
    setConversations((currentConversations) => {
      const hasConversation = currentConversations.some((currentConversation) => currentConversation.id === savedConversation.id);
      const nextConversations = hasConversation
        ? currentConversations.map((currentConversation) =>
          currentConversation.id === savedConversation.id ? savedConversation : currentConversation)
        : [savedConversation, ...currentConversations];
      return nextConversations.sort((left, right) => right.updatedAt - left.updatedAt);
    });
    return savedConversation;
  }

  async function createConversation() {
    setView("chat");
    if (!isDesktopApp()) {
      setNotice("Open ATLAS as a desktop app to create a local conversation.");
      return;
    }

    try {
      const conversation = await invoke<Conversation>("create_conversation");
      setConversations((currentConversations) =>
        [conversation, ...currentConversations.filter((currentConversation) => currentConversation.id !== conversation.id)]);
      setActiveConversationId(conversation.id);
      setNotice("");
    } catch (error) {
      setNotice(`Could not create the conversation: ${String(error)}`);
    }
  }

  async function deleteConversation(conversationId: string) {
    if (!isDesktopApp()) return;

    try {
      setDeletingConversationId(conversationId);
      await invoke("delete_conversation", { conversationId });
      setConversations((currentConversations) => {
        const nextConversations = currentConversations.filter((conversation) => conversation.id !== conversationId);
        if (activeConversationId === conversationId) {
          setActiveConversationId(nextConversations[0]?.id ?? null);
        }
        return nextConversations;
      });
      setNotice("");
    } catch (error) {
      setNotice(`Could not delete the conversation: ${String(error)}`);
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function selectModelForActiveConversation(modelId: string) {
    if (!activeConversation) {
      setNotice("Start a conversation before choosing a model.");
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      await upsertConversation({
        ...activeConversation,
        modelId,
        updatedAt: timestamp,
      });
      setNotice("");
    } catch (error) {
      setNotice(`Could not set the model for this conversation: ${String(error)}`);
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || isGenerating) return;
    if (!selectedModel) {
      setNotice("Add a GGUF model from the Models tab before starting a local conversation.");
      return;
    }
    if (!isDesktopApp()) {
      setNotice("Open ATLAS as a desktop app to run a local model.");
      return;
    }

    let conversation = activeConversation;
    if (!conversation) {
      try {
        conversation = await invoke<Conversation>("create_conversation");
        setConversations((currentConversations) =>
          [conversation!, ...currentConversations.filter((currentConversation) => currentConversation.id !== conversation!.id)]);
        setActiveConversationId(conversation.id);
      } catch (error) {
        setNotice(`Could not create the conversation: ${String(error)}`);
        return;
      }
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const updatedConversation: Conversation = {
      ...conversation,
      title: conversation.messages.length === 0 ? message.slice(0, 60) : conversation.title,
      modelId: selectedModel.id,
      messages: [...conversation.messages, { role: "user", content: message }],
      updatedAt: timestamp,
    };

    setPrompt("");
    setNotice("");
    setIsGenerating(true);

    try {
      const savedConversation = await upsertConversation(updatedConversation);
      const response = await invoke<string>("generate_response", {
        modelId: selectedModel.id,
        messages: savedConversation.messages,
      });
      await upsertConversation({
        ...savedConversation,
        messages: [...savedConversation.messages, { role: "assistant", content: response }],
        updatedAt: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      setNotice(`The local model could not answer: ${String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function addModel() {
    if (!isDesktopApp()) {
      setNotice("Open ATLAS as a desktop app to import a GGUF model.");
      return;
    }

    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: "GGUF model", extensions: ["gguf"] }],
      });
      if (!selectedPath || Array.isArray(selectedPath)) return;

      setIsImporting(true);
      const importedModel = await invoke<LocalModel>("import_model", { sourcePath: selectedPath });
      setModels((currentModels) => [...currentModels, importedModel]);
      setNotice(`${importedModel.fileName} is now stored in the ATLAS model library.`);
    } catch (error) {
      setNotice(`Could not import the model: ${String(error)}`);
    } finally {
      setIsImporting(false);
    }
  }

  async function deleteModel(modelId: string) {
    if (!isDesktopApp()) return;

    try {
      setDeletingModelId(modelId);
      await invoke("delete_model", { modelId });
      await Promise.all([loadModels(), loadConversations()]);
      setNotice("Model removed from the ATLAS local library.");
    } catch (error) {
      setNotice(`Could not remove the model: ${String(error)}`);
    } finally {
      setDeletingModelId(null);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="spark" /></span>
          <span>ATLAS</span>
        </div>

        <button className="new-chat" onClick={() => void createConversation()}>
          <Icon name="plus" /> New chat
        </button>

        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={view === "search" ? "active" : ""} onClick={() => setView("search")}>
            <Icon name="search" /> Search
          </button>
          <button className={view === "models" ? "active" : ""} onClick={() => setView("models")}>
            <Icon name="models" /> Models
          </button>
        </nav>

        <div className="history">
          <p>RECENT</p>
          {conversations.length === 0 && <small className="history-empty">No chats yet</small>}
          {conversations.map((conversation) => (
            <div key={conversation.id} className={`conversation-row ${conversation.id === activeConversationId ? "active" : ""}`}>
              <button
                className="conversation"
                onClick={() => {
                  setActiveConversationId(conversation.id);
                  setView("chat");
                  setNotice("");
                }}
              >
                <span>{conversation.title}</span>
                <small>{formatRelativeTime(conversation.updatedAt)}</small>
              </button>
              <button
                className="conversation-delete"
                aria-label="Delete conversation"
                disabled={deletingConversationId === conversation.id}
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteConversation(conversation.id);
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>

        <div className="account">
          <div className="avatar">C</div>
          <div><strong>Local user</strong><span>Offline workspace</span></div>
          <Icon name="dots" />
        </div>
      </aside>

      <main className="main-panel">
        {view === "chat" && (
          <section className="chat-view">
            <header className="topbar">
              <div className="topbar-left">
                {hasModel ? (
                  <select
                    className="model-select"
                    value={selectedModel?.id ?? ""}
                    onChange={(event) => void selectModelForActiveConversation(event.currentTarget.value)}
                    disabled={!activeConversation}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>{model.fileName}</option>
                    ))}
                  </select>
                ) : (
                  <button className="model-picker" onClick={() => setView("models")}>
                    Choose a model <span>⌄</span>
                  </button>
                )}
                {activeConversation && (
                  <button
                    className="danger-ghost"
                    disabled={deletingConversationId === activeConversation.id}
                    onClick={() => void deleteConversation(activeConversation.id)}
                  >
                    Delete chat
                  </button>
                )}
              </div>
              <div className="runtime-status"><span /> Local only</div>
            </header>

            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="empty-chat">
                <div className="hero-mark"><Icon name="spark" /></div>
                <h1>How can I help you today?</h1>
                <p>Private, local AI. Your chats and models stay on this device.</p>
                <div className="suggestions">
                  <button onClick={() => setPrompt("Help me plan a project")}>Help me plan a project <Icon name="arrow" /></button>
                  <button onClick={() => setPrompt("Explain a complex topic simply")}>Explain a complex topic simply <Icon name="arrow" /></button>
                  <button onClick={() => setView("models")}>Set up a local model <Icon name="arrow" /></button>
                </div>
              </div>
            ) : (
              <div className="message-list">
                {activeConversation.messages.map((message, index) => (
                  <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                    <span className="message-label">{message.role === "user" ? "You" : "ATLAS"}</span>
                    <p>{message.content}</p>
                  </article>
                ))}
                {isGenerating && (
                  <article className="message assistant">
                    <span className="message-label">ATLAS</span>
                    <p className="thinking">Thinking locally...</p>
                  </article>
                )}
              </div>
            )}

            <form className="composer" onSubmit={submitPrompt}>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Message ATLAS..."
                rows={1}
              />
              <button type="submit" aria-label="Send message" disabled={isGenerating}><Icon name="arrow" /></button>
              {notice && <p className="notice">{notice}</p>}
              <span>ATLAS can make mistakes. Check important information.</span>
            </form>
          </section>
        )}

        {view === "search" && (
          <section className="centered-view">
            <div className="section-label">LOCAL SEARCH</div>
            <h1>Search saved chats</h1>
            <p>Everything stays on-device. Search runs only against your local ATLAS conversation history.</p>
            <div className="search-box">
              <Icon name="search" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search by title or message text"
              />
            </div>
            <div className="search-results">
              {searchQuery.trim() && searchResults.length === 0 && <p className="search-empty">No matching chats found.</p>}
              {searchResults.map((result, index) => (
                <button
                  key={`${result.conversationId}-${index}`}
                  className="search-result"
                  onClick={() => {
                    setActiveConversationId(result.conversationId);
                    setView("chat");
                  }}
                >
                  <strong>{result.title}</strong>
                  <p>{result.snippet}</p>
                  <small>{formatRelativeTime(result.updatedAt)}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "models" && (
          <section className="models-view">
            <header className="models-header">
              <div>
                <div className="section-label">ATLAS ENGINE</div>
                <h1>Models</h1>
                <p>Manage the models used by this device. Nothing runs outside ATLAS.</p>
              </div>
              <button className="accent-button" onClick={() => void addModel()} disabled={isImporting}>
                <Icon name="plus" /> {isImporting ? "Importing..." : "Add model"}
              </button>
            </header>

            <div className="engine-card">
              <div className="engine-icon"><Icon name="models" /></div>
              <div><strong>Built-in inference engine</strong><p>ATLAS manages imported GGUF files in its private local library.</p></div>
              <span className="engine-badge">{hasModel ? "Model ready" : "Needs a model"}</span>
            </div>

            <div className="library-heading">
              <h2>Model library</h2>
              <span>{hasModel ? `${models.length} ${models.length === 1 ? "model" : "models"}` : "No models yet"}</span>
            </div>

            {hasModel ? (
              <div className="model-list">
                {models.map((model) => (
                  <div className="model-card" key={model.id}>
                    <div className="model-avatar">A</div>
                    <div>
                      <strong>{model.fileName}</strong>
                      <p>{formatFileSize(model.sizeBytes)} · Stored in ATLAS</p>
                    </div>
                    <div className="model-actions">
                      <button className="text-button" onClick={() => void selectModelForActiveConversation(model.id)}>
                        Use
                      </button>
                      <button
                        className="danger-ghost"
                        disabled={deletingModelId === model.id}
                        onClick={() => void deleteModel(model.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-library">
                <div className="library-icon"><Icon name="models" /></div>
                <h2>Your model library is empty</h2>
                <p>Add a compatible GGUF model to chat completely offline.</p>
                <button className="accent-button" onClick={() => void addModel()} disabled={isImporting}>
                  <Icon name="plus" /> {isImporting ? "Importing..." : "Add your first model"}
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
