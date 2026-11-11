/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /resources/extensions` — 콘솔에서 HTTP 어댑터 앱을 만든다 (C13, ADR-0141).
 *
 * 정의는 C13 그대로이고 `tier: external`·`protocol: http-adapter`여야 한다. 판을 비우면 `0.1.0`이다.
 */
export interface ExtensionCreateRequest {
  definition: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
