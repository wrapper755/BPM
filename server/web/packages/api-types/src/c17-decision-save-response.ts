/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 저장한 뒤 — 새 `revision`과 **막지 않은 경고**(겹친 입력 이름·빈 규칙 줄).
 */
export interface DecisionSaveResponse {
  revision?: string;
  warnings?: string[];
  [k: string]: unknown;
}
