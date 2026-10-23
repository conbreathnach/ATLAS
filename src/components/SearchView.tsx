import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Conversation } from "../types";
import { Icon } from "./Icon";

interface Props {
  conversations: Conversation[];
  onOpenConversation: (id: string) => void;
  onClearAll: () => void;
}

interface Result {
  conversationId: string;
  title: string;
  snippet: string;
  updatedAt: number;
}

function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
  const lower = text.toLowerCase();
  const index = lower.indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function snippetAround(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return content.slice(0, 140);
  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + query.length + 80);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

export function SearchView({ conversations, onOpenConversation, onClearAll }: Props) {
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const timeout = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [confirming]);

  // At most one result per conversation: title matches win, then first
  // matching message provides the snippet.
  const results = useMemo<Result[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return conversations
      .map((conversation): Result | null => {
        if (conversation.title.toLowerCase().includes(needle)) {
          return {
            conversationId: conversation.id,
            title: conversation.title,
            snippet: conversation.messages[0]?.content ?? "Title match",
            updatedAt: conversation.updatedAt,
          };
        }
        const message = conversation.messages.find((item) =>
          item.content.toLowerCase().includes(needle),
        );
        return message
          ? {
              conversationId: conversation.id,
              title: conversation.title,
              snippet: snippetAround(message.content, query.trim()),
              updatedAt: conversation.updatedAt,
            }
          : null;
      })
      .filter((result): result is Result => result !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 30);
  }, [conversations, query]);

  return (
    <section className="search-view">
      <span className="page-label">Local search</span>
      <h1>Search your chats</h1>
      <p>Searches only the conversations stored on this device.</p>

      <div className="search-box">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="Search titles and messages…"
        />
        {query && (
          <button className="icon-btn" onClick={() => setQuery("")} aria-label="Clear search">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {query.trim() && (
        <p className="search-meta">
          {results.length === 0 ? "No matches" : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </p>
      )}

      <div className="search-results">
        {results.map((result) => (
          <button
            key={result.conversationId}
            className="search-result"
            onClick={() => onOpenConversation(result.conversationId)}
          >
            <strong>
              <Highlighted text={result.title} query={query.trim()} />
            </strong>
            <p>
              <Highlighted text={result.snippet} query={query.trim()} />
            </p>
          </button>
        ))}
      </div>

      {conversations.length > 0 && (
        <div className="search-danger">
          <button
            className="btn-danger"
            onClick={() => {
              if (confirming) {
                onClearAll();
                setConfirming(false);
              } else {
                setConfirming(true);
              }
            }}
          >
            {confirming ? "Click again to erase all chats" : "Clear all chats"}
          </button>
        </div>
      )}
    </section>
  );
}
