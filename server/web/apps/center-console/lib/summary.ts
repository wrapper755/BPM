/** CON-01·CON-02·CON-12가 세는 일 — **화면을 모르는 자리**다 (`page.tsx`는 이것을 그릴 뿐이다).
 *
 * 여기 있는 것은 전부 **순수 함수**다: 서버 호출(`lib/center.ts`)도, JSX도, `next/*`도 들이지
 * 않는다. 갈라 둔 까닭은 **셈을 시험으로 재려고**다 — 페이지 모듈은 `server-only`를 끌고 와
 * 단위 시험에서 불러올 수 없다 (파이썬 쪽에서 「Qt를 모르는 함수」를 갈라 두는 것과 같은 결).
 *
 * CON-02의 세는 규칙은 C3 요약에서 온다. **끝난 실행만**, **버전마다 최근 20회만**, 확인률은
 * **그 칸을 보낸 실행만** 분모에 넣는다. CON-12 쪽은 C12 보고와 C5 배포를 맞춰 본다.
 * CON-01의 「이어 돈 기록」은 C3 `run_waiting`·`run_resumed` **두 줄을 짝지은** 것이다.
 */

import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import type { RunEvent } from "@bpm/api-types/c3-run-event";
import type { RunInfo } from "@bpm/api-types/c3-run-info";
import type { JobInfo } from "@bpm/api-types/c5-job-info";
import type { ServerRunnerInfo } from "@bpm/api-types/c12-server-runner-info";
import type { ScheduleInfo } from "@bpm/api-types/c5-schedule-info";
import type { ExternalTaskInfo } from "@bpm/api-types/c15-external-task-info";

/** 준비도를 재는 표본 (화면 문서 — 「최근 20회 실행 기준」). */
export const SAMPLE = 20;

/**
 * BPM 프로세스 하나당 훑어보는 실행 수. **버전마다 최근 20회**를 찾으려면 그보다 많이 봐야 한다
 * (한 BPM 프로세스에 여러 판이 돈다). 그래도 못 채운 버전은 **표본 수가 작게 보인다** — 비어 있는
 * 칸을 「0%」로 그리지 않는 것이 이 화면의 규칙이다.
 */
export const SCAN = 200;
/** 끝난 실행의 상태 (C3 `run_finished.status`) — 표본에 넣는 것들. 도는 중·기다리는 중은 세지 않는다. */
export const FINISHED = new Set(["success", "failed", "cancelled"]);
/** 한 (BPM 프로세스, 버전)의 집계 한 줄. */
export interface BotRow {
  id: string;
  version: string;
  name: string | null;
  status: string;
  run_location: string | null;
  /** 표본에 들어간 끝난 실행 수 (0이면 재지 않는다). */
  sample: number;
  successes: number;
  ai_tasks: number;
  replayed: number;
  /**
   * 확인 요청 수 (C3 `confirmations`). **그 칸을 보낸 실행만** 센다.
   *
   * 결재와 확인의 **합**(`human_requests`)은 여기서 세지 않는다 — 이 화면의 열이 아니다
   * (CON-01 목록의 「결재·확인」이 그것을 보인다).
   */
  confirmations: number;
  /** `confirmations`를 보낸 끝난 실행 수 — 「확인률」의 분모다 (0이면 재지 않는다). */
  confirm_sample: number;
  last_success: string | null;
  /** 이 판을 「실행 불가」로 보고한 실행기 수 (C4 `readiness.ready === false`). */
  blocked: number;
  /** 승인 창에 보일 「회사: … · 업무 자리: …」 (C16, ADR-0127 — 보여 주기만 한다). */
  place_line?: string;
  /** 그 실행기들이 말한 막은 점검 코드 (툴팁). */
  blocked_codes: string[];
  /** 이 판이 배포된 **실행기 수** — 살아 있는 배포의 `target.id`를 겹치지 않게 센다. */
  runners: number;
  /** 살아 있는 배포 **건수** (툴팁). 같은 실행기에 옛 배포가 살아 있으면 `runners`보다 크다. */
  deployments: number;
  /** Center에 없는 리소스 (C5 — 배포 때 거부된다). */
  missing: string[];
}
/** 비율 → 「72%」. **표본이 없으면 「—」**다 (0%로 보이면 「다 실패했다」로 읽힌다). */
export function percent(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  return `${Math.round((part / whole) * 100)}%`;
}
/**
 * `summarize`가 채우는 칸 — **실행 요약(C3)에서 오는 것뿐**이다.
 *
 * **세는 쪽은 제가 세지 않은 칸을 들고 다니지 않는다.** 전에는 반환 타입이 「패키지에서 오는
 * 칸만 뺀 나머지」였던 탓에 `summarize`가 `blocked`·`deployments`까지 **0으로 들고** 돌아왔고,
 * 줄을 짓는 자리에서 그것을 **나중에 펼쳐** 실제 값을 덮었다 — 끝난 실행이 있는 판은
 * 「실행 불가」·「배포된 실행기」가 늘 0이고 경고 띠도 뜨지 않았다.
 */
export type RunFields = Pick<
  BotRow,
  | "sample"
  | "successes"
  | "ai_tasks"
  | "replayed"
  | "confirmations"
  | "confirm_sample"
  | "last_success"
>;

/** 표본이 없는 판 — **0%가 아니라 「—」**로 그려진다 (`percent`가 `null`을 준다). */
export const NO_RUNS: RunFields = {
  sample: 0,
  successes: 0,
  ai_tasks: 0,
  replayed: 0,
  confirmations: 0,
  confirm_sample: 0,
  last_success: null,
};
/** 실행 요약들을 (BPM 프로세스, 버전)으로 묶어 **최근 20회만** 센다. */
export function summarize(runs: RunInfo[]): Map<string, RunFields> {
  const out = new Map<string, RunFields>();
  const counted = new Map<string, number>();
  for (const run of runs) {
    const id = run.bpm_process_id;
    const version = run.version;
    if (!id || !version || !run.status || !FINISHED.has(run.status)) continue;
    const key = `${id}@${version}`;
    const seen = counted.get(key) ?? 0;
    if (seen >= SAMPLE) continue; // 목록은 **새것부터** 온다 (C3 — 최근 20회가 앞쪽이다)
    counted.set(key, seen + 1);
    const found = out.get(key) ?? { ...NO_RUNS };
    found.sample += 1;
    if (run.status === "success") {
      found.successes += 1;
      // 목록이 새것부터 오므로 **처음 만난 성공**이 최근 성공이다.
      found.last_success = found.last_success ?? run.finished_at ?? run.started_at ?? null;
    }
    found.ai_tasks += run.ai_tasks ?? 0;
    found.replayed += run.replayed_tasks ?? 0;
    // **보낸 실행만** 센다 — 안 보낸 실행을 0으로 넣으면 확인률이 조용히 낮아진다 (C3).
    if (run.confirmations !== null && run.confirmations !== undefined) {
      found.confirmations += run.confirmations;
      found.confirm_sample += 1;
    }
    out.set(key, found);
  }
  return out;
}
/**
 * 「배포된 실행기」 — 그 판이 **살아 있는 배포로 걸린 실행기 수**와 그 건수 (C5).
 *
 * `target.id`를 겹치지 않게 세면 끝이다. 겹침을 지우는 까닭은 같은 판을 같은 실행기에 두 번
 * 배포할 수 있어서다(옛 배포가 살아 있는 채) — 그때 **건수는 실행기 수보다 크다**.
 * 전체(`"*"`) 대상은 한 자리로 센다.
 *
 * **등록된 실행기와 맞춰 보지 않는다.** 세는 것은 「배포가 가리키는 실행기」이고, 가리킨 것이
 * 아직 등록하지 않았으면 그것은 **보여야 하는 어긋남**이다 (잘못 서명한 배포가 0대로 숨으면
 * 아무도 못 찾는다). 어느 실행기가 정말 있는지는 CON-12가 말한다.
 */
export function deployedRunners(
  all: DeploymentInfo[],
  bot: string,
  version: string,
): { runners: number; deployments: number } {
  const mine = all.filter(
    (one) =>
      one.target.type === "server_runner" && one.bpm_process_id === bot && one.version === version,
  );
  return { runners: new Set(mine.map((one) => String(one.target.id))).size, deployments: mine.length };
}

// ───────────────────────────── CON-12 서버 실행 ─────────────────────────────

/**
 * 서버 실행기 상태 → `status_map` 「서버 실행기」의 표기 (C12 `status`는 열린 문자열이다).
 *
 * **오프라인이 먼저고, 그다음이 「일시 중지」다.** 오프라인이면 실행기가 보고한 `status`는
 * 지난 이야기라 「동작」으로 보이면 거짓이 되고, `paused`는 **Center의 뜻**이라 실행기가
 * 다음 하트비트로 알기 전에도 참이다 (거꾸로 두면 막 멈춘 실행기가 한 주기 동안 「동작」이다).
 */
export function runnerStatus(row: ServerRunnerInfo): string {
  if (!row.online) return "오프라인";
  // 재시작을 요청해 두었으면 실행기가 아직 듣지 못했어도 「재시작 중」이다 (ADR-0117).
  if (row.restart_requested_at) return "재시작 중";
  if (row.paused) return "일시 중지";
  const table: Record<string, string> = {
    running: "동작",
    paused: "일시 중지",
    draining: "재시작 중",
    error: "오류",
    offline: "오프라인",
  };
  return table[row.status] ?? row.status;
}

/**
 * **서버 배포**만 (C5). `runnerId`를 주면 그 실행기 것과 전체(`"*"`) 것으로 좁힌다.
 *
 * **활성 배포를 한 번 읽어 여기서** 좁힌다 (CON-06이 패키지 종류를 콘솔에서 가리는 것과 같은 결).
 * 대상 종류는 **열린 문자열이라**(C5 `JobTarget`) 모르는 종류가 올 수 있어 먼저 거른다 —
 * 섞이면 남의 봉투의 상한을 서버 대기열의 「BPM 프로세스별 상한 n」으로 보일 수 있다. 대기열은
 * 아직 어느 실행기에도 묶이지 않아(C12) `runnerId` 없이 부른다.
 */
export function serverDeployments(all: DeploymentInfo[], runnerId?: string): DeploymentInfo[] {
  return all.filter(
    (one) =>
      one.target.type === "server_runner" &&
      (runnerId === undefined || one.target.id === runnerId || one.target.id === "*"),
  );
}

/** 지금 그 BPM 프로세스를 돌리고 있는 실행 수 (C12 `running[]` — **기다리는 실행은 세지 않는다**). */
export function runningOfBot(row: ServerRunnerInfo, bot: string): number {
  return (row.running ?? []).filter((one) => one.bpm_process_id === bot).length;
}

/**
 * 그 BPM 프로세스의 **동시 실행 상한** — 배포 봉투에 적힌 값이다 (C12 §Center가 작업을 나누는 규칙 3).
 *
 * **적혀 있지 않으면 `null`이다.** 기본값(계약의 `DEFAULT_PER_BOT_CONCURRENCY`)을 여기 베껴
 * 적지 않는다 — 계약 쪽 숫자가 바뀌면 화면만 조용히 거짓말을 한다. 화면은 「기본」이라고 적고
 * 숫자를 지어내지 않는다.
 */
export function perBotLimit(deployments: DeploymentInfo[], bot: string): number | null {
  const found = deployments.find((one) => one.bpm_process_id === bot);
  return found?.max_concurrency ?? null;
}

/**
 * **확장이 없어서** 막힌 점검 코드 (`core.preflight`의 이름 그대로).
 *
 * 이름으로 어림하지 않고 **적어 둔다** — 「extension이 들어간 코드」로 걸렀더니
 * `task_types_unsupported`·`missing_agent_environment`가 빠져 화면이 「확장 없음」 대신
 * 「사전 점검 실행 불가」라고 했다 (운영자가 확장을 깔러 가는 대신 로그를 뒤진다).
 * 코드가 늘면 여기 더한다 — `extension_turned_off`는 **이 묶음이 아니다**(켜면 된다).
 */
const EXTENSION_MISSING_CODES = new Set([
  "task_types_unsupported",
  "extensions_unusable",
  "missing_agent_environment",
]);

/** 준비 상태의 알맹이 — C4·C12의 `Readiness`가 **같은 모양**이라 둘 다 들어온다. */
interface ReadinessLike {
  ready?: boolean;
  blocked?: string[];
}

/**
 * 보고된 준비 상태 → `status_map` 「BPM 프로세스 준비」의 표기와 툴팁 거리 (C4·C12 `Readiness`).
 *
 * 보고가 없으면 **`null`**이다 (「확인 전」이라고 단정하지 않는다 — 모르는 것을 안다고 하지
 * 않는다). 가르는 순서는 BUI-04와 **같고**, **「꺼 뒀다」와 「없다」는 다른 점검이다**
 * ([ADR-0043](../../../../../docs/decisions/0043-turned-off-extensions.md)) — 뭉치면 켜면 될 일에
 * 「판을 올리세요」라고 한다. CON-02와 CON-12가 **이 함수 하나**를 쓴다 (베끼면 갈라진다).
 */
export function readinessLabel(
  found: ReadinessLike | undefined,
): { label: string; detail: string[] } | null {
  if (!found) return null;
  if (found.ready) return { label: "준비됨", detail: [] };
  const blocked = found.blocked ?? [];
  // **배포가 정한 「실행 불가」가 먼저다** (ADR-0113) — 다시 배포받기 전에는 다른 것을 고쳐도 돌지 않는다.
  // 철회된 배포는 Center 목록에 없어 화면에 줄이 없으므로, 여기 오는 것은 사실상 기한이 지난 것이다.
  if (blocked.includes("deployment_withdrawn")) return { label: "배포 철회", detail: blocked };
  if (blocked.includes("deployment_expired")) return { label: "배포 만료", detail: blocked };
  if (blocked.includes("extension_turned_off")) return { label: "확장 꺼짐", detail: blocked };
  // **설정이 없는 것은 확장 문제가 아니다** (C1 `requires.settings`, ADR-0059) — 고치는 길이
  // 「설치하세요」가 아니라 「BUI-03에서 채우세요」다. 적어 두지 않으면 아래 「실행 불가」로
  // 떨어져 운영자가 로그를 뒤진다 (`EXTENSION_MISSING_CODES`에서 겪은 그 일이다).
  if (blocked.includes("settings_missing")) return { label: "설정 없음", detail: blocked };
  if (blocked.some((code) => EXTENSION_MISSING_CODES.has(code)))
    return { label: "확장 없음", detail: blocked };
  return { label: "사전 점검 실행 불가", detail: blocked };
}

/**
 * 그 배포가 이 실행기에서 **돌 준비가 됐는가** — 실행기가 보고한 `readiness`에서 찾는다 (C12).
 *
 * 판은 `version`까지 맞춰 본다 — 다른 판의 보고를 끌어다 쓰면 막 올린 판이 「준비됨」이 된다.
 */
export function runnerReadiness(
  row: ServerRunnerInfo,
  bot: string,
  version: string,
): { label: string; detail: string[] } | null {
  return readinessLabel(
    (row.readiness ?? []).find((one) => one.bpm_process_id === bot && one.version === version),
  );
}

/** CON-12 상세 「BPM 프로세스별 상한」 한 줄. */
export interface BotLimitRow {
  bot: string;
  version: string;
  /** 배포 봉투에 적힌 상한. **없으면 `null`** — 화면이 「기본」이라고 적는다. */
  limit: number | null;
  running: number;
  readiness: { label: string; detail: string[] } | null;
}

/**
 * 「BPM 프로세스별 상한」 — **배포가 줄을 정하고**, 실행 수와 준비는 실행기 보고에서 온다.
 *
 * 줄의 출처가 배포인 까닭: 배포됐는데 실행기가 아직 준비 상태를 올리지 않은 BPM 프로세스가 **보여야
 * 한다** (「배포는 했는데 왜 안 도나」가 이 화면에서 풀려야 한다). 거꾸로
 * `readiness`로 줄을 지으면 그 BPM 프로세스가 아예 사라진다.
 *
 * 철회된 배포는 부르는 쪽이 `active`로 걸러 온다. 같은 BPM 프로세스의 판이 둘 이상 살아 있으면 **줄도
 * 둘**이다 (실행기는 판마다 따로 준비 상태를 올린다).
 */
export function botLimitRows(
  row: ServerRunnerInfo,
  deployments: DeploymentInfo[],
): BotLimitRow[] {
  const seen = new Set<string>();
  const out: BotLimitRow[] = [];
  for (const one of deployments) {
    const key = `${one.bpm_process_id}@${one.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      bot: one.bpm_process_id,
      version: one.version,
      limit: one.max_concurrency ?? null,
      running: runningOfBot(row, one.bpm_process_id),
      readiness: runnerReadiness(row, one.bpm_process_id, one.version),
    });
  }
  return out.sort((a, b) => a.bot.localeCompare(b.bot) || a.version.localeCompare(b.version));
}

/**
 * 「대기 이유」 (CON-12 목록의 대기열 표) — C12 §Center가 작업을 나누는 규칙 3.
 *
 * Center가 적는 사유는 `per_bot_limit`이다. 사유 없이 남은 작업은 아직 보지도
 * 않은 것이라 「전체 상한」이고, 실행기가 **모두 멈춰 있으면** 빈자리가 0인 까닭이 상한이
 * 아니라 사람이 멈춘 것이므로 그렇게 말한다 (`free_slots`가 `paused`면 0을 준다).
 *
 * 등록된 실행기가 없을 때도 「전체 상한」이다 — 빈자리가 없는 것은 맞고, 실행기가 없다는 말은
 * 바로 위 빈 상태가 한다 (없는 표기를 지어내지 않는다).
 */
export function queueReason(
  job: JobInfo,
  runners: ServerRunnerInfo[],
  deployments: DeploymentInfo[],
): string {
  if (job.state_reason === "per_bot_limit") {
    const limit = perBotLimit(deployments, job.bpm_process_id);
    return limit === null ? "프로세스별 상한" : `프로세스별 상한 ${limit}`;
  }
  if (job.state_reason) return job.state_reason;
  if (runners.length > 0 && runners.every((one) => one.paused)) return "일시 중지";
  return "전체 상한";
}

/**
 * 「경과」·「기다린 시간」 — 지금과의 차 (CON-12 상세).
 *
 * `now`를 **받는다** — `Date.now()`를 들이면 이 셈을 시험으로 잴 수 없다. 앞으로의 시각(시계
 * 어긋남)은 **0초로 깎는다**(음수를 「-3분」으로 보이면 사람이 버그를 쫓는다).
 */
export function elapsed(since: string | null | undefined, now: number): string {
  if (!since) return "—";
  const at = new Date(since).getTime();
  if (Number.isNaN(at)) return "—";
  return duration(Math.max(0, (now - at) / 1000));
}

/**
 * 초 → 「3초」·「5분」·「2시간 10분」·「1일 3시간」 (CON-12 「경과」, CON-01 「기다린 시간」).
 *
 * **며칠을 기다리는 실행이 있다** (C12 — 서버 실행은 결재를 며칠 기다린다). 그래서 소요(초)와
 * 달리 큰 단위로 접는다 — 「259200초」는 사람이 읽고 다시 나눠야 한다.
 */
export function duration(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 ${minutes % 60}분`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

/** 「이어 돈 기록」 한 줄 — 기다림 한 번 (CON-01 상세). */
export interface ResumeRow {
  /** 기다리기 시작한 줄의 순번 (`run_waiting`) — 표의 열쇠다. */
  seq: number;
  /** 무엇을 기다렸나 (C3 `waiting_for` — 열린 문자열). */
  waiting_for: string;
  node_id: string | null;
  since: string;
  /** 타이머면 그 시각 (C3 선택 칸), 아니면 `null`. */
  until: string | null;
  /** 이어 간 시각. **아직 기다리는 중이면 `null`**이다. */
  resumed_at: string | null;
  /** 무엇이 깨웠나 (C3 `reason` — 선택 칸이라 없을 수 있다). */
  reason: string | null;
  /** 기다린 초 (C3 `after_s`). 아직 기다리는 중이면 `null`. */
  seconds: number | null;
}

/**
 * C3 `run_waiting`·`run_resumed`를 **짝지어** 기다림 목록을 만든다 (CON-01 「이어 돈 기록」).
 *
 * 두 줄은 **서버 실행만 남긴다** (C3 — PC BPM 프로세스는 기다리는 동안에도 실행 자리를 쥐고 있어
 * `node_state: waiting`만으로 뜻이 통한다). 그래서 PC 실행의 이 표는 늘 비어 있다.
 *
 * **기다린 시간은 보낸 쪽이 센 것(`after_s`)을 쓴다** — Center의 요약이 그렇듯 받는 쪽이 다시
 * 세지 않는다. 숫자가 아니면(옛 기록·잘린 줄) 두 줄의 시각 차로 메운다.
 *
 * **마지막 줄이 짝 없이 남을 수 있다** — 지금 기다리는 중이다. 그 줄도 보인다(「기다리는 중」)
 * — 빼면 「무엇을 기다리느라 멈춰 있나」가 화면에서 사라진다.
 */
export function resumes(events: RunEvent[]): ResumeRow[] {
  const out: ResumeRow[] = [];
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.kind === "run_waiting") {
      out.push({
        seq: event.seq,
        waiting_for: String(event.data?.waiting_for ?? ""),
        node_id: event.node_id ?? null,
        since: event.ts,
        until: event.data?.until ? String(event.data.until) : null,
        resumed_at: null,
        reason: null,
        seconds: null,
      });
      continue;
    }
    if (event.kind !== "run_resumed") continue;
    // 짝은 **아직 열려 있는 마지막 기다림**이다. 짝 없는 `run_resumed`는 (그 실행의 앞부분이
    // 아직 안 올라왔을 때) 줄을 지어내지 않고 버린다 — 기다린 자리를 모른다.
    const open = [...out].reverse().find((row) => row.resumed_at === null);
    if (!open) continue;
    const after = event.data?.after_s;
    open.resumed_at = event.ts;
    open.reason = event.data?.reason ? String(event.data.reason) : null;
    open.seconds =
      typeof after === "number" && Number.isFinite(after)
        ? after
        : Math.max(0, (new Date(event.ts).getTime() - new Date(open.since).getTime()) / 1000);
  }
  return out;
}

/** 이어 돈 횟수와 기다린 시간의 합 (CON-01 — 섹션 머리말). */
export function waitTotals(rows: ResumeRow[]): { resumed: number; seconds: number } {
  const done = rows.filter((row) => row.resumed_at !== null);
  return {
    resumed: done.length,
    seconds: done.reduce((sum, row) => sum + (row.seconds ?? 0), 0),
  };
}

/** CON-02 탭 — BPM 프로세스가 도는 곳 (C1 `run_location`, **생략하면 서버** — 서버 우선). */
export type Place = "server" | "pc";

export function placeOf(runLocation: string | null | undefined): Place {
  return runLocation === "pc" ? "pc" : "server";
}


// ─────────────────────────── CON-02 「일정」 (C5 §일정, ADR-0110) ───────────────────────────

/**
 * 일정 — **대상이 실행기인 것만** (ADR-0144로 대상이 한 종류다). 정렬은 Center가 한
 * 그대로다 (BPM 프로세스·버전·대상).
 */
export function schedulesOf(rows: ScheduleInfo[]): ScheduleInfo[] {
  return rows.filter((row) => row.target_type === "server_runner");
}

/** 「결과」 칸 — 작업을 만들었으면 그 상태, 거부됐으면 그 코드 (화면 문서). */
export function scheduleResult(
  row: ScheduleInfo,
  stateOf: (jobId: string) => string | undefined,
): { label: string; refused: boolean } {
  if (row.problem) return { label: "읽지 못하는 식 — 다시 올리세요", refused: true };
  if (row.last_error) return { label: `만들지 못함 — ${row.last_error}`, refused: true };
  if (!row.last_job_id) return { label: "—", refused: false };
  return { label: stateOf(row.last_job_id) ?? "—", refused: false };
}

/** 일정이 만든 작업의 요청자 (C5 예약값 `timer:<식>`) → 「일정 <식>」. 아니면 `null`. */
export function timerRequester(requestedBy: string | null | undefined): string | null {
  const found = requestedBy ?? "";
  return found.startsWith("timer:") ? `일정 ${found.slice("timer:".length)}` : null;
}

// ─────────────────────────── CON-01 「외부 작업」 (C15) ───────────────────────────

/** C15 일감 상태 → `status_map` 「외부 작업」 표기 (**열린 문자열**이라 모르는 값은 그대로 보인다). */
export const TASK_STATE: Record<string, string> = {
  pending: "기다림",
  locked: "일꾼이 처리 중",
  completed: "끝남",
  failed: "실패",
  expired: "만료",
  cancelled: "거둠",
};

/** C15 일꾼 종류 → 「종류」 칸 (ADR-0135). **열린 문자열**이라 모르는 값은 그대로 보인다. */
export const TASK_KIND: Record<string, string> = {
  ai: "AI",
  api: "API",
  rpa: "RPA",
};

/**
 * 「노드」 칸 — 반복 안이면 「#<차례>」, 다시 부른 것이면 「(<n>번째)」를 붙인다 (화면 문서).
 * 첫 차례·첫 시도는 붙이지 않는다 (모든 줄에 「#1」이 서면 읽을 것이 늘 뿐이다).
 */
export function taskPlace(row: Pick<ExternalTaskInfo, "node_id" | "node_instance" | "attempt">): string {
  const instance = (row.node_instance ?? 1) > 1 ? ` #${row.node_instance}` : "";
  const attempt = (row.attempt ?? 1) > 1 ? ` (${row.attempt}번째)` : "";
  return `${row.node_id}${instance}${attempt}`;
}

/**
 * 판 견주기 — **숫자 마디로** 본다 (`0.10.0` > `0.9.0`). 글자로 견주면 `0.10.0`이 `0.9.0` 앞에 온다.
 * 숫자가 아닌 마디(`1.0.0-rc1`의 `0-rc1`)는 글자로 견준다.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
    const x = left[at] ?? "0";
    const y = right[at] ?? "0";
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    const diff = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny;
    if (diff !== 0) return diff;
  }
  return 0;
}

/** CON-02 카드 한 장 — BPM 프로세스 하나와 그 판들. */
export interface ProcessGroup {
  id: string;
  name: string | null;
  /** 대표 판 — 카드 앞면의 지표가 이 판의 것이다. */
  lead: BotRow;
  /** 대표 판이 아닌 판들 (판이 높은 것부터) — 「다른 판」에 접힌다. */
  others: BotRow[];
  /** 철회되지 않은 판 중 「실행 불가」·「리소스 없음」이 있는 판. */
  troubled: BotRow[];
}

/** 대표 판을 고르는 차례 — 지금 쓰는 판이 앞이다. */
const LEAD_ORDER = ["approved", "candidate", "deprecated", "revoked"];

function leadRank(status: string): number {
  const at = LEAD_ORDER.indexOf(status);
  return at === -1 ? LEAD_ORDER.length : at;
}

/** 판들을 BPM 프로세스마다 묶는다 (판 차례는 정하지 않는다 — `sortGroups`가 한다). */
export function groupProcesses(rows: BotRow[]): ProcessGroup[] {
  const byId = new Map<string, BotRow[]>();
  for (const row of rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row]);
  return [...byId.entries()].map(([id, versions]) => {
    const ordered = [...versions].sort(
      (a, b) => leadRank(a.status) - leadRank(b.status) || compareVersions(b.version, a.version),
    );
    const lead = ordered[0]!;
    return {
      id,
      name: lead.name ?? versions.find((one) => one.name)?.name ?? null,
      lead,
      others: ordered.slice(1).sort((a, b) => compareVersions(b.version, a.version)),
      troubled: versions.filter(
        (one) => one.status !== "revoked" && (one.blocked > 0 || one.missing.length > 0),
      ),
    };
  });
}

/** 「상태」 거르기 — 기본은 철회를 뺀다 (되살아나지 않는 판이 화면을 차지하지 않게). */
export const STATUS_FILTERS = [
  { value: "active", label: "철회 빼고" },
  { value: "all", label: "전체" },
  { value: "approved", label: "승인됨" },
  { value: "candidate", label: "후보" },
  { value: "deprecated", label: "지원 종료" },
  { value: "revoked", label: "철회" },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export function statusFilterOf(value: string | undefined): StatusFilter {
  return STATUS_FILTERS.some((one) => one.value === value) ? (value as StatusFilter) : "active";
}

/**
 * 판을 거른 뒤 묶는다 — **대표 판도 거르기를 지난 판 중에서** 고른다(「후보」로 거르면 후보가
 * 앞면에 온다). 이름은 id·`name`에 든 글자로, 대소문자를 가리지 않는다.
 */
export function filterGroups(rows: BotRow[], query: { q?: string; status: StatusFilter }): ProcessGroup[] {
  const q = (query.q ?? "").trim().toLowerCase();
  const kept = rows.filter((row) => {
    if (query.status === "active" && row.status === "revoked") return false;
    if (query.status !== "active" && query.status !== "all" && row.status !== query.status) return false;
    return !q || row.id.toLowerCase().includes(q) || (row.name ?? "").toLowerCase().includes(q);
  });
  return groupProcesses(kept);
}

export type GroupSort = "trouble" | "name";

/**
 * 「문제 먼저」 — 경고가 있는 것, 대표 판의 성공률이 낮은 것, 표본이 없는 것, 이름 차례.
 * **판정이 아니라 차례만** 바꾼다 (CON-02 — 「투입 가능」 같은 판정은 두지 않는다).
 */
export function sortGroups(groups: ProcessGroup[], sort: GroupSort): ProcessGroup[] {
  const rate = (group: ProcessGroup) =>
    group.lead.sample > 0 ? group.lead.successes / group.lead.sample : Number.POSITIVE_INFINITY;
  return [...groups].sort((a, b) => {
    if (sort === "trouble") {
      const trouble = Number(b.troubled.length > 0) - Number(a.troubled.length > 0);
      if (trouble !== 0) return trouble;
      const diff = rate(a) - rate(b);
      if (diff !== 0 && !Number.isNaN(diff)) return diff;
    }
    return a.id.localeCompare(b.id);
  });
}
