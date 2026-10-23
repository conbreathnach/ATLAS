import { isValidElement, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Icon } from "./Icon";

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const copy = async () => {
    const text = contentRef.current?.textContent ?? "";
    await navigator.clipboard.writeText(text.replace(/\n$/, ""));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="code-block">
      <button className="code-copy" onClick={() => void copy()} aria-label="Copy code">
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? "Copied" : "Copy"}
      </button>
      <div ref={contentRef}>
        <pre>{children}</pre>
      </div>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [
            rehypeHighlight,
            {
              subset: [
                "javascript", "typescript", "python", "rust", "json", "bash",
                "shell", "markdown", "yaml", "xml", "css", "sql", "c", "cpp",
                "csharp", "go", "java", "toml", "ini", "diff",
              ],
            },
          ],
        ]}
        components={{
          pre: ({ children }) =>
            // Blocks arrive wrapped in <pre>; inline code does not.
            isValidElement(children) ? (
              <CodeBlock>{children}</CodeBlock>
            ) : (
              <pre>{children}</pre>
            ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
