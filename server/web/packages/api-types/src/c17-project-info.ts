/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 프로젝트 하나. 파일이 없어 **DB가 원본**이다.
 */
export interface ProjectInfo {
  company: string;
  description?: string | null;
  id: string;
  name: string;
  processes: number;
  updated_at: string;
  updated_by: string;
  [k: string]: unknown;
}
