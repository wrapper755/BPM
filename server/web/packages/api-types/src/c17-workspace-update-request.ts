/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `PATCH /api/v1/workspaces/{id}` — STU-06이 하던 일.
 *
 * **생략한 칸은 그대로 둔다.** 회사는 여기 없다 — 만들 때 정해진다.
 */
export interface WorkspaceUpdateRequest {
  description?: string | null;
  entry?: string | null;
  name?: string | null;
  place?: Place | null;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  version?: string | null;
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
