/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/consumers` — 콘솔에서 일꾼 만들기 (C15 §일꾼 관리, ADR-0137). Center 관리자만.
 */
export interface ConsumerCreateRequest {
  name: string;
  /**
   * @minItems 1
   */
  topics: [string, ...string[]];
  [k: string]: unknown;
}
