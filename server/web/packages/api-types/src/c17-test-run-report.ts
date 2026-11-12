/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 실행기가 올리는 시험 실행의 **진행과 끝** — `PUT /workspaces/{id}/test-runs/{run_id}`.
 *
 * **하트비트에 싣지 않는다** — 로그가 길고(수백 줄) 하트비트는 작은 JSON이다. 검사·짓기와 다른
 * 자리인 까닭이 그것이다. 지시는 그쪽들과 같이 Center에서 내려가고(`jobs[]`의 `test` 칸), 올리는
 * 것만 이 길이다 — 콘솔이 도는 중에도 로그와 노드 색을 본다 (CON-20).
 *
 * **배운 것은 여기 실려 올라오고 Center가 `memory/specs.json`에 적는다** (ADR-0028) — 엔진은
 * 파일을 쓰지 않고 실행기의 디스크는 그 실행이 끝나면 사라진다.
 */
export interface TrialReport {
  detail?: string;
  learned?: {
    [k: string]: unknown;
  } | null;
  log?: string[];
  node_states?: {
    [k: string]: string;
  };
  run_id: string;
  state: string;
  variables?: {
    [k: string]: unknown;
  };
  verdict?: string | null;
  [k: string]: unknown;
}
