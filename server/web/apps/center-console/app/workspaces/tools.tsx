"use client";

import { useActionState, useState } from "react";
import { Button, Dialog, ErrorBanner, Field } from "@bpm/ui";
import { createProject, type ActionResult } from "@/app/actions";

/**
 * CON-20a 「새 프로젝트」 (ADR-0175). **회사는 만든 뒤 바뀌지 않는다** — 창 안에 그렇게 적는다.
 *
 * 회사가 정해진 계정에게는 회사 칸이 없다(`companies`가 빈다) — 그 계정의 회사다 (C16).
 */
export function NewProject({ companies }: { companies: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<ActionResult, FormData>(createProject, {});

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        새 프로젝트...
      </Button>
      <Dialog open={open} title="새 프로젝트" onClose={() => setOpen(false)}>
        <form action={action} className="flex flex-col gap-3">
          {result.error ? <ErrorBanner message={result.error} /> : null}
          <Field
            label="id"
            name="id"
            required
            autoComplete="off"
            autoCapitalize="none"
            help="영문 소문자·숫자·.·_·- 로 시작하는 64자까지."
          />
          <Field label="이름" name="name" required autoComplete="off" />
          {companies.length > 0 ? (
            <label className="flex flex-col gap-1 text-body-sm">
              회사
              <select
                name="company"
                defaultValue={companies.length === 1 ? companies[0]?.id : ""}
                required
                className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
              >
                {companies.length > 1 ? <option value="">(고르세요)</option> : null}
                {companies.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
              <span className="text-text-muted">안의 프로세스가 이 회사를 물려받습니다. 만든 뒤에는 바꿀 수 없습니다.</span>
            </label>
          ) : null}
          <Field label="설명" name="description" autoComplete="off" />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={pending}>
              만들기
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
