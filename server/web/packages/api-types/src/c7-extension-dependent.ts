/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /resources/extensions/{id}/dependents`의 한 줄 — 그 확장을 `requires.extensions`에 적은
 * **살아 있는 배포**의 BPM 프로세스 (CON-18 저장·내리기 확인 창).
 *
 * `pinned_hash`가 있으면 그 정의를 고정했다 — 새 판을 쓰려면 다시 승인·배포해야 한다(C1, ADR-0060).
 */
export interface ExtensionDependent {
  deployments: number;
  package_id: string;
  package_version: string;
  pinned_hash?: string | null;
  pinned_version?: string | null;
  [k: string]: unknown;
}
