/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 지시는 모두 여기 실려 내려온다 (ADR-0007).
 *
 * `deployments`는 **저장된 JSON 그대로** 다룬다 — C2 봉투를 모델로 바꿔 다시 직렬화하면
 * 서명이 깨진다 (C4와 같은 이유로 `dict`다).
 *
 * `jobs`는 **빈자리만큼만** 실린다 (C12 §Center가 작업을 나누는 규칙).
 */
export interface ServerRunnerHeartbeatResponse {
  admin_keys?: AdminKey[] | null;
  approvals?: ApprovalDispatch[];
  builds?: BuildDispatch[];
  cancel_jobs?: string[];
  checks?: CheckDispatch[];
  delegations?: DelegationResult[];
  deployments?: {
    [k: string]: unknown;
  }[];
  jobs?: JobDispatch[];
  key_expires_at?: string | null;
  messages?: MessageDispatch[];
  next_heartbeat_s?: number;
  paused?: boolean;
  restart?: boolean;
  rotated_key?: RotatedKey | null;
  server_time: string;
  [k: string]: unknown;
}
/**
 * Admin 공개키 하나. 철회된 키도 `revoked_at`과 함께 내려온다 (C4로 배포된다).
 */
export interface AdminKey {
  key_id: string;
  label?: string | null;
  public_key: string;
  revoked_at?: string | null;
  [k: string]: unknown;
}
/**
 * 답이 정해진 결재 (C6).
 */
export interface ApprovalDispatch {
  answer?: {
    [k: string]: unknown;
  };
  answered_at?: string | null;
  answered_by?: string | null;
  answered_via?: string | null;
  request_id: string;
  state: string;
  [k: string]: unknown;
}
/**
 * 내려온 짓기 지시 하나 (C12 `builds[]`). 검사와 같은 결 — **작업이 아니다**.
 */
export interface BuildDispatch {
  build_id: string;
  kind?: string;
  revision: string;
  workspace_id: string;
  [k: string]: unknown;
}
/**
 * 내려온 검사 지시 하나 (C12 `checks[]`). **작업이 아니다** — 실행 id도 C3 사건도 없다.
 */
export interface CheckDispatch {
  check_id: string;
  revision: string;
  workspace_id: string;
  [k: string]: unknown;
}
/**
 * 끝난 맡기기 하나 (C12 §맡기기) — 하트비트 응답으로 내려간다.
 *
 * **`outputs`가 업무 값이다** — 원칙 6의 명시한 예외이고, 올라오는 것은 그 BPM 프로세스가 **선언한
 * `outputs`만**이다 (C1). `state`가 `finished`가 아니면 실행기가 오류 경계로 넘긴다.
 */
export interface DelegationResult {
  child_run_id?: string | null;
  job_id: string;
  outputs?: {
    [k: string]: unknown;
  };
  reason?: string | null;
  run_id: string;
  state: string;
  [k: string]: unknown;
}
/**
 * 내려온 작업 하나. ack가 올 때까지 매번 실린다.
 */
export interface JobDispatch {
  bpm_process_id: string;
  expires_at?: string | null;
  inputs?: {
    [k: string]: unknown;
  };
  job_id: string;
  note?: string | null;
  place?: PlaceIdentity | null;
  requested_at: string;
  requested_by: string;
  test?: TrialTarget | null;
  version?: string | null;
  [k: string]: unknown;
}
/**
 * **작업의 주인** — Center가 서버 작업을 내려줄 때 붙인다 (C12 `JobDispatch.place`). 저장하지 않는다.
 *
 * 실행하는 쪽이 출처가 `company.*`·`department.*`·`staff.*`인 입력의 값으로 푼다
 * (`core.engine.sourced_inputs`). 그 자리에 없는 것(회사 자리 업무의 직원)은 비어 있다.
 */
export interface PlaceIdentity {
  company: OrgRef;
  department?: OrgRef | null;
  staff?: OrgRef | null;
  [k: string]: unknown;
}
/**
 * 조직 하나를 가리키는 id와 이름 — 실행하는 쪽이 값 출처로 푼다.
 */
export interface OrgRef {
  id: string;
  name: string;
  [k: string]: unknown;
}
/**
 * 시험 작업이 돌릴 것 — C4 `JobDispatch.test`에 실려 내려간다.
 *
 * **이 칸이 있으면 시험 작업이다** (ADR-0146). 배포가 없으므로 `bpm_process_id`·`version`은
 * 작업공간이 말해 주는 값이고, 실행기는 `revision`으로 묶음을 집어 간다.
 */
export interface TrialTarget {
  case?: string | null;
  mode?: string;
  revision: string;
  run_id?: string;
  workspace_id: string;
  [k: string]: unknown;
}
/**
 * 내려온 메시지 하나 — 기다리는 실행을 깨우거나 메시지 시작으로 새 실행을 만든다.
 */
export interface MessageDispatch {
  correlation?: {
    [k: string]: unknown;
  };
  message_id: string;
  name: string;
  payload?: {
    [k: string]: unknown;
  };
  received_at: string;
  [k: string]: unknown;
}
/**
 * 하트비트 답의 새 키 (C4 §키 회전). 새 키로 첫 요청이 올 때까지 주기마다 실린다.
 */
export interface RotatedKey {
  expires_at?: string | null;
  sealed_key: Sealed;
  [k: string]: unknown;
}
/**
 * 받는 쪽 공개키로만 열리는 한 덩이 (C4 §봉함).
 */
export interface Sealed {
  alg?: string;
  ciphertext: string;
  epk: string;
  nonce: string;
  [k: string]: unknown;
}
