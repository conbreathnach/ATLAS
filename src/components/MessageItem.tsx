import { useState } from "react";
import type { ChatMessage } from "../types";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";

interface Props {
  message: ChatMessage;
  isLastAssistant: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

export function MessageItem({ message, isLastAssistant, canRegenerate, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar">{isUser ? "You" : <Icon name="spark" size={15} />}</div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-role">{isUser ? "You" : "ATLAS"}</span>
          {message.createdAt > 0 && (
            <time>
              {new Date(message.createdAt * 1000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </div>
        {isUser ? <p className="msg-text">{message.content}</p> : <Markdown>{message.content}</Markdown>}
        <div className="msg-actions">
          <button onClick={() => void copy()} title="Copy message">
            <Icon name={copied ? "check" : "copy"} size={13} />
            {copied ? "Copied" : "Copy"}
          </button>
          {isLastAssistant && canRegenerate && (
            <button onClick={onRegenerate} title="Regenerate response">
              <Icon name="refresh" size={13} />
              Retry
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
