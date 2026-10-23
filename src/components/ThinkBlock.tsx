import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Collapsible reasoning block. Auto-expanded while the model is still
 * thinking, collapses to a quiet summary row once the answer arrives.
 */
export function ThinkBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming);

  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  return (
    <div className={`think-block ${streaming ? "thinking" : ""}`}>
      <button
        className="think-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <Icon name="chevron" size={12} />
        {streaming ? <span className="think-shimmer">Thinking…</span> : "Thought for a moment"}
      </button>
      {open && content.trim() && <div className="think-content">{content.trim()}</div>}
    </div>
  );
}
