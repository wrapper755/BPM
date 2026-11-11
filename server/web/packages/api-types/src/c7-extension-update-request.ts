/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `PUT /resources/extensions/{id}` — 원본이 콘솔인 정의를 고친다 = 새 판 (ADR-0141).
 *
 * `base_version`은 고치기 시작한 판이다 — 그 사이 다른 사람이 판을 올렸으면 409 `version_conflict`
 * (덮어쓰지 않는다). 정의의 `version`은 Center가 정한다(`base_version`의 끝자리 + 1) — 보내도 무시한다.
 */
export interface ExtensionUpdateRequest {
  base_version: string;
  definition: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
