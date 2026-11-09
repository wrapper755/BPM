/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `PUT /consumers/self/address` — 원본이 콘솔인 정의를 받아 쓰는 일꾼이 지금 쓰는 주소를 알린다
 * (C15 §콘솔이 원본인 정의 받기, ADR-0141). 일꾼이 올리는 정의의 `address`와 같은 뜻이다.
 */
export interface ConsumerAddressUpload {
  address: ConsumerAddress;
  extension_id: string;
  [k: string]: unknown;
}
/**
 * 일꾼이 외부 앱을 부르는 주소 — 정의를 올릴 때 함께 알린다 (C15 `address`, ADR-0138).
 *
 * Center는 보여 주기만 한다 (CON-18 「쓰는 주소」). 주소는 일꾼 설정이 정하고 없으면 정의의 `base_url`이다.
 */
export interface ConsumerAddress {
  base_url?: string | null;
  test_base_url?: string | null;
  [k: string]: unknown;
}
