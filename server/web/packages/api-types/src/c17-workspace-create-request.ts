/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/workspaces` — 빈 한 벌을 만든다.
 *
 * `company`를 비우면 **부르는 계정의 회사**다 (C16). 만든 뒤에는 바뀌지 않는다.
 */
export interface WorkspaceCreateRequest {
  company?: string | null;
  description?: string | null;
  id: string;
  name: string;
  place?: Place | null;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  version?: string;
  [k: string]: unknown;
}
/**
 * 업무 자리 — BPM 프로세스(패키지 id)마다 하나. **회사는 적지 않는다** — 패키지의 회사다.
 */
export interface Place {
  department?: string | null;
  scope: string;
  staff?: string | null;
  [k: string]: unknown;
}
