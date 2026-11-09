/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /resources/extensions/{id}/test-calls` — 저장한 판의 작업 하나를 시험 일감(`origin: test`)으로
 * 부른다 (CON-18 「시험 호출」, ADR-0141). 맡은 일꾼이 시험 주소로 부른다.
 */
export interface ExtensionTestCall {
  input?: {
    [k: string]: unknown;
  };
  operation: string;
  wait_s?: number;
  [k: string]: unknown;
}
