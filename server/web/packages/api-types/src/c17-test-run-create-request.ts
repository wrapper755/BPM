/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/workspaces/{id}/test-runs`.
 *
 * **이름에 `Test`를 넣지 않는다** (`Trial…`) — pytest가 시험 클래스로 알고 모으려다 경고한다
 * (`core.testrun.RunSettings`와 같은 덫이다). 계약 문서의 길과 글은 「시험 실행」 그대로다.
 *
 * **케이스를 비우면 비교하지 않는다** (`비교 안 함`) — 그림을 그냥 돌려 보는 자리다.
 */
export interface TrialCreateRequest {
  case?: string | null;
  mode?: string;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  [k: string]: unknown;
}
