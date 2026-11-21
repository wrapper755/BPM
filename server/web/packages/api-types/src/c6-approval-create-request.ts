/* 생성 파일: 계약 스키마에서 만든다 (플랫폼 + 확장이 소유한 것). 직접 고치지 말고
   계약 모델을 고친 뒤 `uv run python scripts/gen_schemas.py`,
   그다음 `pnpm --filter @bpm/api-types generate`. */

/**
 * `POST /api/v1/approvals` — 실행하는 쪽이 결재를 올린다.
 *
 * `request_id`는 `run_id`·`node_id`·`node_instance`와 **맞아야 한다**. 어긋나면 답이 엉뚱한
 * 노드로 돌아갈 수 있으므로 모델이 막는다.
 */
export interface ApprovalCreateRequest {
  assignees?: string[];
  bpm_process_id: string;
  description?: string | null;
  expires_at?: string | null;
  form?: Form | null;
  layer: string;
  node_id: string;
  node_instance: number;
  request_id: string;
  review?: {
    [k: string]: unknown;
  };
  run_id: string;
  /**
   * 이 계약의 schema 번호
   */
  schema: number;
  title?: string | null;
  version: string;
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
