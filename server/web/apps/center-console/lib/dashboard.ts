/** CON-21 대시보드가 세는 일 — **화면을 모르는 자리**다 ([ADR-0151](../../../../../docs/decisions/0151-console-follows-the-lifecycle.md) §3).
 *
 * `lib/summary.ts`와 같은 결이다: 전부 **순수 함수**이고 서버 호출도 JSX도 들이지 않는다.
 * 갈라 둔 까닭은 **셈을 시험으로 재려고**다 — 페이지 모듈은 `server-only`를 끌고 와 단위
 * 시험에서 불러올 수 없다.
 *
 * **0과 「못 셌다」는 다르다.** 여기서는 숫자만 세고, 그 API가 답하지 않은 카드를 「—」로
 * 그리는 일은 화면이 한다 (U3 — 까닭을 한 줄로 적는다).
 */

import type { ApprovalInfo } from "@bpm/api-types/c6-approval-info";
import type { JobInfo } from "@bpm/api-types/c5-job-info";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { RunInfo } from "@bpm/api-types/c3-run-info";
import type { ServerRunnerInfo } from "@bpm/api-types/c12-server-runner-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { quietlyBlocked } from "./summary";

/** 「오늘」의 폭 (시간) — 하루를 자르지 않고 **지금부터 24시간 전**까지다 (자정에 숫자가 0으로 떨어지지 않는다). */
export const TODAY_HOURS = 24;

/** 아직 내려가지 않은 작업의 상태 (C5 `JobInfo.state`) — 「대기열」이 세는 것들. */
export const WAITING_JOB_STATES = new Set(["pending", "queued", "dispatched"]);

export interface RunsToday {
  failed: number;
  done: number;
  running: number;
  waiting: number;
}

function hoursSince(at: string | null | undefined, now: number): number | null {
  if (!at) return null;
  const started = new Date(at).getTime();
  return Number.isNaN(started) ? null : (now - started) / 3_600_000;
}

/**
 * C1 「오늘 실행」 — **24시간 안에 시작한 실행**을 상태로 나눈다 (C3 `RunInfo.status`).
 *
 * 도는 중·기다리는 중은 **시작 시각을 보지 않는다** — 어제 시작해 아직 도는 실행도 「지금
 * 무슨 일이 있나」에 들어가야 한다. 끝난 것만 24시간으로 거른다.
 */
export function runsToday(runs: RunInfo[], now: number = Date.now()): RunsToday {
  const found: RunsToday = { failed: 0, done: 0, running: 0, waiting: 0 };
  for (const run of runs) {
    if (run.status === "running") found.running += 1;
    else if (run.status === "waiting") found.waiting += 1;
    else {
      const age = hoursSince(run.started_at, now);
      if (age === null || age > TODAY_HOURS) continue;
      if (run.status === "failed") found.failed += 1;
      else if (run.status === "success") found.done += 1;
    }
  }
  return found;
}

export interface WaitingApprovals {
  open: number;
  /** 담당자가 적히지 않은 결재 — **API로 답할 수 없다** (ADR-0081: 대리 답을 받지 않는다). */
  unassigned: number;
  /** 가장 오래 기다린 결재의 나이 (초). 없으면 `null`. 「417시간」이 아니라 「17일 9시간」으로 보이게 화면이 `duration`으로 접는다. */
  oldestSeconds: number | null;
}

/** C2 「기다리는 결재」 — 열린 결재만 센다 (`state: open`). */
export function waitingApprovals(rows: ApprovalInfo[], now: number = Date.now()): WaitingApprovals {
  const open = rows.filter((one) => one.state === "open");
  const ages = open.map((one) => hoursSince(one.created_at, now)).filter((one): one is number => one !== null);
  return {
    open: open.length,
    unassigned: open.filter((one) => (one.assignees ?? []).length === 0).length,
    oldestSeconds: ages.length > 0 ? Math.floor(Math.max(...ages) * 3600) : null,
  };
}

/** C3 「승인 기다리는 후보」 — 상태가 `candidate`인 판의 수 (BPM 프로세스·공유 프로세스 모두). */
export function candidates(rows: PackageInfo[]): number {
  return rows.filter((one) => one.status === "candidate").length;
}

export interface RunnerHealth {
  online: number;
  total: number;
  /** 준비에 문제가 있는 실행기 수 — 보고한 `readiness`에 **사람이 고칠** 막힘이 있는 것. */
  warning: number;
}

/**
 * C4 「실행기」 — 온라인 수와 **준비에 문제 있는 수**.
 *
 * 「준비」를 여기서 다시 판정하지 않는다 — 실행기가 보고한 `readiness[].ready`가 거짓인 줄이
 * 하나라도 있으면 그 실행기를 하나로 센다 (까닭은 CON-12의 `readinessLabel`이 푼다).
 * **일시 중지도 문제로 센다** — 사람이 멈춰 둔 것을 잊는 것이 위험이다.
 *
 * **보고가 없으면 문제로 세지 않는다** — 모르는 것을 흠으로 적지 않는다 (배포가 없으면 보고도 없다).
 *
 * **배포가 덮인 옛 판은 세지 않는다** — CON-02 띠와 같은 규칙이다(`quietlyBlocked`, ADR-0158).
 * 판을 올릴 때마다 옛 판이 「배포 철회」로 보고되니, 세면 실행기는 늘 「문제 있음」이고 CON-12에
 * 가 봐도 고칠 줄이 없다.
 */
export function runnerHealth(rows: ServerRunnerInfo[]): RunnerHealth {
  return {
    online: rows.filter((one) => one.online).length,
    total: rows.length,
    warning: rows.filter(
      (one) =>
        one.paused === true ||
        (one.readiness ?? []).some((state) => !state.ready && !quietlyBlocked(state.blocked ?? [])),
    ).length,
  };
}

export interface JobQueue {
  waiting: number;
  /** 가장 오래 기다린 작업의 나이 (초). 없으면 `null`. */
  oldestSeconds: number | null;
}

/** C5 「작업 대기열」 — 아직 실행이 되지 않은 작업 (C5 `JobInfo.state`). */
export function jobQueue(rows: JobInfo[], now: number = Date.now()): JobQueue {
  const waiting = rows.filter((one) => WAITING_JOB_STATES.has(one.state));
  const ages = waiting
    .map((one) => hoursSince(one.requested_at, now))
    .filter((one): one is number => one !== null);
  return {
    waiting: waiting.length,
    oldestSeconds: ages.length > 0 ? Math.floor(Math.max(...ages) * 3600) : null,
  };
}

export interface WorkspaceTip {
  total: number;
  /** 가장 최근에 고친 작업공간의 이름. 없으면 `null`. */
  latest: string | null;
}

/** C6 「작업공간」 — 수와 **가장 최근에 고친 것**. */
export function workspaceTip(rows: WorkspaceInfo[]): WorkspaceTip {
  const sorted = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { total: rows.length, latest: sorted[0]?.name ?? null };
}
