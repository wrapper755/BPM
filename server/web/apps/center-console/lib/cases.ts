/**
 * 시험 케이스 파일(`cases/*.json`, C14)을 다루는 셈 — **화면을 모른다** (`pnpm test`가 잰다).
 *
 * 케이스는 **JSON 파일 그대로**다 (BPMN·DMN과 달리 형식 해석이 필요 없다) — 그래서 콘솔이
 * 직접 읽고 쓴다. 값이 맞는지는 **돌려 볼 때** 엔진이 본다 (`core.testrun.cases`의
 * `validate_answer`) — 여기서 그 판정을 베끼지 않는다. 베끼면 두 벌이 된다.
 */

import type { Case, CaseFile } from "@bpm/api-types/c14-case-file";

/** 값 하나를 화면에서 다루는 갈래. 모르는 모양(목록·객체)은 JSON 칸 하나다. */
export type ValueKind = "글" | "수" | "참거짓" | "JSON";

export const VALUE_KINDS: ValueKind[] = ["글", "수", "참거짓", "JSON"];

/** 파일 글 → 케이스 파일. 깨진 글은 **빈 파일로 보지 않고** 그렇게 말한다. */
export function parseCases(text: string): { file?: CaseFile; error?: string } {
  let found: unknown;
  try {
    found = JSON.parse(text || "{}");
  } catch (cause) {
    return { error: `케이스 파일을 읽지 못했습니다 — ${cause instanceof Error ? cause.message : "JSON이 아닙니다"}` };
  }
  if (!found || typeof found !== "object" || Array.isArray(found)) {
    return { error: "케이스 파일의 맨 바깥은 객체여야 합니다." };
  }
  const file = found as CaseFile;
  return { file: { ...file, schema: file.schema ?? 1, cases: file.cases ?? [] } };
}

export function writeCases(file: CaseFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function kindOf(value: unknown): ValueKind {
  if (typeof value === "boolean") return "참거짓";
  if (typeof value === "number") return "수";
  if (typeof value === "string") return "글";
  return "JSON";
}

/** 칸에 넣을 글. 글은 따옴표 없이 그대로 보인다 — 사람이 적는 것은 값이지 JSON이 아니다. */
export function toText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

/** 칸의 글 → 값. 갈래가 받아들이지 못하는 글이면 `null`을 준다 (부르는 쪽이 그 자리에 말한다). */
export function fromText(kind: ValueKind, text: string): { value?: unknown; error?: string } {
  switch (kind) {
    case "글":
      return { value: text };
    case "수": {
      const made = Number(text.trim());
      if (!text.trim() || !Number.isFinite(made)) return { error: "수가 아닙니다." };
      return { value: made };
    }
    case "참거짓":
      return { value: text === "true" };
    default:
      try {
        return { value: JSON.parse(text || "null") };
      } catch {
        return { error: "JSON이 아닙니다." };
      }
  }
}

/** `{이름: 값}` 한 칸을 바꾼 새 사전. 이름이 비면 **그 줄을 뺀다**. */
export function withEntry(
  map: Record<string, unknown>,
  oldName: string,
  name: string,
  value: unknown,
): Record<string, unknown> {
  const made: Record<string, unknown> = {};
  let put = false;
  for (const [key, one] of Object.entries(map)) {
    if (key === oldName) {
      if (name) {
        made[name] = value;
        put = true;
      }
      continue;
    }
    made[key] = one;
  }
  if (!put && name && !(name in made)) made[name] = value;
  return made;
}

/** 겹치지 않는 새 케이스 이름. */
export function freshName(cases: Case[], base = "케이스"): string {
  const taken = new Set(cases.map((one) => one.name));
  for (let n = 1; ; n += 1) {
    const made = `${base} ${n}`;
    if (!taken.has(made)) return made;
  }
}

/**
 * 케이스 이름이 겹치는가 — **엔진은 이름으로 케이스를 고른다**(C14). 겹치면 뒤의 것이
 * 가려지므로 저장 전에 막는다.
 */
export function duplicateNames(cases: Case[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const one of cases) {
    if (seen.has(one.name)) twice.add(one.name);
    seen.add(one.name);
  }
  return [...twice].sort();
}

// ─────────────────── 결재 답 폼 (그림의 결재 칸을 본다) ───────────────────

/**
 * 그 케이스 파일이 딸린 정의 — `cases/<이름>.cases.json` → `process/<이름>.bpmn`.
 *
 * **엔진이 그 짝만 본다** (`core.testrun.workspace`의 `case_file`) — 다른 정의의 결재를 폼으로
 * 그리면 적어 넣은 답이 돌릴 때 쓰이지 않는다.
 */
export function definitionPath(casePath: string): string | null {
  const name = casePath.startsWith("cases/") ? casePath.slice("cases/".length) : "";
  if (!name.endsWith(".cases.json")) return null;
  const stem = name.slice(0, -".cases.json".length);
  return stem ? `process/${stem}.bpmn` : null;
}

/** 폼 칸의 갈래 (C6 `KNOWN_FIELD_TYPES`) → 값 칸의 갈래. 모르는 갈래는 글이다. */
export function kindOfField(type: string): ValueKind {
  if (type === "bool") return "참거짓";
  if (type === "number") return "수";
  return "글";
}

/**
 * 케이스에는 있는데 **그림에는 없는** 결재 — 노드를 지웠거나 이름이 바뀐 것이다.
 *
 * **지우지 않고 보인다** — 조용히 버리면 사람이 적어 둔 답이 사라지고, 왜 그 케이스가 달라졌는지
 * 알 수 없다 (U8).
 */
export function strayApprovals(
  approvals: Record<string, unknown> | undefined,
  nodeIds: string[],
): string[] {
  const known = new Set(nodeIds);
  return Object.keys(approvals ?? {}).filter((one) => !known.has(one));
}
