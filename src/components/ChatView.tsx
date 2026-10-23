import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Conversation, GenerationSettings, LocalModel } from "../types";
import { ChatSettings } from "./ChatSettings";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { MessageItem } from "./MessageItem";

interface Props {
  conversation: Conversation | null;
  models: LocalModel[];
  defaultModelId: string | null;
  streamingText: string | null;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onSelectModel: (modelId: string) => void;
  onUpdateSettings: (settings: GenerationSettings) => void;
  onGoToModels: () => void;
}

const SUGGESTIONS = [
  { title: "Plan a project", prompt: "Help me plan a small software project from idea to first release." },
  { title: "Explain simply", prompt: "Explain how a large language model works, in plain language." },
  { title: "Write and improve", prompt: "Help me write a short, friendly project README introduction." },
];

export function ChatView({
  conversation,
  models,
  defaultModelId,
  streamingText,
  streaming,
  onSend,
  onStop,
  onRegenerate,
  onSelectModel,
  onUpdateSettings,
  onGoToModels,
}: Props) {
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const selectedModelId =
    conversation?.modelId ?? (models.some((m) => m.id === defaultModelId) ? defaultModelId : null) ?? models[0]?.id ?? null;
  const isEmpty = !conversation || conversation.messages.length === 0;

  // Reset scroll position and close popovers before paint on chat switch.
  useLayoutEffect(() => {
    setSettingsOpen(false);
    nearBottom.current = true;
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [conversation?.id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && nearBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [conversation?.messages.length, streamingText]);

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    onSend(text);
  };

  return (
    <section className="chat-view">
      <header className="chat-topbar">
        <div className="chat-topbar-left">
          {models.length > 0 ? (
            <select
              className="model-select"
              value={selectedModelId ?? ""}
              onChange={(event) => onSelectModel(event.target.value)}
              disabled={!conversation}
              aria-label="Active model"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.fileName.replace(/\.gguf$/i, "")}
                </option>
              ))}
            </select>
          ) : (
            <button className="model-empty-cta" onClick={onGoToModels}>
              Choose a model
            </button>
          )}
          {conversation && (
            <button
              className="icon-btn"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Conversation settings"
              aria-expanded={settingsOpen}
            >
              <Icon name="settings" size={16} />
            </button>
          )}
        </div>
        <div className="local-badge">
          <span className="local-dot" /> Local only
        </div>
      </header>

      {settingsOpen && conversation && (
        <ChatSettings
          settings={conversation.settings}
          onChange={onUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {isEmpty ? (
          <div className="chat-empty">
            <div className="chat-hero">
              <Icon name="spark" size={26} />
            </div>
            <h1>How can I help?</h1>
            <p>Private, local AI. Your chats and models never leave this device.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion.title} onClick={() => setDraft(suggestion.prompt)}>
                  {suggestion.title}
                </button>
              ))}
            </div>
            {models.length === 0 && (
              <button className="model-empty-cta large" onClick={onGoToModels}>
                Add a GGUF model to begin
              </button>
            )}
          </div>
        ) : (
          <div className="msg-list">
            {conversation.messages.map((message, index) => (
              <MessageItem
                key={`${message.createdAt}-${index}`}
                message={message}
                isLastAssistant={
                  message.role === "assistant" &&
                  index === conversation.messages.length - 1 &&
                  !streaming
                }
                canRegenerate={!streaming}
                onRegenerate={onRegenerate}
              />
            ))}
            {streaming && (
              <article className="msg msg-assistant">
                <div className="msg-avatar">
                  <Icon name="spark" size={15} />
                </div>
                <div className="msg-body">
                  <div className="msg-meta">
                    <span className="msg-role">ATLAS</span>
                  </div>
                  {streamingText ? (
                    <>
                      <Markdown>{streamingText}</Markdown>
                      <span className="stream-caret" />
                    </>
                  ) : (
                    <p className="msg-thinking">
                      Loading model<span className="dots" />
                    </p>
                  )}
                </div>
              </article>
            )}
          </div>
        )}
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        onStop={onStop}
        streaming={streaming}
        disabled={models.length === 0}
      />
    </section>
  );
}
