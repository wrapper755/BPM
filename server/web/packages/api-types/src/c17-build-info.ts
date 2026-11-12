/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 짓기 하나 — 콘솔이 「배포 후보로 만들기」의 진행과 끝을 본다.
 */
export interface BuildInfo {
  build_id: string;
  kind?: string;
  package_id?: string | null;
  reason?: string | null;
  requested_at?: string | null;
  requested_by?: string;
  revision?: string;
  state: string;
  version?: string | null;
  workspace_id: string;
  [k: string]: unknown;
}
