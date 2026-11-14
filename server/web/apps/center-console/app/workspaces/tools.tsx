"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, ErrorBanner, Field } from "@bpm/ui";
import { createWorkspace, type ActionResult } from "@/app/actions";

/**
 * CON-20a의 손잡이 — 「새 작업공간」과 「파일에서 가져오기」는 **같은 창**이다.
 *
 * 가져오기도 작업공간 하나를 만들어 그 안에 넣는 일이라(C17 `POST …/import`), 창을 둘로 두면
 * 「가져오려면 먼저 만드세요」를 사람에게 떠넘기게 된다. 파일 칸은 비워 둘 수 있다.
 */
export function NewWorkspace() {
  const [open, setOpen] = useState<false | "empty" | "import">(false);
  const router = useRouter();
  const [result, action, pending] = useActionState<ActionResult, FormData>(async (previous, form) => {
    const made = await createWorkspace(previous, form);
    if (!made.error) {
      setOpen(false);
      router.refresh();
    }
    return made;
  }, {});

  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => setOpen("import")}>
        파일에서 가져오기...
      </Button>
      <Button variant="primary" onClick={() => setOpen("empty")}>
        새 작업공간...
      </Button>
      <Dialog
        open={open !== false}
        title={open === "import" ? "파일에서 가져오기" : "새 작업공간"}
        onClose={() => setOpen(false)}
      >
        <form action={action} className="flex flex-col gap-3">
          {result.error ? <ErrorBanner message={result.error} /> : null}
          <Field
            label="id"
            name="id"
            required
            autoComplete="off"
            autoCapitalize="none"
            help="영문 소문자·숫자·.·_·- 로 시작하는 64자까지. 배포 후보를 지을 때 그대로 패키지 id가 됩니다."
          />
          <Field label="이름" name="name" required autoComplete="off" />
          <Field label="판" name="version" defaultValue="0.1.0" help="다음에 지을 판입니다." />
          <Field label="설명" name="description" autoComplete="off" />
          {open === "import" ? (
            <label className="flex flex-col gap-1 text-body-sm">
              파일
              <input type="file" name="file" accept=".bpmn,.zip" className="text-body-sm" />
              <span className="text-text-muted">
                밖에서 그린 .bpmn 하나 또는 옛 작업 폴더 zip입니다. 받을 수 없는 자리의 파일이 있으면
                아무것도 넣지 않고 그 까닭을 말합니다.
              </span>
            </label>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={pending}>
              {open === "import" ? "가져오기" : "만들기"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
