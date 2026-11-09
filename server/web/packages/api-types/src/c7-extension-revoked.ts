/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `DELETE /resources/extensions/{id}` — 원본이 콘솔인 앱을 내린다: 철회하지 않은 판을 모두 철회한다.
 */
export interface ExtensionRevoked {
  id: string;
  revoked?: string[];
  [k: string]: unknown;
}
