/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 작업공간 하나 — `process.json`을 읽어 보인 것이다.
 *
 * **원본은 파일이다.** 담당자·태그처럼 매니페스트에 칸이 없는 값도 파일에는 그대로 남는다.
 */
export interface WorkspaceInfo {
  company: string;
  description?: string | null;
  entry?: string | null;
  id: string;
  name: string;
  place?: PlaceIdentity | null;
  revision: string;
  updated_at: string;
  updated_by: string;
  version: string;
  [k: string]: unknown;
}
/**
 * **작업의 주인** — Center가 서버 작업을 내려줄 때 붙인다 (C12 `JobDispatch.place`). 저장하지 않는다.
 *
 * 실행하는 쪽이 출처가 `company.*`·`department.*`·`staff.*`인 입력의 값으로 푼다
 * (`core.engine.sourced_inputs`). 그 자리에 없는 것(회사 자리 업무의 직원)은 비어 있다.
 */
export interface PlaceIdentity {
  company: OrgRef;
  department?: OrgRef | null;
  staff?: OrgRef | null;
  [k: string]: unknown;
}
/**
 * 조직 하나를 가리키는 id와 이름 — 실행하는 쪽이 값 출처로 푼다.
 */
export interface OrgRef {
  id: string;
  name: string;
  [k: string]: unknown;
}
