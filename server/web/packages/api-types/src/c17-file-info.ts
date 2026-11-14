/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 작업 폴더 안 파일 하나 (탐색기가 그린다).
 */
export interface FileInfo {
  path: string;
  revision: string;
  size_bytes: number;
  updated_at: string;
  updated_by: string;
  [k: string]: unknown;
}
