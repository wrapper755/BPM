"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog, ErrorBanner } from "@bpm/ui";
import { withdrawApproval } from "@/app/actions";

/**
 * CON-04 「회수...」. **실행에 영향이 있다** (C6 `admin_withdraw`) — 실행하는 쪽은 「답 없이
 * 끝남」으로 받고, 그 노드에 오류 경계 이벤트가 없으면 실행이 실패로 끝난다. 확인 창이
 * 그렇게 말하고, 기본 단추는 「취소」다 (U9).
 */
export function WithdrawApproval({ requestId }: { requestId: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply() {
    start(async () => {
      const result = await withdrawApproval(requestId);
      setError(result.error ?? null);
      setSaid(result.error ? null : "회수했습니다. 그 노드에 오류 경계 이벤트가 없으면 실행은 실패로 끝납니다.");
      setAsking(false);
    });
  }

  return (
    // 제목 오른쪽에 선다 (CON-04 상세 [H]) — **칠하지 않는다**(`danger-quiet`, ADR-0164). 칠한 위험 단추는
    // 확인 창 안의 「회수」 하나다.
    <div className="flex flex-col items-end gap-2">
      <Button variant="danger-quiet" size="sm" disabled={pending} onClick={() => setAsking(true)}>
        회수...
      </Button>
      {error ? <ErrorBanner message={error} /> : null}
      {said ? (
        <p className="max-w-xs text-right text-body-sm text-text-secondary" role="status">
          {said}
        </p>
      ) : null}
      <ConfirmDialog
        open={asking}
        title="이 결재를 회수할까요?"
        description="이 결재를 회수합니다. 그 노드에 오류 경계 이벤트가 없으면 실행은 실패로 끝납니다."
        confirmLabel="회수"
        onConfirm={apply}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
