/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /consumers/self/extensions` — 원본이 콘솔인 맡은 외부 확장 정의와 그 봉투를 검증할 공개키
 * (C15 §콘솔이 원본인 정의 받기, ADR-0141). 일꾼은 `keys`로 봉투를 다시 검증한다(C13 E6).
 */
export interface ConsumerExtensions {
  extensions?: ExtensionResource[];
  keys?: AdminKey[];
  [k: string]: unknown;
}
/**
 * 확장 하나 (C13 정의에서 모은 것).
 */
export interface ExtensionResource {
  checked_at?: string | null;
  contributes_summary?: {
    [k: string]: string[];
  };
  definition?: {
    [k: string]: unknown;
  } | null;
  definition_hash?: string | null;
  envelope?: {
    [k: string]: unknown;
  } | null;
  id: string;
  installed_on?: InstalledOn;
  name?: string | null;
  protocol?: string | null;
  publisher?: string | null;
  service_app_id?: string | null;
  source?: string | null;
  status?: string;
  status_reasons?: string[];
  tier: string;
  version: string;
  [k: string]: unknown;
}
/**
 * 이 확장을 가진 실행하는 쪽의 수와 버전 분포 (C4·C12 보고. Studio는 세지 않는다).
 */
export interface InstalledOn {
  by_version?: {
    [k: string]: number;
  };
  hosts?: number;
  [k: string]: unknown;
}
/**
 * Admin 공개키 하나. 철회된 키도 `revoked_at`과 함께 내려온다 (C4로 배포된다).
 */
export interface AdminKey {
  key_id: string;
  label?: string | null;
  public_key: string;
  revoked_at?: string | null;
  [k: string]: unknown;
}
