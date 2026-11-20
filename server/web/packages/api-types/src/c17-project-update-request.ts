/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `PATCH /api/v1/projects/{id}` — 이름·설명. **회사는 여기 없다** (안의 작업공간이 물려받았다).
 */
export interface ProjectUpdateRequest {
  description?: string | null;
  name?: string | null;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  [k: string]: unknown;
}
