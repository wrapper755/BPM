/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/projects` — 프로젝트 하나 (ADR-0175).
 *
 * `company`를 비우면 **부르는 계정의 회사**, Center 관리자면 기본 회사다 (C16). 만든 뒤에는 바뀌지 않는다.
 */
export interface ProjectCreateRequest {
  company?: string | null;
  description?: string | null;
  id: string;
  name: string;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  [k: string]: unknown;
}
