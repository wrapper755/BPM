/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /api/v1/external-topics/{topic}/operations`의 한 줄 — 작업 하나의 일감 집계 (CON-17, ADR-0137).
 *
 * 업무 값·오류 글은 싣지 않는다 (원칙 6). 줄은 일꾼이 올린 manifest의 작업 전부와, 그 밖에 일감이 남은 작업이다.
 */
export interface TopicOperationStatus {
  completed_recent?: number;
  failed_recent?: number;
  kind?: string | null;
  last_error_code?: string | null;
  last_finished_at?: string | null;
  operation: string;
  recent_days?: number;
  waiting?: number;
  working?: number;
  [k: string]: unknown;
}
