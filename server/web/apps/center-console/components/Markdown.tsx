import type { ReactNode } from "react";
import { type Inline, parseBlocks } from "@/lib/markdown";

/** CON-04 결재 설명 — `lib/markdown.ts`가 읽은 것만 그린다. 글은 React가 글로 찍는다(HTML을 넣지 않는다). */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-2 text-body text-text-secondary">
      {parseBlocks(source).map((block, n) => {
        switch (block.kind) {
          case "heading":
            return (
              <p key={n} className={block.level === 1 ? "text-h2 font-bold text-text-primary" : "font-bold text-text-primary"}>
                {inline(block.children)}
              </p>
            );
          case "list": {
            const items = block.items.map((item, m) => <li key={m}>{inline(item)}</li>);
            return block.ordered ? (
              <ol key={n} className="list-decimal pl-5">{items}</ol>
            ) : (
              <ul key={n} className="list-disc pl-5">{items}</ul>
            );
          }
          case "code":
            return (
              <pre key={n} className="overflow-x-auto rounded-md bg-bg-subtle p-2 font-mono text-body-sm">
                {block.text}
              </pre>
            );
          default:
            return (
              <p key={n}>
                {block.lines.map((line, m) => (
                  <span key={m}>
                    {m > 0 ? <br /> : null}
                    {inline(line)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

function inline(parts: Inline[]): ReactNode[] {
  return parts.map((part, n) => {
    switch (part.kind) {
      case "strong":
        return <strong key={n}>{inline(part.children)}</strong>;
      case "em":
        return <em key={n}>{inline(part.children)}</em>;
      case "code":
        return <code key={n} className="rounded-sm bg-bg-subtle px-1 font-mono text-body-sm">{part.text}</code>;
      case "link":
        return (
          <a key={n} href={part.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {inline(part.children)}
          </a>
        );
      default:
        return <span key={n}>{part.text}</span>;
    }
  });
}
