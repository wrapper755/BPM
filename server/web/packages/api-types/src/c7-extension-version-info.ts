/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /resources/extensions/{id}/versions`의 한 줄 — CON-18 「판 기록」.
 */
export interface ExtensionVersionInfo {
  definition_hash: string;
  registered_at: string;
  registered_by?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  version: string;
  [k: string]: unknown;
}
