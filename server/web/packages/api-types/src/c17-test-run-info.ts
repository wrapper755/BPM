/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 시험 실행 하나 — 상태·판정·로그·노드 색·변수 (CON-20 「시험 실행」).
 */
export interface TrialInfo {
  case?: string;
  detail?: string;
  learned?: number;
  log?: string[];
  mode?: string;
  node_states?: {
    [k: string]: string;
  };
  requested_at?: string | null;
  requested_by?: string;
  run_id: string;
  state: string;
  updated_at?: string | null;
  variables?: {
    [k: string]: unknown;
  };
  verdict?: string | null;
  workspace_id: string;
  [k: string]: unknown;
}
