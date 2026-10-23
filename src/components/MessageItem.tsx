import { useState } from "react";
import { parseThinkSegments } from "../lib/think";
import type { ChatMessage } from "../types";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { ThinkBlock } from "./ThinkBlock";

interface Props {
  message: ChatMessage;
  isLastAssistant: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

/** Renders message content, hiding reasoning behind a collapsible block. */
export function AssistantContent({ text, streaming }: { text: string; streaming: boolean }) {
  // Skip finished-but-empty think blocks (some models emit them); an empty
  // block still renders while open, since that is the "Thinking…" state.
  const segments = parseThinkSegments(text, streaming).filter(
    (segment) => segment.kind === "text" || segment.content.trim() || !segment.closed,
  );
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "think" ? (
          <ThinkBlock
            key={index}
            content={segment.content}
            streaming={streaming && !segment.closed}
          />
        ) : (
          <Markdown key={index}>{segment.content}</Markdown>
        ),
      )}
      {streaming && !segments.every((segment) => segment.kind === "think") && (
        <span className="stream-caret" />
      )}
    </>
  );
}

export function MessageItem({ message, isLastAssistant, canRegenerate, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (message.role === "user") {
    return (
      <div className="row-user">
        <div className="bubble-user">
          <p>{message.content}</p>
        </div>
        <div className="row-user-actions">
          <button onClick={() => void copy()} title="Copy message" aria-label="Copy message">
            <Icon name={copied ? "check" : "copy"} size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="row-assistant">
      <div className="assistant-avatar">
        <Icon name="spark" size={14} />
      </div>
      <div className="assistant-body">
        <AssistantContent text={message.content} streaming={false} />
        <div className="assistant-actions">
          <button onClick={() => void copy()} title="Copy response" aria-label="Copy response">
            <Icon name={copied ? "check" : "copy"} size={14} />
          </button>
          {isLastAssistant && canRegenerate && (
            <button onClick={onRegenerate} title="Regenerate response" aria-label="Regenerate response">
              <Icon name="refresh" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
