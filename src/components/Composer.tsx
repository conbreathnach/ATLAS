import { useEffect, useRef, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
}

export function Composer({ value, onChange, onSubmit, onStop, streaming, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Message ATLAS…"
        rows={1}
        aria-label="Message ATLAS"
      />
      {streaming ? (
        <button className="composer-btn composer-stop" onClick={onStop} aria-label="Stop generating">
          <Icon name="stop" size={14} />
        </button>
      ) : (
        <button
          className="composer-btn composer-send"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          <Icon name="send" size={15} />
        </button>
      )}
      <span className="composer-hint">Enter to send · Shift+Enter for a new line · fully local</span>
    </div>
  );
}
