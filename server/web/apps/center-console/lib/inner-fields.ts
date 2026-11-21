/**
 * 안쪽 모델이 작은 `bpm:*` 칸을 폼으로 오가는 셈 — **화면을 모른다** (`pnpm test`가 잰다).
 *
 * 다시 시도(`serviceCall.retry`, C14 `Retry`)·한도(`limits`, `Limits`)·매개변수(`aiTask.params`)·
 * 맡기기(`call.delegate`, `Delegate`)와 BPM 프로세스 입력의 요약(`process.inputs`, `InputDecl`).
 * 읽지 못하는 모양이면 `null` — 그 칸은 JSON 칸으로 남는다. 칸 안의 모르는 속성은 **그대로 들고 간다**
 * (C14 호환 규칙). 검사는 **막지 않고 말만 한다**(CON-20b).
 */

import type { MapRow } from "./element-values";

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** 수 칸의 글 → 0 이상의 정수. 비면 `undefined`, 수가 아니면 `null`. */
function wholeNumber(text: string): number | undefined | null {
  const raw = text.trim();
  if (!raw) return undefined;
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

const numberText = (value: unknown): string => (typeof value === "number" ? String(value) : "");

/** 모르는 속성까지 합친 객체. 모든 칸이 비면 `undefined` — 그 칸을 뺀다. */
function compact(rest: Obj, known: Obj): Obj | undefined {
  const made: Obj = { ...rest };
  for (const [key, value] of Object.entries(known)) if (value !== undefined) made[key] = value;
  return Object.keys(made).length ? made : undefined;
}

// ─────────────────────────── 다시 시도 (`serviceCall.retry`) ───────────────────────────

export interface RetryForm {
  /** 다시 시도 횟수 — 글 그대로(고치는 중의 값을 잃지 않게). */
  max: string;
  /** 다시 부를 상태 코드 — 쉼표로 여럿. */
  on: string;
  rest: Obj;
}

/** 본문의 값 → 폼. 객체가 아니거나 `max`·`on`이 모델 모양이 아니면 `null`. */
export function readRetry(value: unknown): RetryForm | null {
  if (value === undefined || value === null) return { max: "", on: "", rest: {} };
  if (!isObject(value)) return null;
  const { max, on, ...rest } = value;
  if (max !== undefined && typeof max !== "number") return null;
  if (on !== undefined && !(Array.isArray(on) && on.every((one) => typeof one === "number"))) return null;
  return { max: numberText(max), on: Array.isArray(on) ? on.join(", ") : "", rest };
}

/** 상태 코드 글 → 수 목록과 넣지 못한 조각. */
export function parseCodes(text: string): { codes: number[]; bad: string[] } {
  const codes: number[] = [];
  const bad: string[] = [];
  for (const piece of text.split(/[,\s]+/)) {
    if (!piece) continue;
    if (/^\d+$/.test(piece)) codes.push(Number(piece));
    else bad.push(piece);
  }
  return { codes, bad };
}

/** 폼 → 본문에 넣을 값. 횟수가 비거나 0이고 코드도 없으면 `undefined` — 칸을 뺀다. */
export function writeRetry(form: RetryForm): Obj | undefined {
  const max = wholeNumber(form.max);
  const { codes } = parseCodes(form.on);
  return compact(form.rest, {
    max: typeof max === "number" && (max > 0 || codes.length) ? max : undefined,
    on: codes.length ? codes : undefined,
  });
}

/** 칸마다 말할 것 — 수가 아닌 것은 넣지 않는다. */
export function retryProblems(form: RetryForm): { max?: string; on?: string } {
  const bad = parseCodes(form.on).bad;
  return {
    max: wholeNumber(form.max) === null ? "0 이상의 정수만 넣습니다." : undefined,
    on: bad.length ? `수가 아니라 넣지 않습니다: ${bad.join(", ")}` : undefined,
  };
}

// ─────────────────────────── 한도 (`limits`) ───────────────────────────

export interface LimitsForm {
  timeout_s: string;
  max_steps: string;
  rest: Obj;
}

export function readLimits(value: unknown): LimitsForm | null {
  if (value === undefined || value === null) return { timeout_s: "", max_steps: "", rest: {} };
  if (!isObject(value)) return null;
  const { timeout_s, max_steps, ...rest } = value;
  for (const one of [timeout_s, max_steps]) if (one !== undefined && one !== null && typeof one !== "number") return null;
  return { timeout_s: numberText(timeout_s), max_steps: numberText(max_steps), rest };
}

/** 폼 → 본문에 넣을 값. 수가 아닌 칸은 넣지 않고, 다 비면 `undefined`. */
export function writeLimits(form: LimitsForm): Obj | undefined {
  const pick = (text: string) => {
    const made = wholeNumber(text);
    return typeof made === "number" ? made : undefined;
  };
  return compact(form.rest, { timeout_s: pick(form.timeout_s), max_steps: pick(form.max_steps) });
}

/** 수 칸 하나에 말할 것. */
export function numberProblem(text: string): string | undefined {
  return wholeNumber(text) === null ? "0 이상의 정수만 넣습니다." : undefined;
}

// ─────────────────────────── 매개변수 (`aiTask.params`) ───────────────────────────

/**
 * 본문의 값 → 표의 줄. **값이 모두 글일 때만** 표다 — 표는 글만 다루므로 `3`이 `"3"`이 되면 안 된다.
 * 수·목록이 섞였거나 객체가 아니면 `null`(JSON 칸).
 */
export function readParams(value: unknown): MapRow[] | null {
  if (value === undefined || value === null) return [];
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, one]) => typeof one === "string")) return null;
  return entries.map(([name, one]) => [name, one as string]);
}

// ─────────────────────────── 맡기기 (`call.delegate`) ───────────────────────────

export interface DelegateForm {
  /** 켜져 있나 — 칸이 있으면 켜진 것이다. */
  on: boolean;
  bpm_process_id: string;
  version: string;
  rest: Obj;
}

export function readDelegate(value: unknown): DelegateForm | null {
  if (value === undefined || value === null) return { on: false, bpm_process_id: "", version: "", rest: {} };
  if (!isObject(value)) return null;
  const { bpm_process_id, version, ...rest } = value;
  if (bpm_process_id !== undefined && typeof bpm_process_id !== "string") return null;
  if (version !== undefined && version !== null && typeof version !== "string") return null;
  return { on: true, bpm_process_id: bpm_process_id ?? "", version: version ?? "", rest };
}

/** 폼 → 본문에 넣을 값. 끄면 `undefined`. 켜면 패키지 id가 비어도 칸을 둔다(켠 것을 잃지 않게). */
export function writeDelegate(form: DelegateForm): Obj | undefined {
  if (!form.on) return undefined;
  const made: Obj = { ...form.rest, bpm_process_id: form.bpm_process_id.trim() };
  if (form.version.trim()) made.version = form.version.trim();
  return made;
}

// ─────────────────────────── BPM 프로세스 입력 요약 (`process.inputs`) ───────────────────────────

/** C14 `VALUE_TYPES`의 화면 이름. 모르는 것은 원문 그대로. */
export const VALUE_TYPE_LABELS: Record<string, string> = {
  string: "글",
  int: "정수",
  number: "수",
  bool: "참거짓",
  list: "목록",
  dict: "묶음",
  date: "날짜",
};

export interface InputLine {
  name: string;
  /** 「타입 · 필수 · 출처」. */
  detail: string;
}

/** 입력 선언 → 한 줄 요약들. 배열이 아니거나 줄이 객체가 아니면 `null`(JSON 칸). */
export function summarizeInputs(value: unknown): InputLine[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every(isObject)) return null;
  return value.map((one) => {
    const type = typeof one.type === "string" ? (VALUE_TYPE_LABELS[one.type] ?? one.type) : "?";
    const parts = [type];
    if (one.required === true) parts.push("필수");
    if (typeof one.source === "string" && one.source && one.source !== "caller") parts.push(`출처 ${one.source}`);
    return { name: typeof one.name === "string" && one.name ? one.name : "(이름 없음)", detail: parts.join(" · ") };
  });
}
