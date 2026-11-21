/**
 * CON-20c 프로세스 표의 저작 상태 셈 — 배포·마지막 시험·검사 (ADR-0185). **화면을 모르는 것만** 여기 둔다.
 *
 * 데이터는 둘이다: C17 `GET /projects/{id}/status`(시험·검사·지은 것)와 C5 살아 있는 배포 목록.
 * **모르는 것은 추측하지 않는다** (U8) — 배포된 판을 지은 기록이 없으면 판만 말하고 「같음」이라 하지 않는다.
 * 판정·상태의 표기는 `status_map`의 것이다 (`lib/trials.ts`와 같은 결 — 색은 여기서 고르지 않는다).
 */

import type { ProcessStatus } from "@bpm/api-types/c17-process-status";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import { isLive, stateLabel } from "./trials";

export type DeployStand =
  | { kind: "none" }
  /** 배포된 판을 지은 묶음이 지금 묶음과 같다. */
  | { kind: "same"; version: string }
  /** 배포 뒤에 그림·케이스를 고쳤다. */
  | { kind: "changed"; version: string }
  /** 지은 기록이 없다 — 오래되어 지워졌거나 밖에서 올린 패키지다. */
  | { kind: "unknown"; version: string };

/**
 * 그 프로세스의 배포 — 작업공간 id 또는 **지은 패키지 id**로 찾는다(같지 않을 수 있다). 살아 있는 것 중
 * **가장 최근에 서명한 것** 하나를 말한다(실행기마다 판이 다르면 그것이 지금 내려가는 판이다).
 */
export function deployStand(
  workspaceId: string,
  status: ProcessStatus | undefined,
  deployments: DeploymentInfo[],
): DeployStand {
  const builds = status?.builds ?? [];
  const ids = new Set([workspaceId, ...builds.map((one) => one.package_id)]);
  const latest = deployments
    .filter((one) => !one.revoked_at && ids.has(one.bpm_process_id))
    .sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0];
  if (!latest) return { kind: "none" };
  const built = builds.find((one) => one.package_id === latest.bpm_process_id && one.version === latest.version);
  if (!built || !status) return { kind: "unknown", version: latest.version };
  return { kind: built.revision === status.revision ? "same" : "changed", version: latest.version };
}

export function deployText(stand: DeployStand): string {
  if (stand.kind === "none") return "배포 안 됨";
  if (stand.kind === "same") return `v${stand.version} · 같음`;
  if (stand.kind === "changed") return `v${stand.version} · 배포 뒤 고침`;
  return `v${stand.version}`;
}

export interface TrialStand {
  /** `status_map`의 무리 — 끝났으면 판정, 도는 중이면 상태다. */
  group: "시험 판정" | "시험 실행";
  label: string;
  at: string | null;
  /** 그 실행이 지금 묶음이 아니다 — 고치기 전의 그림을 돌렸다. */
  stale: boolean;
}

/** 마지막 시험 — 없으면 `null`(「—」). 끝났는데 판정이 비면 상태를 보인다(그대로 보이고 색만 회색). */
export function trialStand(status: ProcessStatus | undefined): TrialStand | null {
  const trial = status?.last_trial;
  if (!trial || !status) return null;
  const judged = !isLive(trial.state) && trial.verdict;
  return {
    group: judged ? "시험 판정" : "시험 실행",
    label: judged ? (trial.verdict as string) : stateLabel(trial.state),
    at: trial.requested_at ?? null,
    stale: Boolean(trial.revision) && trial.revision !== status.revision,
  };
}

/**
 * 검사 — **지금 묶음의 것만** 온다(C17). 「흠 없음」과 「검사 안 함」은 다른 말이다 (`lib/checks.ts`의 `summary`와 같은 까닭).
 */
export function checkText(status: ProcessStatus | undefined): string {
  if (!status) return "—";
  const check = status.check;
  if (!check) return "검사 안 함";
  if (check.state === "pending") return "검사 중";
  if (check.state === "failed") return "검사 못 함";
  const errors = check.errors ?? 0;
  const warnings = check.warnings ?? 0;
  if (!errors && !warnings) return "흠 없음";
  const parts = [];
  if (errors) parts.push(`오류 ${errors}`);
  if (warnings) parts.push(`경고 ${warnings}`);
  return parts.join(" · ");
}
