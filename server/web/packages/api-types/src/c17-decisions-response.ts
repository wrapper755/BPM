/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /api/v1/workspaces/{id}/decisions/{path}` — 그 파일의 결정표들.
 *
 * **결정표가 아닌 결정은 오지 않는다** — 격자로 그릴 것이 없다. 그래도 파일에는 남아 있고
 * 저장할 때 그대로 간다.
 */
export interface DecisionsResponse {
  revision?: string;
  tables?: DecisionTableInfo[];
  [k: string]: unknown;
}
/**
 * 결정 하나(`dmn:decision` + `dmn:decisionTable`)를 격자로 (ADR-0148).
 */
export interface DecisionTableInfo {
  hit?: string;
  id: string;
  inputs?: DecisionInputInfo[];
  name?: string;
  outputs?: DecisionOutputInfo[];
  rules?: DecisionRuleInfo[];
  [k: string]: unknown;
}
/**
 * 입력 열 하나. **이름은 `expression`**(`inputExpression` 본문)이고 `label`은 사람이 읽는 이름이다.
 */
export interface DecisionInputInfo {
  expression?: string;
  id?: string;
  label?: string;
  type?: string;
  [k: string]: unknown;
}
export interface DecisionOutputInfo {
  id?: string;
  name?: string;
  type?: string;
  [k: string]: unknown;
}
/**
 * 규칙 줄 하나 — **칸의 원문**이다 (판정용 모델은 칸을 해석해 버린다).
 */
export interface DecisionRuleInfo {
  cells?: string[];
  description?: string;
  id?: string;
  values?: string[];
  [k: string]: unknown;
}
