/**
 * 결재 설명의 Markdown (C14 「결재 설명」, ADR-0134) — CON-04가 그리는 것만 읽는다.
 *
 * 문단·줄바꿈, 제목(`#`~`###`), 굵게·기울임, 인라인 코드·코드 블록, 글머리·번호 목록, 링크(`http`·`https`만).
 * **HTML은 읽지 않는다** — 글자 그대로 남고 React가 글로 찍는다(`dangerouslySetInnerHTML`을 쓰지 않는다).
 * 그 밖(표 등)은 문단의 글로 남는다.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; text: string };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*```/;
const WEB = /^https?:\/\//i;

/** 링크로 여는 주소 — `http`·`https`만. */
export function isWebLink(href: string): boolean {
  return WEB.test(href.trim());
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const at = (n: number): string => lines[n] ?? "";
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(at(i))) body.push(at(i++));
      i += 1; // 닫는 줄 (없으면 끝까지가 코드다)
      out.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ kind: "heading", level: (heading[1] ?? "#").length as 1 | 2 | 3, children: parseInline((heading[2] ?? "").trim()) });
      i += 1;
      continue;
    }
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? NUMBERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(at(i))) {
        items.push(parseInline(pattern.exec(at(i))?.[1] ?? ""));
        i += 1;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph: Inline[][] = [];
    while (
      i < lines.length &&
      at(i).trim() &&
      !FENCE.test(at(i)) &&
      !HEADING.test(at(i)) &&
      !BULLET.test(at(i)) &&
      !NUMBERED.test(at(i))
    ) {
      paragraph.push(parseInline(at(i).trim()));
      i += 1;
    }
    out.push({ kind: "paragraph", lines: paragraph });
  }
  return out;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push({ kind: "text", text: plain });
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const first = rest.charAt(0);
    if (rest.startsWith("`")) {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const strong = rest.startsWith("**") || rest.startsWith("__") ? text.indexOf(rest.slice(0, 2), i + 2) : -1;
    if (strong > i + 2) {
      flush();
      out.push({ kind: "strong", children: parseInline(text.slice(i + 2, strong)) });
      i = strong + 2;
      continue;
    }
    const em = first === "*" || first === "_" ? text.indexOf(first, i + 1) : -1;
    if (em > i + 1) {
      flush();
      out.push({ kind: "em", children: parseInline(text.slice(i + 1, em)) });
      i = em + 1;
      continue;
    }
    if (first === "[") {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (link) {
        flush();
        const children = parseInline(link[1] ?? "");
        // 웹 주소가 아니면 링크로 만들지 않고 글만 남긴다 (`javascript:` 같은 것).
        const href = link[2] ?? "";
        if (isWebLink(href)) out.push({ kind: "link", href, children });
        else out.push(...children);
        i += link[0].length;
        continue;
      }
    }
    plain += first;
    i += 1;
  }
  flush();
  return out;
}
