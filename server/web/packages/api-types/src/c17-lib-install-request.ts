/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/workspaces/{id}/libs` — 공유 BPM 프로세스를 `libs/`에 푼다 (ADR-0048).
 */
export interface LibInstallRequest {
  package_id: string;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  version: string;
  [k: string]: unknown;
}
