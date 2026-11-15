/** CON-21 대시보드가 세는 일 (`lib/dashboard.ts`) — **셈을 글이 아니라 숫자로** 본다.
 *
 * 거듭 보는 것 넷.
 *
 * 1. **도는 중·기다리는 중은 24시간으로 거르지 않는다** — 어제 시작해 아직 도는 실행도 「지금
 *    무슨 일이 있나」다. 끝난 것만 오늘로 거른다.
 * 2. **담당자 없는 결재를 따로 센다** — 그것만 API로 답할 수 없다 (ADR-0081).
 * 3. **0과 「없다」를 가른다** — 기다린 시간은 아무것도 없으면 `null`이고 0이 아니다.
 * 4. **일시 중지도 준비 문제로 센다** — 사람이 멈춰 둔 것을 잊는 것이 위험이다.
 */
import { describe, expect, it } from "vitest";
import type { ApprovalInfo } from "@bpm/api-types/c6-approval-info";
import type { JobInfo } from "@bpm/api-types/c5-job-info";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { RunInfo } from "@bpm/api-types/c3-run-info";
import type { ServerRunnerInfo } from "@bpm/api-types/c12-server-runner-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import {
  candidates,
  jobQueue,
  runnerHealth,
  runsToday,
  waitingApprovals,
  workspaceTip,
} from "./dashboard";

const NOW = new Date("2026-11-15T12:00:00+09:00").getTime();

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

function run(over: Partial<RunInfo>): RunInfo {
  return { run_id: "run_1", started_at: hoursAgo(1), status: "success", ...over } as RunInfo;
}

describe("오늘 실행 (C1)", () => {
  it("끝난 것은 24시간으로 거르고 도는 것은 거르지 않는다", () => {
    const found = runsToday(
      [
        run({ status: "failed", started_at: hoursAgo(2) }),
        run({ status: "failed", started_at: hoursAgo(30) }), // 어제 — 세지 않는다
        run({ status: "success", started_at: hoursAgo(5) }),
        run({ status: "running", started_at: hoursAgo(40) }), // 아직 돈다 — 센다
        run({ status: "waiting", started_at: hoursAgo(100) }), // 아직 기다린다 — 센다
      ],
      NOW,
    );
    expect(found).toEqual({ failed: 1, done: 1, running: 1, waiting: 1 });
  });

  it("시작 시각을 모르는 끝난 실행은 세지 않는다", () => {
    expect(runsToday([run({ status: "failed", started_at: null })], NOW).failed).toBe(0);
  });
});

function approval(over: Partial<ApprovalInfo>): ApprovalInfo {
  return {
    request_id: "apr_1",
    state: "open",
    created_at: hoursAgo(1),
    bpm_process_id: "fin.order",
    node_id: "Approve_x",
    node_instance: 1,
    layer: "approval",
    host: { type: "server_runner", id: "srv_1" },
    ...over,
  } as ApprovalInfo;
}

describe("기다리는 결재 (C2)", () => {
  it("열린 것만 세고 담당자 없는 것을 따로 센다", () => {
    const found = waitingApprovals(
      [
        approval({ assignees: ["김구매"], created_at: hoursAgo(3) }),
        approval({ assignees: [], created_at: hoursAgo(10) }),
        approval({ created_at: hoursAgo(50) }), // 칸이 아예 없다 — 담당자 없는 것이다
        approval({ state: "answered", created_at: hoursAgo(99) }),
      ],
      NOW,
    );
    expect(found).toEqual({ open: 3, unassigned: 2, oldestHours: 50 });
  });

  it("아무것도 없으면 기다린 시간은 null이다 (0이 아니다)", () => {
    expect(waitingApprovals([], NOW)).toEqual({ open: 0, unassigned: 0, oldestHours: null });
  });
});

describe("승인 기다리는 후보 (C3)", () => {
  it("상태가 후보인 판만 센다", () => {
    const rows = [
      { status: "candidate" },
      { status: "candidate" },
      { status: "approved" },
      { status: "deprecated" },
    ] as PackageInfo[];
    expect(candidates(rows)).toBe(2);
  });
});

/** 실행기가 올린 준비 상태 한 줄 (C12 `Readiness`) — 판정은 `ready` 하나다. */
function ready(ok: boolean) {
  return { bpm_process_id: "fin.order", version: "1.0.0", ready: ok, blocked: ok ? [] : ["extension_missing"] };
}

function runner(over: Partial<ServerRunnerInfo>): ServerRunnerInfo {
  return {
    server_runner_id: "srv_1",
    name: "서버 1",
    os: "ubuntu-24.04",
    online: true,
    capacity: { max_concurrency: 3 },
    ...over,
  } as ServerRunnerInfo;
}

describe("실행기 (C4)", () => {
  it("온라인 수와 준비 문제를 센다 — 일시 중지도 문제다", () => {
    const rows = [
      runner({ online: true, readiness: [ready(true)] }),
      runner({ online: true, paused: true, readiness: [ready(true)] }),
      runner({ online: false, readiness: [ready(false)] }),
    ];
    expect(runnerHealth(rows)).toEqual({ online: 2, total: 3, warning: 2 });
  });

  it("보고가 없으면 문제로 세지 않는다 — 모르는 것을 흠으로 적지 않는다", () => {
    expect(runnerHealth([runner({ readiness: undefined })])).toEqual({
      online: 1,
      total: 1,
      warning: 0,
    });
  });
});

describe("작업 대기열 (C5)", () => {
  it("내려가지 않은 작업만 세고 가장 오래 기다린 것을 분으로 준다", () => {
    const rows = [
      { state: "pending", requested_at: hoursAgo(0.5) },
      { state: "queued", requested_at: hoursAgo(2) },
      { state: "accepted", requested_at: hoursAgo(9) },
      { state: "expired", requested_at: hoursAgo(9) },
    ] as JobInfo[];
    expect(jobQueue(rows, NOW)).toEqual({ waiting: 2, oldestMinutes: 120 });
  });
});

describe("작업공간 (C6)", () => {
  it("가장 최근에 고친 것을 집는다", () => {
    const rows = [
      { name: "세금계산서 확인", updated_at: "2026-11-13T11:00:00+00:00" },
      { name: "수주 검토", updated_at: "2026-11-14T09:00:00+00:00" },
    ] as WorkspaceInfo[];
    expect(workspaceTip(rows)).toEqual({ total: 2, latest: "수주 검토" });
  });

  it("없으면 이름이 null이다", () => {
    expect(workspaceTip([])).toEqual({ total: 0, latest: null });
  });
});
