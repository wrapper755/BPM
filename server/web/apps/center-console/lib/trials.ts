/**
 * CON-20 「시험 실행」 탭이 쓰는 셈 — **화면을 모르는 것만** 여기 둔다 (`pnpm test`가 잰다).
 *
 * 상태·판정의 **표기는 `status_map`의 것만** 쓴다 (`design/tokens.json` 「시험 실행」·「시험 판정」,
 * 스타일 가이드 §2-2) — **색은 여기서 고르지 않는다**(`StatusBadge`가 그 표기로 찾는다. 여기서
 * `@bpm/ui`를 들이면 React 구성요소까지 따라와 vitest가 못 부른다). 계약의 상태는 열린
 * 문자열이라(계약 원칙 10) 모르는 값이 와도 **그대로 보이고** 색만 회색이 된다.
 */

import type { TrialInfo } from "@bpm/api-types/c17-test-run-info";

/** 아직 끝나지 않은 상태 — 콘솔이 되물어야 하는 것들 (C17 `TrialInfo.state`). */
const LIVE_STATES = new Set(["queued", "running", "waiting"]);

/** 계약의 상태 → 화면 표기 (`status_map` 「시험 실행」). */
const STATE_LABELS: Record<string, string> = {
  queued: "대기열",
  running: "실행 중",
  waiting: "기다리는 중",
  done: "완료",
  failed: "실패",
  cancelled: "중지됨",
};

export function isLive(state: string): boolean {
  return LIVE_STATES.has(state);
}

export function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

/**
 * 그 작업공간의 케이스가 담긴 파일 — **진입 정의 옆이다** (`cases/<이름>.cases.json`).
 *
 * 엔진이 그 자리만 보기 때문이다 (`core.testrun.runner`의 `read_cases`). 다른 정의의 케이스를
 * 목록에 올리면 고른 사람에게는 있는 케이스인데 돌릴 때 「케이스가 없다」가 된다.
 */
export function caseFilePath(entry: string | null | undefined): string | null {
  if (!entry || !entry.endsWith(".bpmn")) return null;
  const name = entry.split("/").pop()?.slice(0, -".bpmn".length);
  return name ? `cases/${name}.cases.json` : null;
}

/**
 * 소요 — 끝난 실행은 `requested_at` → `updated_at`, 도는 중이면 지금까지다.
 *
 * **끝난 때를 따로 두지 않는다** (C17): 끝나면 더 바뀌지 않으므로 `updated_at`이 그때다.
 */
export function elapsed(trial: TrialInfo, now: number = Date.now()): string {
  const from = trial.requested_at ? Date.parse(trial.requested_at) : NaN;
  if (Number.isNaN(from)) return "—";
  const until = isLive(trial.state) ? now : Date.parse(trial.updated_at ?? "");
  const seconds = Math.max(0, Math.round(((Number.isNaN(until) ? now : until) - from) / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}분 ${seconds % 60}초` : `${minutes}분`;
  return minutes % 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${Math.floor(minutes / 60)}시간`;
}

/** 목록 한 줄의 케이스 칸 — 케이스 없이 돌린 것은 비교하지 않는다 (C17). */
export function caseLabel(trial: TrialInfo): string {
  return trial.case || "비교 안 함";
}

/** 수행 모드 표기 — **색 없이 글자로만** 보인다 (06-screens §3). */
export function modeLabel(mode: string | undefined): string {
  if (mode === "deterministic") return "결정 수행";
  if (mode === "autonomous") return "자율 수행";
  return mode ?? "";
}
