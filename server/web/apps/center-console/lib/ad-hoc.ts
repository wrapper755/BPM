/**
 * Ad Hoc 하위 프로세스의 `bpm:adHoc` 본문을 폼으로 오가는 셈 — **화면을 모른다** (`pnpm test`가 잰다).
 *
 * 무엇을 켤지는 **식(`activate`) 또는 AI(`ai`) 하나**다 (C14 §Ad Hoc 하위 프로세스, B18). 방식을 바꾸면
 * 다른 쪽을 뺀다 — 둘 다 남으면 B18 오류다. `ai`는 AI 태스크와 같은 칸이고(`goal`·`inputs`·`results`·
 * `replay`·`limits.max_steps`·`forbidden_actions`) **`timeout_s`는 받지 않는다**. 모르는 칸은 그대로 들고
 * 간다(C14 호환 규칙). 검사는 **막지 않고 말만 한다**(CON-20b).
 */

import { mapRows, rowsToMap, type Body, type MapRow } from "./element-values";
import { numberProblem, readLimits, VALUE_TYPE_LABELS, writeLimits } from "./inner-fields";

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** 고르는 방식 — 아직 정하지 않았으면 `""`. */
export type AdHocMode = "" | "activate" | "ai";

/** 본문이 어느 방식인가. 둘 다 적혀 있으면(B18 오류) AI 쪽을 보인다 — 바꾸면 하나가 된다. */
export function adHocMode(body: Body): AdHocMode {
  if (isObject(body.ai)) return "ai";
  if (typeof body.activate === "string") return "activate";
  return "";
}

/** 방식을 바꾼 본문 — 다른 쪽 칸은 뺀다. 같은 방식이면 그대로다. */
export function switchMode(body: Body, mode: Exclude<AdHocMode, "">): Body {
  if (adHocMode(body) === mode && !(mode === "ai" && "activate" in body)) return body;
  const made: Body = { ...body };
  if (mode === "activate") {
    delete made.ai;
    if (typeof made.activate !== "string") made.activate = "";
  } else {
    delete made.activate;
    if (!isObject(made.ai)) made.ai = { goal: "" };
  }
  return made;
}

/** 재생 방식의 화면 이름 (C14 §재생). 차례는 기본(`plan`)이 먼저다. */
export const REPLAY_LABELS: Record<string, string> = {
  plan: "계획만 되밟기",
  full: "모두 되밟기",
  none: "매번 자율",
};

/** 입력·결과 표의 타입 칸이 받는 것 — AI 태스크의 결과와 같다. */
export const VALUE_TYPES = Object.keys(VALUE_TYPE_LABELS);

/** AI 설정 폼 — 칸은 글 그대로 든다(고치는 중인 수를 잃지 않게). */
export interface AdHocAiForm {
  goal: string;
  inputs: MapRow[];
  results: MapRow[];
  /** `""`이면 기본(`plan`)이다 — 칸을 적지 않는다. */
  replay: string;
  maxSteps: string;
  /** 한 줄에 하나. */
  forbidden: string;
  /** 폼이 모르는 칸 (`limits`도 여기 남고 `max_steps`만 폼이 고친다). */
  rest: Obj;
}

/** `ai` 값 → 폼. 읽지 못하는 모양이면 `null` — JSON 칸으로 남는다. */
export function readAi(value: unknown): AdHocAiForm | null {
  if (value === undefined || value === null) value = {};
  if (!isObject(value)) return null;
  const { goal, inputs, results, replay, limits, forbidden_actions, ...rest } = value;
  if (goal !== undefined && typeof goal !== "string") return null;
  if (replay !== undefined && typeof replay !== "string") return null;
  const inputRows = mapRows(inputs);
  const resultRows = mapRows(results);
  const limitForm = readLimits(limits);
  if (!inputRows || !resultRows || !limitForm) return null;
  if (forbidden_actions !== undefined && !(Array.isArray(forbidden_actions) && forbidden_actions.every((one) => typeof one === "string")))
    return null;
  if (limits !== undefined) rest.limits = limits;
  return {
    goal: goal ?? "",
    inputs: inputRows,
    results: resultRows,
    replay: replay ?? "",
    maxSteps: limitForm.max_steps,
    forbidden: ((forbidden_actions as string[] | undefined) ?? []).join("\n"),
    rest,
  };
}

/** 폼 → `ai` 값. 빈 칸은 적지 않는다 — `goal`만은 필수라 비어도 남긴다. */
export function writeAi(form: AdHocAiForm): Obj {
  const { limits, ...rest } = form.rest;
  const made: Obj = { ...rest, goal: form.goal };
  const inputs = rowsToMap(form.inputs);
  if (inputs) made.inputs = inputs;
  const results = rowsToMap(form.results);
  if (results) made.results = results;
  if (form.replay) made.replay = form.replay;
  const limitForm = readLimits(limits) ?? { timeout_s: "", max_steps: "", rest: {} };
  const nextLimits = writeLimits({ ...limitForm, max_steps: form.maxSteps });
  if (nextLimits) made.limits = nextLimits;
  const forbidden = form.forbidden
    .split("\n")
    .map((one) => one.trim())
    .filter(Boolean);
  if (forbidden.length) made.forbidden_actions = forbidden;
  return made;
}

/** 폼에 말할 것 — 막지 않는다. */
export function aiProblems(form: AdHocAiForm): { goal?: string; maxSteps?: string; inputs?: string; results?: string } {
  const typeProblem = (rows: MapRow[]): string | undefined => {
    const bad = rows.filter(([name, type]) => name.trim() && !VALUE_TYPES.includes(type.trim())).map(([name]) => name.trim());
    return bad.length ? `타입은 ${VALUE_TYPES.join("·")} 중 하나입니다: ${bad.join(", ")}` : undefined;
  };
  return {
    goal: form.goal.trim() ? undefined : "목표가 비어 있습니다.",
    maxSteps: numberProblem(form.maxSteps),
    inputs: typeProblem(form.inputs),
    results: typeProblem(form.results),
  };
}

/** 패널의 요약 — 목표 첫 줄과 「입력 n · 결과 n · 재생 · 최대 차례」. */
export function summarizeAi(value: unknown): { goal: string; facts: string } | null {
  const form = readAi(value);
  if (!form) return null;
  const goal = form.goal.split("\n").find((one) => one.trim())?.trim() ?? "";
  const count = (rows: MapRow[]) => rows.filter(([name]) => name.trim()).length;
  const facts = [
    `입력 ${count(form.inputs)}`,
    `결과 ${count(form.results)}`,
    REPLAY_LABELS[form.replay || "plan"] ?? form.replay,
    `최대 차례 ${form.maxSteps || "기본"}`,
  ].join(" · ");
  return { goal, facts };
}
