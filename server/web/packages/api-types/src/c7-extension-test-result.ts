/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 시험 호출의 답 — C15 결과와 같은 상태·출력·오류다. 아직이면 `state: pending`이고
 * `GET /resources/extensions/{id}/test-calls/{task_id}?wait_s=`로 다시 묻는다.
 */
export interface ExtensionTestResult {
  error?: {
    [k: string]: unknown;
  } | null;
  output?: {
    [k: string]: unknown;
  } | null;
  state: string;
  task_id: string;
  version: string;
  [k: string]: unknown;
}
