"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, ErrorBanner, Field } from "@bpm/ui";
import { login, type ActionResult } from "@/app/actions";

/**
 * 아이디·비밀번호 두 칸과 「로그인」 하나 (CON-00). 역할은 계정이 정한다.
 *
 * 둘 다 당연히 필수라 「*」를 달지 않고, 비밀번호에는 **보기** 단추가 있다 (ADR-0164 — 휴대폰에서 오타가 잦다).
 */
export function LoginForm({ note, next }: { note?: string; next?: string }) {
  const [result, action, pending] = useActionState<ActionResult, FormData>(login, {});
  const [shown, setShown] = useState(false);
  return (
    <>
      {note && !result.error ? <p className="text-body text-text-secondary">{note}</p> : null}
      {result.error ? <ErrorBanner message={result.error} /> : null}
      <form action={action} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="아이디" name="username" required mark={false} autoComplete="username" autoCapitalize="none" />
        <Field
          label="비밀번호"
          name="password"
          type={shown ? "text" : "password"}
          required
          mark={false}
          autoComplete="current-password"
          trailing={
            <button
              type="button"
              onClick={() => setShown(!shown)}
              aria-label={shown ? "비밀번호 가리기" : "비밀번호 보기"}
              aria-pressed={shown}
              className="flex size-9 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
            >
              {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          }
        />
        <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-2 w-full">
          {pending ? "확인 중..." : "로그인"}
        </Button>
      </form>
    </>
  );
}
