/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 서비스 앱 하나 (확장의 서버 부분).
 */
export interface ServiceAppResource {
  app_group?: AppGroup | null;
  app_id: string;
  base_url?: string | null;
  category?: string | null;
  checked_at?: string | null;
  console_url?: string | null;
  consumers?: number;
  extension_id?: string | null;
  groups?: OperationGroup[];
  keywords?: string[];
  manifest_at?: string | null;
  name?: string | null;
  operations?: Operation[];
  status?: string;
  status_reasons?: string[];
  used_by?: string[];
  version?: string | null;
  [k: string]: unknown;
}
/**
 * 연결 앱 목록(CON-17)에서 앱을 묶는 자리 — Camunda 요소 템플릿의 `category{id, name}` (ADR-0137).
 *
 * C11 `category`(업무용·시스템용)와는 다른 칸이다. C13 정의·C11 manifest가 같은 모양을 쓴다.
 */
export interface AppGroup {
  id: string;
  name: string;
  [k: string]: unknown;
}
/**
 * 앱 안 작업 묶음 하나 (C13 `adapter.groups`·C11 `groups`, OpenAPI 최상위 `tags`와 같은 결 — ADR-0137).
 *
 * 적힌 순서가 보이는 순서다. 실행에는 쓰이지 않는다.
 */
export interface OperationGroup {
  description?: string | null;
  id: string;
  name: string;
  [k: string]: unknown;
}
/**
 * 작업 하나. Studio가 이것만 보고 서비스 앱 태스크 편집기(STU-14)를 만든다.
 */
export interface Operation {
  description?: string | null;
  fallback?: string;
  group?: string | null;
  input_schema?: {
    [k: string]: unknown;
  } | null;
  keywords?: string[];
  kind?: string;
  modes?: string[];
  name: string;
  output_schema?: {
    [k: string]: unknown;
  } | null;
  required_scopes?: string[];
  server_ok?: boolean;
  timeout_s?: number;
  [k: string]: unknown;
}
