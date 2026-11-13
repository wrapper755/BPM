/**
 * `bpm:*` 본문(JSON 글 하나, C14)과 폼 사이를 오가는 셈 — **화면을 모른다** (`pnpm test`가 잰다).
 *
 * 폼 명세는 `@bpm/bpmn-canvas`가 C14 모델에서 **생성한 것**이라 칸을 손으로 적지 않는다.
 * 여기서는 그 갈래마다 값을 읽고 쓰는 길만 정한다.
 */

import type { ElementField } from "@bpm/bpmn-canvas";

/** 폼이 다루는 본문 — `{칸: 값}`. 모르는 칸도 **그대로 들고 간다** (C14 호환 규칙). */
export type Body = Record<string, unknown>;

/** 본문 글 → 객체. 깨진 글은 빈 객체로 본다 — 반쯤 그린 그림도 열려야 한다. */
export function parseBody(text: string): Body {
  try {
    const found: unknown = JSON.parse(text || "{}");
    return found && typeof found === "object" && !Array.isArray(found) ? (found as Body) : {};
  } catch {
    return {};
  }
}

/** 객체 → 본문 글 (캔버스가 XML에 그대로 싣는다). */
export function writeBody(body: Body): string {
  return JSON.stringify(body, null, 2);
}

/** 칸 하나를 폼 칸에 넣을 글로. 목록·표·JSON은 줄글로 펼친다. */
export function toInput(field: ElementField, value: unknown): string {
  if (value === undefined || value === null) return "";
  switch (field.kind) {
    case "list-text":
      return Array.isArray(value) ? value.join("\n") : String(value);
    case "map-text":
      return typeof value === "object"
        ? Object.entries(value as Record<string, unknown>)
            .map(([name, one]) => `${name}=${String(one)}`)
            .join("\n")
        : String(value);
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    case "bool":
      return value ? "true" : "false";
    default:
      return String(value);
  }
}

/** 폼 칸의 글 → 본문에 넣을 값. `null`이면 **그 칸을 뺀다** (빈 글이 0이나 빈 목록이 되지 않게). */
export function fromInput(field: ElementField, text: string): unknown | null {
  const raw = text.trim();
  switch (field.kind) {
    case "bool":
      return text === "true";
    case "number": {
      if (!raw) return null;
      const made = Number(raw);
      return Number.isFinite(made) ? made : null;
    }
    case "list-text":
      return raw ? raw.split("\n").map((one) => one.trim()).filter(Boolean) : null;
    case "map-text": {
      if (!raw) return null;
      const out: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const at = line.indexOf("=");
        if (at <= 0) continue;
        out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      }
      return Object.keys(out).length ? out : null;
    }
    case "json": {
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        // 고치는 중인 JSON은 **버리지 않는다** — 글 그대로 들고 있다가 고쳐지면 객체가 된다.
        return raw;
      }
    }
    default:
      return raw ? text : null;
  }
}

/** 본문 하나에 칸 하나를 적용한 새 본문. `null`은 그 칸을 뺀다. */
export function withField(body: Body, field: ElementField, text: string): Body {
  const value = fromInput(field, text);
  const made = { ...body };
  if (value === null) delete made[field.name];
  else made[field.name] = value;
  return made;
}

/**
 * 폼이 그리지 않는 칸 — 모델에 없는데 파일에는 있는 것. **보여 준다** — C14는 모르는 칸을
 * 버리지 않으므로(호환 규칙) 화면도 그것이 있다는 것을 숨기면 안 된다.
 */
export function strayKeys(body: Body, fields: ElementField[]): string[] {
  const known = new Set(fields.map((one) => one.name));
  return Object.keys(body).filter((one) => !known.has(one) && one !== "schema");
}
