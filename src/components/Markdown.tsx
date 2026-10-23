import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Icon } from "./Icon";

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const className = isValidElement<{ className?: string }>(children)
    ? (children.props.className ?? "")
    : "";
  const language = /language-(\w+)/.exec(className)?.[1] ?? "text";

  const copy = async () => {
    await navigator.clipboard.writeText(extractText(children).replace(/\n$/, ""));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{language}</span>
        <button onClick={() => void copy()} aria-label="Copy code">
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
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
            isValidElement(children) ? <CodeBlock>{children}</CodeBlock> : <pre>{children}</pre>,
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
