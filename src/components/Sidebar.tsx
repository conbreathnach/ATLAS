import { useState } from "react";
import { groupByDate } from "../lib/format";
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
  const groups = groupByDate(conversations);

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

      <div className="sidebar-actions">
        <button className="side-action new-chat-action" onClick={onNewChat}>
          <Icon name="pencil" size={15} /> New chat
        </button>
        <button
          className={`side-action ${view === "search" ? "active" : ""}`}
          onClick={() => onNavigate("search")}
        >
          <Icon name="search" size={15} /> Search chats
        </button>
        <button
          className={`side-action ${view === "models" ? "active" : ""}`}
          onClick={() => onNavigate("models")}
        >
          <Icon name="models" size={15} /> Models
          {modelCount > 0 && <span className="nav-count">{modelCount}</span>}
        </button>
      </div>

      <div className="history">
        {conversations.length === 0 && <p className="history-empty">No conversations yet</p>}
        {groups.map((group) => (
          <div key={group.label} className="history-group">
            <p className="history-label">{group.label}</p>
            {group.items.map((conversation) => (
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
        ))}
      </div>

      <footer className="sidebar-footer">
        <span className="local-dot" />
        <div>
          <strong>Local workspace</strong>
          <small>
            {modelCount === 0 ? "No models" : `${modelCount} model${modelCount === 1 ? "" : "s"}`} · fully private
          </small>
        </div>
      </footer>
    </aside>
  );
}
