/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * 만들기·토큰 새로 발급의 답 — **토큰 원문은 여기에만** 실린다 (Center는 해시만 둔다).
 */
export interface ConsumerCreated {
  addresses?: {
    [k: string]: ConsumerAddress;
  };
  approved_at?: string | null;
  approved_by?: string | null;
  apps?: string[];
  consumer_id: string;
  key_prefix?: string | null;
  kinds?: string[] | null;
  last_fetch_at?: string | null;
  name: string;
  source?: string | null;
  token: string;
  topic_kinds?: {
    [k: string]: string[];
  };
  topics?: string[];
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
