/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /packages/{id}/{version}/nodes`의 한 줄 — 정의 안 노드 하나의 이름.
 *
 * 실행 기록(C3)은 노드를 id로만 가리킨다. **읽을 때** 패키지 정의에서 꺼낸다 (저장하지 않는다).
 */
export interface NodeLabel {
  id: string;
  kind: string;
  name?: string | null;
  [k: string]: unknown;
}
