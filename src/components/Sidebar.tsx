import { useState } from "react";
import type { Conversation, View } from "../types";
import { Icon } from "./Icon";

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  conversations: Conversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  modelCount: number;
}

function relativeTime(timestamp: number): string {
  const elapsed = Math.floor(Date.now() / 1000 - timestamp);
  if (elapsed < 60) return "now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`;
  return new Date(timestamp * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function Sidebar({
  view,
  onNavigate,
  conversations,
  activeId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  modelCount,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRenameConversation(editingId, editTitle);
    }
    setEditingId(null);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="spark" size={15} />
        </span>
        <span className="brand-name">ATLAS</span>
      </div>

      <button className="new-chat" onClick={onNewChat}>
        <Icon name="plus" size={16} /> New chat
        <kbd>Ctrl N</kbd>
      </button>

      <nav className="nav">
        <button
          className={view === "search" ? "active" : ""}
          onClick={() => onNavigate("search")}
        >
          <Icon name="search" size={16} /> Search
          <kbd>Ctrl K</kbd>
        </button>
        <button
          className={view === "models" ? "active" : ""}
          onClick={() => onNavigate("models")}
        >
          <Icon name="models" size={16} /> Models
          {modelCount > 0 && <span className="nav-count">{modelCount}</span>}
        </button>
      </nav>

      <div className="history">
        <p className="history-label">Chats</p>
        {conversations.length === 0 && <p className="history-empty">No conversations yet</p>}
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`history-row ${conversation.id === activeId && view === "chat" ? "active" : ""}`}
          >
            {editingId === conversation.id ? (
              <input
                className="history-rename"
                value={editTitle}
                autoFocus
                onChange={(event) => setEditTitle(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                className="history-item"
                onClick={() => onSelectConversation(conversation.id)}
                onDoubleClick={() => {
                  setEditingId(conversation.id);
                  setEditTitle(conversation.title);
                }}
                title={conversation.title}
              >
                <span>{conversation.title}</span>
                <small>{relativeTime(conversation.updatedAt)}</small>
              </button>
            )}
            <div className="history-actions">
              <button
                aria-label="Rename conversation"
                onClick={() => {
                  setEditingId(conversation.id);
                  setEditTitle(conversation.title);
                }}
              >
                <Icon name="pencil" size={12} />
              </button>
              <button
                aria-label="Delete conversation"
                onClick={() => onDeleteConversation(conversation.id)}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <footer className="sidebar-footer">
        <span className="local-dot" />
        <div>
          <strong>Local workspace</strong>
          <small>{modelCount === 0 ? "No models" : `${modelCount} model${modelCount === 1 ? "" : "s"}`} · private</small>
        </div>
      </footer>
    </aside>
  );
}
