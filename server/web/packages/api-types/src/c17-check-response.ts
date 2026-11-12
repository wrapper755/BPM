/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/workspaces/{id}/check`의 답.
 *
 * **오류만 돌리기를 막는다** — 경고는 보이고 사람이 판단한다 (C14 §검사 규칙).
 * `cached`면 실행기에 다시 묻지 않고 담아 둔 것을 준 것이다 (ADR-0146 — 저장할 때마다 묻지 않는다).
 */
export interface CheckResponse {
  cached?: boolean;
  checked_at: string;
  checked_revision: string;
  violations?: Violation[];
  [k: string]: unknown;
}
/**
 * 검사·검증 규칙 위반 하나. 응답 `detail[]`의 한 줄이 된다.
 *
 * C1의 검사 규칙(R1~R8), C2의 검증 규칙(V1~V8), C13의 E1~E6, C14의 B1~B14가 같은 모양을 쓴다.
 */
export interface Violation {
  code?: string | null;
  items?: string[];
  message: string;
  rule: string;
  severity?: string;
  [k: string]: unknown;
}
