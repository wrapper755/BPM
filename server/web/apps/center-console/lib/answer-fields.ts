/**
 * 결재 「답 칸」(`bpm:approval` `fields`, C6 `FormField`)과 「담당자」(`assignees`)를 폼으로 오가는 셈 —
 * **화면을 모른다** (`pnpm test`가 잰다).
 *
 * 검사는 **막지 않고 말만 한다** — 판정은 C14 B12가 한다(검사는 쓰기를 막지 않는다, CON-20b).
 * 여기서 보는 것은 사람이 고치는 동안 곧바로 보여 줄 만한 것뿐이다.
 */

/** C6 `KNOWN_FIELD_TYPES` — 화면 차례대로. */
export const ANSWER_TYPES = ["choice", "bool", "text", "number"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  choice: "고르기",
  bool: "참거짓",
  text: "글",
  number: "수",
};

/** 칸 하나. 모르는 속성도 **그대로 들고 간다** (C14 호환 규칙) — 그래서 열린 객체다. */
export interface AnswerField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  choices?: unknown[] | null;
  default?: unknown;
  when?: { field: string; in: unknown[] } | null;
  [other: string]: unknown;
}

/** 본문의 값 → 칸 목록. **배열이고 줄마다 객체일 때만** 읽는다 — 아니면 `null`(JSON 칸으로 남는다). */
export function readAnswerFields(value: unknown): AnswerField[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (!value.every((one) => one && typeof one === "object" && !Array.isArray(one))) return null;
  return value.map((one) => {
    const field = one as Record<string, unknown>;
    return {
      ...field,
      key: typeof field.key === "string" ? field.key : "",
      label: typeof field.label === "string" ? field.label : "",
      type: typeof field.type === "string" ? field.type : "text",
    };
  });
}

/** 새 칸 — 겹치지 않는 키를 지어 둔다(사람이 곧 바꾼다). */
export function newAnswerField(fields: AnswerField[]): AnswerField {
  const taken = new Set(fields.map((one) => one.key));
  let n = fields.length + 1;
  while (taken.has(`field${n}`)) n += 1;
  return { key: `field${n}`, label: "", type: "text" };
}

/**
 * 종류를 바꾼다 — 그 종류에 없는 것은 걷는다(고르기가 아니면 `choices`, 맞지 않는 기본값).
 * 남겨 두면 그림에는 들어가는데 화면에는 안 보여 왜 B12가 우는지 모르게 된다.
 */
export function withType(field: AnswerField, type: string): AnswerField {
  const made: AnswerField = { ...field, type };
  if (type !== "choice") delete made.choices;
  if (made.default !== undefined && !defaultFits(made)) delete made.default;
  return made;
}

function defaultFits(field: AnswerField): boolean {
  const value = field.default;
  if (value === null || value === undefined) return true;
  switch (field.type) {
    case "bool":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number";
    case "choice":
      return (field.choices ?? []).some((one) => one === value);
    default:
      return typeof value === "string";
  }
}

/** 고를 거리 → 한 줄에 하나. */
export function choicesToText(choices: unknown[] | null | undefined): string {
  return (choices ?? []).map((one) => String(one)).join("\n");
}

/**
 * 한 줄에 하나 → 고를 거리. 앞에 있던 값과 **글이 같으면 그 값을 그대로 쓴다** — `3`이 `"3"`이
 * 되어 조건·기본값과 어긋나지 않게. 빈 줄은 버린다.
 */
export function choicesFromText(text: string, before: unknown[] | null | undefined): unknown[] {
  const known = new Map((before ?? []).map((one) => [String(one), one]));
  return text
    .split("\n")
    .map((one) => one.trim())
    .filter(Boolean)
    .map((one) => (known.has(one) ? known.get(one) : one));
}

/** 조건이 볼 수 있는 칸 — **앞에 오는** 고르기·참거짓 칸 (ADR-0188). */
export function conditionSources(fields: AnswerField[], index: number): AnswerField[] {
  return fields.slice(0, index).filter((one) => one.type === "choice" || one.type === "bool");
}

/** 조건 칸이 고를 수 있는 값. */
export function conditionValues(source: AnswerField | undefined): unknown[] {
  if (!source) return [];
  return source.type === "bool" ? [true, false] : (source.choices ?? []);
}

/** 키를 바꾼다 — 그 칸을 보던 **뒤 칸의 조건도 따라간다** (안 그러면 고친 순간 조건이 끊긴다). */
export function renameKey(fields: AnswerField[], index: number, key: string): AnswerField[] {
  const before = fields[index]?.key;
  return fields.map((one, at) => {
    if (at === index) return { ...one, key };
    if (before && one.when?.field === before) return { ...one, when: { ...one.when, field: key } };
    return one;
  });
}

/** 줄 하나를 위아래로 옮긴다. 끝을 넘으면 그대로. */
export function moveField(fields: AnswerField[], index: number, by: -1 | 1): AnswerField[] {
  const to = index + by;
  if (to < 0 || to >= fields.length) return fields;
  const made = [...fields];
  const [one] = made.splice(index, 1);
  if (one) made.splice(to, 0, one);
  return made;
}

/** 접힌 줄의 둘째 줄 — 「고르기 · 필수 · 조건 decision」. */
export function answerSummary(field: AnswerField): string {
  const parts = [ANSWER_TYPE_LABELS[field.type as AnswerType] ?? field.type];
  if (field.required) parts.push("필수");
  if (field.when) parts.push(`조건 ${field.when.field}`);
  return parts.join(" · ");
}

/** 줄마다 곧바로 말할 것 — B12가 오류로 볼 것과 같은 결이고, **막지 않는다**. */
export function answerProblems(fields: AnswerField[]): string[][] {
  const counts = new Map<string, number>();
  for (const one of fields) counts.set(one.key, (counts.get(one.key) ?? 0) + 1);
  return fields.map((field, index) => {
    const out: string[] = [];
    if (!field.key.trim()) out.push("키가 비어 있습니다.");
    else if ((counts.get(field.key) ?? 0) > 1) out.push("키가 다른 칸과 겹칩니다.");
    if (!(ANSWER_TYPES as readonly string[]).includes(field.type)) out.push(`모르는 종류입니다: ${field.type}`);
    if (field.type === "choice" && !(field.choices ?? []).length) out.push("고를 거리가 없습니다.");
    if (field.when) {
      const source = conditionSources(fields, index).find((one) => one.key === field.when?.field);
      if (!source) out.push("조건은 앞에 오는 고르기·참거짓 칸만 볼 수 있습니다.");
      else if (!field.when.in.length) out.push("조건의 값을 하나 이상 고르세요.");
      else {
        const allowed = conditionValues(source);
        if (field.when.in.some((one) => !allowed.some((ok) => ok === one))) {
          out.push("조건 값이 그 칸의 고를 거리에 없습니다.");
        }
      }
    }
    return out;
  });
}

// ─────────────────────────── 담당자 (ADR-0080) ───────────────────────────

/** 「이름 목록」이거나 「변수에서」(변수 이름 하나) — `expires`와 같은 결. */
export type Assignees = { mode: "names"; names: string[] } | { mode: "variable"; name: string };

export function readAssignees(value: unknown): Assignees | null {
  if (value === undefined || value === null) return { mode: "names", names: [] };
  if (typeof value === "string") return { mode: "variable", name: value };
  if (Array.isArray(value) && value.every((one) => typeof one === "string")) return { mode: "names", names: value };
  return null;
}

/** 본문에 넣을 값. 비면 `undefined` — **그 칸을 뺀다**. */
export function writeAssignees(made: Assignees): string[] | string | undefined {
  if (made.mode === "variable") return made.name.trim() || undefined;
  const names = made.names.map((one) => one.trim()).filter(Boolean);
  return names.length ? names : undefined;
}
