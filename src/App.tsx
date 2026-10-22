import { FormEvent, useState } from "react";
import "./App.css";

type View = "chat" | "search" | "models";

const conversations = [
  { title: "Getting started with ATLAS", time: "Now" },
  { title: "Local model comparison", time: "Yesterday" },
  { title: "Ideas for a research workflow", time: "Yesterday" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    chat: "M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.8 4.1c-.5.4-1.2.1-1.2-.5V15.2A3.5 3.5 0 0 1 4 11.5v-6Z",
    search: "m20 20-4.3-4.3m1.3-5.2a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
    models: "M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-13ZM9 7h6m-6 4h6m-6 4h3",
    plus: "M12 5v14M5 12h14",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    arrow: "m10 17 5-5-5-5",
    spark: "m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z",
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={paths[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function App() {
  const [view, setView] = useState<View>("chat");
  const [prompt, setPrompt] = useState("");
  const [hasModel, setHasModel] = useState(false);
  const [notice, setNotice] = useState("");

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) return;

    setNotice(
      hasModel
        ? "The built-in ATLAS runtime will process this message once inference is connected."
        : "Add a GGUF model from the Models tab before starting a local conversation.",
    );
    setPrompt("");
  }

  function addModel() {
    setHasModel(true);
    setNotice("A model slot was added. Model-file import will be connected to the built-in ATLAS runtime.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="spark" /></span>
          <span>ATLAS</span>
        </div>

        <button className="new-chat" onClick={() => setView("chat")}>
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
          {conversations.map((conversation) => (
            <button key={conversation.title} className="conversation" onClick={() => setView("chat")}>
              <span>{conversation.title}</span>
              <small>{conversation.time}</small>
            </button>
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
              <button className="model-picker" onClick={() => setView("models")}>
                {hasModel ? "ATLAS Local Model" : "Choose a model"} <span>⌄</span>
              </button>
              <div className="runtime-status"><span /> Local only</div>
            </header>

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

            <form className="composer" onSubmit={submitPrompt}>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Message ATLAS..." rows={1} />
              <button type="submit" aria-label="Send message"><Icon name="arrow" /></button>
              {notice && <p className="notice">{notice}</p>}
              <span>ATLAS can make mistakes. Check important information.</span>
            </form>
          </section>
        )}

        {view === "search" && (
          <section className="centered-view">
            <div className="section-label">LOCAL SEARCH</div>
            <h1>Search your workspace</h1>
            <p>Search stays private and will run through ATLAS once local indexing is enabled.</p>
            <div className="search-box"><Icon name="search" /><input placeholder="Search chats and local documents" /><kbd>⌘ K</kbd></div>
          </section>
        )}

        {view === "models" && (
          <section className="models-view">
            <header className="models-header">
              <div><div className="section-label">ATLAS ENGINE</div><h1>Models</h1><p>Manage the models used by this device. Nothing runs outside ATLAS.</p></div>
              <button className="accent-button" onClick={addModel}><Icon name="plus" /> Add model</button>
            </header>
            <div className="engine-card">
              <div className="engine-icon"><Icon name="models" /></div>
              <div><strong>Built-in inference engine</strong><p>ATLAS will bundle and manage its own local runtime and GGUF models.</p></div>
              <span className="engine-badge">Ready for setup</span>
            </div>
            <div className="library-heading"><h2>Model library</h2><span>{hasModel ? "1 model" : "No models yet"}</span></div>
            {hasModel ? (
              <div className="model-card">
                <div className="model-avatar">A</div>
                <div><strong>ATLAS local model</strong><p>Awaiting model file import</p></div>
                <button className="text-button">Configure</button>
              </div>
            ) : (
              <div className="empty-library">
                <div className="library-icon"><Icon name="models" /></div>
                <h2>Your model library is empty</h2>
                <p>Add a compatible GGUF model to chat completely offline.</p>
                <button className="accent-button" onClick={addModel}><Icon name="plus" /> Add your first model</button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
