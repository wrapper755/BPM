/**
 * 결재 폼의 **조건부 칸** — 지금 고른 값으로 어느 칸을 보일지 (C6 `when`, ADR-0188).
 *
 * **보이기만 한다. 판정은 Center다** (`contracts.approvals.field_applies`) — JS가 없으면 모든
 * 칸이 보이고, 조건이 맞지 않는 칸에 적은 값은 Center가 버린다. 그래서 여기 규칙이 어긋나도
 * 답이 틀리지는 않고 「보이는 것」만 다르다. 규칙은 같게 둔다 — 이어지고, `true`는 `1`이 아니다(`===`).
 */

import type { FormField } from "@bpm/api-types/c6-approval-info";

/** 폼에서 칸 하나의 값 — 서버 액션 `readAnswer`와 같은 결로 읽는다. 없으면 `undefined`. */
export function formValue(field: FormField, data: FormData): unknown {
  const raw = data.get(field.key);
  if (field.type === "bool") return raw === "on" || raw === "true";
  if (raw === null || String(raw) === "") return undefined;
  if (field.type === "choice") {
    // 브라우저는 글자로 준다 — 선택지의 원래 값으로 되돌려야 수·참거짓 선택지와 맞는다.
    return (field.choices ?? []).find((one) => String(one) === String(raw));
  }
  return String(raw);
}

/** 지금 값들(`key → 값`)로 **보일 칸**의 key 모음. 조건 없는 칸은 늘 있다. */
export function shownFields(fields: FormField[], values: Record<string, unknown>): Set<string> {
  const byKey = new Map(fields.map((one) => [one.key, one]));
  const applies = (field: FormField): boolean => {
    const seen = new Set<string>();
    let current: FormField | undefined = field;
    while (current?.when) {
      if (seen.has(current.key)) return false;
      seen.add(current.key);
      const target = byKey.get(current.when.field);
      if (!target || values[target.key] === undefined) return false;
      const value = values[target.key];
      if (!current.when.in.some((one) => one === value)) return false;
      current = target;
    }
    return true;
  };
  return new Set(fields.filter(applies).map((one) => one.key));
}

/** 폼에 조건부 칸이 하나라도 있나 — 없으면 클라이언트 조각을 싣지 않는다. */
export function hasConditions(fields: FormField[]): boolean {
  return fields.some((one) => one.when != null);
}
