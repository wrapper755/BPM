/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /api/v1/projects/{id}/status`의 줄 하나 — 프로젝트 표(CON-20c)의 저작 상태 (ADR-0185).
 *
 * 작업공간마다 따로 물으면 호출이 프로세스 수의 세 배다 — 한 번에 준다. **배포는 싣지 않는다**
 * (C5 배포 목록이 말하고 콘솔이 `builds`의 묶음과 맞춰 본다).
 */
export interface ProcessStatus {
  builds?: BuiltPackage[];
  check?: CheckSummary | null;
  last_trial?: TrialSummary | null;
  revision: string;
  workspace_id: string;
  [k: string]: unknown;
}
/**
 * 다 지은 것 하나 — 배포된 판을 **지은 묶음**을 찾는 데 쓴다.
 */
export interface BuiltPackage {
  package_id: string;
  requested_at?: string | null;
  revision: string;
  version: string;
  [k: string]: unknown;
}
/**
 * **지금 묶음의** 검사 결과를 센 것 (`Violation.severity`로).
 */
export interface CheckSummary {
  checked_at?: string | null;
  errors?: number;
  state: string;
  warnings?: number;
  [k: string]: unknown;
}
/**
 * 가장 최근 시험 실행 하나 — 뜻은 `TrialInfo`와 같고 로그·변수는 싣지 않는다.
 */
export interface TrialSummary {
  requested_at?: string | null;
  revision?: string;
  run_id: string;
  state: string;
  updated_at?: string | null;
  verdict?: string | null;
  [k: string]: unknown;
}
