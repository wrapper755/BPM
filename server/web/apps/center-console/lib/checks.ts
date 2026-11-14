/**
 * CON-20 아래 탭 「검사」가 쓰는 셈 — **화면을 모르는 것만** 여기 둔다 (`pnpm test`가 잰다).
 *
 * **판정은 하지 않는다** — 무엇이 흠인지는 실행기가 `core.testrun.readiness`로 정해 보내 준다
 * (C17 §실행 전 검사). 여기서는 온 줄을 **보기 좋게 세우기만** 한다: 막는 것 먼저, 그다음 경고.
 */

import type { CheckResponse, Violation } from "@bpm/api-types/c17-check-response";

/** 막는 흠인가 — **기본은 막는 쪽이다** (계약 `Violation.severity`, 적지 않으면 `error`). */
export function blocks(one: Violation): boolean {
  return (one.severity ?? "error") !== "warning";
}

/** 막는 것 먼저, 그 안에서는 규칙 이름 순. **원래 순서는 규칙마다라** 사람이 찾기 어렵다. */
export function sorted(violations: Violation[]): Violation[] {
  return [...violations].sort((a, b) => {
    if (blocks(a) !== blocks(b)) return blocks(a) ? -1 : 1;
    return a.rule.localeCompare(b.rule);
  });
}

export interface CheckCount {
  errors: number;
  warnings: number;
}

export function counts(violations: Violation[]): CheckCount {
  const errors = violations.filter(blocks).length;
  return { errors, warnings: violations.length - errors };
}

/**
 * 한 줄 요약. **「흠이 없습니다」와 「아직 검사하지 않았습니다」는 다른 말이다** — 뭉개면
 * 검사한 적 없는 그림이 통과한 것으로 읽힌다 (U8 — 모르는 것을 추측하지 않는다).
 */
export function summary(check: CheckResponse | null): string {
  if (!check) return "아직 검사하지 않았습니다.";
  if (check.state === "pending") return "검사하는 중입니다…";
  const { errors, warnings } = counts(check.violations ?? []);
  if (!errors && !warnings) return "흠이 없습니다.";
  const parts = [];
  if (errors) parts.push(`오류 ${errors}개`);
  if (warnings) parts.push(`경고 ${warnings}개`);
  return `${parts.join(" · ")} — 오류만 돌리기를 막습니다.`;
}

/** 검사가 아직 돌고 있는가 — 콘솔이 되물어야 하는 상태다 (지시는 하트비트로 내려간다). */
export function checking(check: CheckResponse | null): boolean {
  return check !== null && check.state === "pending";
}

/** 짓기가 아직 돌고 있는가 (C17 `BuildInfo.state`). */
export function building(state: string | undefined): boolean {
  return state === "queued" || state === "building";
}

/** 짓기 상태 → 화면 표기 (`status_map` 「배포 후보 짓기」). */
const BUILD_LABELS: Record<string, string> = {
  queued: "대기열",
  building: "짓는 중",
  done: "올렸음",
  failed: "실패",
};

export function buildLabel(state: string | undefined): string {
  return BUILD_LABELS[state ?? ""] ?? (state ?? "");
}
