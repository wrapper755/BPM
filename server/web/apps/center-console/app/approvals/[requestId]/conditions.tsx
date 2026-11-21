"use client";

import { useEffect, useRef } from "react";
import type { FormField } from "@bpm/api-types/c6-approval-info";
import { formValue, shownFields } from "@/lib/form-conditions";

/**
 * CON-04 「답하기」의 **조건부 칸**을 조건이 맞을 때만 보인다 (C6 `when`, ADR-0188).
 *
 * 폼은 그대로 서버가 그린 `<form>`이고 이 조각은 **숨기기만** 한다 — 칸마다 `data-field`를 단
 * 감싸개를 찾아 `hidden`을 켜고 끈다. JS가 없으면 이것이 돌지 않아 모든 칸이 보이고, 조건이
 * 맞지 않는 칸의 값은 Center가 버린다(판정은 Center다).
 *
 * **오류가 난 칸은 처음에는 보인다** — 답이 거부되면 고른 값 없이 다시 그려지므로, 오류가 가리키는
 * 칸이 숨어 있으면 고칠 자리를 찾지 못한다. 무엇이든 바꾸면 그때부터 조건대로다.
 */
export function ConditionalFields({ fields, bad }: { fields: FormField[]; bad: string[] }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    let first = true;
    const update = () => {
      const data = new FormData(form);
      const values: Record<string, unknown> = {};
      for (const field of fields) values[field.key] = formValue(field, data);
      const shown = shownFields(fields, values);
      if (first) for (const key of bad) shown.add(key);
      first = false;
      for (const box of form.querySelectorAll<HTMLElement>("[data-field]")) {
        box.hidden = !shown.has(box.dataset.field ?? "");
      }
    };
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [fields, bad]);
  return <span ref={anchor} hidden />;
}
