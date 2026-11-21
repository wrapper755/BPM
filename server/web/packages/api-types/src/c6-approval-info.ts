/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `GET /api/v1/approvals` — 콘솔(CON-04 결재함)이 읽는 모양.
 */
export interface ApprovalInfo {
  answer?: {
    [k: string]: unknown;
  } | null;
  answered_at?: string | null;
  answered_by?: string | null;
  answered_via?: string | null;
  assignees?: string[];
  bpm_process_id: string;
  created_at: string;
  delivered?: boolean;
  delivery_accepted?: boolean | null;
  delivery_reason?: string | null;
  description?: string | null;
  expires_at?: string | null;
  form?: Form | null;
  host: ApprovalHost;
  layer: string;
  node_id: string;
  node_instance: number;
  request_id: string;
  requested_by?: string | null;
  review?: {
    [k: string]: unknown;
  };
  review_digest?: string | null;
  run_id: string;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  state: string;
  title?: string | null;
  version: string;
  withdraw_reason?: string | null;
  [k: string]: unknown;
}
/**
 * 답의 모양. 없으면 「승인 / 반려」 두 단추다.
 */
export interface Form {
  fields?: FormField[];
  [k: string]: unknown;
}
/**
 * 결재 폼의 칸 하나. STU-04 결재 「출력」 표와 같은 모양이다.
 */
export interface FormField {
  choices?: unknown[] | null;
  default?: {
    [k: string]: unknown;
  };
  key: string;
  label: string;
  required?: boolean;
  type: string;
  when?: FieldCondition | null;
  [k: string]: unknown;
}
/**
 * 조건부 칸의 조건 (ADR-0188) — 앞에 오는 `choice`·`bool` 칸 `field`의 값이 `in` 안일 때.
 *
 * 모양이 맞는지(칸이 있는지·앞에 오는지·값이 선택지 안인지)는 C14 B12가 본다. 여기서 막으면
 * Center가 그림의 실수를 `input_invalid` 한 줄로 돌려줘 어디가 틀렸는지 모른다.
 */
export interface FieldCondition {
  field: string;
  in: unknown[];
  [k: string]: unknown;
}
/**
 * 이 결재를 올린 쪽.
 */
export interface ApprovalHost {
  id: string;
  name?: string | null;
  type: string;
  [k: string]: unknown;
}
