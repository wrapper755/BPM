/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/server-runner/heartbeat` — 기본 10초.
 *
 * **`restored[]`는 재시작 직후 첫 하트비트에만** 싣는다 — 저장소에서 되살려 **정말 이어 가는**
 * 실행만이다. 되살리지 못한 것은 여기 넣지 않고 C5 `run_status`에 사유와 함께 적는다
 * (ADR-0054 §4 — `runner_restarted`·`runner_version_changed`).
 */
export interface ServerRunnerHeartbeatRequest {
  approval_acks?: ApprovalAck[];
  build_results?: BuildResult[];
  capacity: Capacity;
  check_results?: CheckResult[];
  delegation_acks?: DelegationAck[];
  deployment_results?: DeploymentResult[];
  extensions?: ExtensionState[];
  job_acks?: JobAck[];
  message_acks?: MessageAck[];
  readiness?: Readiness[];
  restored?: string[];
  running?: RunningRun[];
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  status: string;
  unsent_events?: number | null;
  versions?: RunnerVersions | null;
  waiting?: WaitingRun[];
  [k: string]: unknown;
}
export interface ApprovalAck {
  accepted: boolean;
  reason?: string | null;
  request_id: string;
  [k: string]: unknown;
}
/**
 * 짓기 하나의 결과 (C12 `build_results[]`).
 *
 * **zip은 여기 싣지 않는다** — 하트비트는 작은 JSON이다. 다 지은 것은 C17의 올리기 길로 간다
 * (`POST /workspaces/{id}/builds/{build_id}/artifact`, ADR-0146).
 */
export interface BuildResult {
  build_id: string;
  ok: boolean;
  reason?: string | null;
  [k: string]: unknown;
}
/**
 * 자리 셈. **`running`은 기다리는 실행을 뺀 수**다 (ADR-0054 §5).
 *
 * Center가 빈자리를 `max - running`으로 계산한다 (C12 §Center가 작업을 나누는 규칙).
 *
 * **시험 자리는 따로 센다** ([ADR-0146](../../../../../docs/decisions/0146-design-work-has-its-own-lane.md)) —
 * 운영과 **서로 빌려주지 않는다**. 빌려주면 「설계자가 돌려 보는 동안 운영 작업이 밀리지 않는다」가
 * 그 자리에서 깨진다. 보고하지 않으면 0이고, 0이면 **그 실행기는 시험을 받지 않는다**.
 */
export interface Capacity {
  max: number;
  running: number;
  test_max?: number;
  test_running?: number;
  [k: string]: unknown;
}
/**
 * 검사 하나의 결과 (C12 `check_results[]`).
 */
export interface CheckResult {
  check_id: string;
  reason?: string | null;
  violations?: Violation[];
  [k: string]: unknown;
}
/**
 * 검사·검증 규칙 위반 하나. 응답 `detail[]`의 한 줄이 된다.
 *
 * C1의 검사 규칙(R1~R8), C2의 검증 규칙(V1~V8), C13의 E1~E6, C14의 B1~B14가 같은 모양을 쓴다.
 */
export interface Violation {
  code?: string | null;
  items?: string[];
  message: string;
  rule: string;
  severity?: string;
  [k: string]: unknown;
}
/**
 * 맡긴 결과 하나를 **받았다** (C12 §맡기기, ADR-0082).
 *
 * 받으면 Center가 그 값을 지운다 — 업무 값이 Center에 남는 시간을 줄인다 (원칙 6의 예외는
 * **좁게** 쓴다). ack가 오기 전에는 매번 다시 내려온다 (작업·메시지와 같다).
 */
export interface DelegationAck {
  accepted?: boolean;
  job_id: string;
  [k: string]: unknown;
}
/**
 * 배포 적용 결정 (CON-12 「최근 배치 결정」). 실행이 아니므로 C3로 보내지 않는다.
 */
export interface DeploymentResult {
  at: string;
  bpm_process_id: string;
  deployment_id: string;
  reason?: string | null;
  result: string;
  version: string;
  [k: string]: unknown;
}
/**
 * 설치된 확장 하나 (C13).
 *
 * **`enabled`와 `off`는 다른 것을 말한다** ([ADR-0043](../../../../../docs/decisions/0043-turned-off-extensions.md)):
 * `off`는 **사람이 껐다**(멀쩡한데 일부러 안 쓴다), `enabled=false`인데 `off`가 아니면 **흠이
 * 있다**(정의·판이 맞지 않는다). 화면이 「꺼짐」과 「호환 안 됨」을 가르는 자리다.
 */
export interface ExtensionState {
  definition_hash?: string | null;
  enabled?: boolean;
  id: string;
  off?: boolean;
  version: string;
  [k: string]: unknown;
}
/**
 * 이번 주기에 처리한 작업 하나.
 */
export interface JobAck {
  job_id: string;
  outputs?: {
    [k: string]: unknown;
  };
  position?: number | null;
  reason?: string | null;
  result: string;
  run_id?: string | null;
  [k: string]: unknown;
}
/**
 * 내려온 메시지 하나를 어떻게 했나 (C12 §메시지).
 */
export interface MessageAck {
  accepted: boolean;
  message_id: string;
  reason?: string | null;
  run_id?: string | null;
  [k: string]: unknown;
}
/**
 * 설치된 BPM 프로세스 하나의 준비 상태.
 */
export interface Readiness {
  blocked?: string[];
  bpm_process_id: string;
  missing_key_refs?: string[];
  ready: boolean;
  version: string;
  [k: string]: unknown;
}
/**
 * 지금 도는 실행 하나 — 스레드를 쥐고 있다.
 */
export interface RunningRun {
  bpm_process_id: string;
  job_id?: string | null;
  node_id?: string | null;
  run_id: string;
  started_at: string;
  version: string;
  [k: string]: unknown;
}
/**
 * C4 `Versions`와 **칸이 다르다** — 서버 실행기의 판이다.
 */
export interface RunnerVersions {
  core: string;
  server_runner: string;
  [k: string]: unknown;
}
/**
 * 상태만 남고 **일꾼을 놓은** 실행 (ADR-0054 §1·§3).
 *
 * `waiting_for`에 따라 **짝이 되는 칸이 있어야 한다** — 결재는 `request_id`, 메시지는
 * `message_name`, 타이머는 `until`, **PC 위임은 `job_id`**, **긴 외부 작업은 `task_id`**.
 * `validate_heartbeat()`가 그것을 본다.
 */
export interface WaitingRun {
  bpm_process_id: string;
  correlation?: {
    [k: string]: unknown;
  };
  job_id?: string | null;
  message_name?: string | null;
  request_id?: string | null;
  run_id: string;
  since: string;
  task_id?: string | null;
  until?: string | null;
  version: string;
  waiting_for: string;
  [k: string]: unknown;
}
