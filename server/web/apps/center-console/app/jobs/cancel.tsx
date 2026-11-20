"use client";

import { useState, useTransition } from "react";
import { ActionMenu, Button, ConfirmDialog, Dialog, ErrorBanner } from "@bpm/ui";
import { cancelJob } from "@/app/actions";
import { STOP_CONFIRM, type CancelControl } from "@/lib/jobs";

/**
 * CON-05 「취소」·「중지」 (C5 「취소」 표, ADR-0063). 어느 단추인지는 `cancelControl()`이 정한다.
 *
 * - 「취소」 — 대기·전달됨·대기열. 대기는 바로 「취소됨」이 되고, 전달됨·대기열은 **현장에
 *   물어본다** — 화면은 「취소 요청함 — 다음 하트비트에 반영」을 보이고, 그사이 시작됐으면
 *   「취소 못 함 — 이미 시작됨」이 붙는다.
 * - 「중지...」 — 도는 서버 실행. **한 일은 되돌리지 않아** 확인 창을 거친다(기본 「취소」).
 *   Center는 202로 받고 화면은 「중지 요청함 — 다음 하트비트에 반영」, 실행기가 닫으면 「취소됨」.
 *
 * 진행 글은 목록이 Center의 `cancel_requested`·`cancel_result`에서 다시 그린다 (지어내지 않는다).
 *
 * **목록의 줄에서는 「⋯」 메뉴 하나다**(`compact`, ADR-0164 — 「중지...」는 그 안의 빨간 글자). 줄 칸에는 오류를 펼
 * 자리가 없어 오류는 작은 창으로 보인다.
 */
export function CancelJob({
  jobId,
  control,
  compact,
}: {
  jobId: string;
  control: CancelControl;
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply() {
    start(async () => {
      const result = await cancelJob(jobId);
      setError(result.error ?? null);
      setAsking(false);
    });
  }

  if (control === null) return null;

  const confirm = (
    <ConfirmDialog
      open={asking}
      title="도는 실행을 멈출까요?"
      description={STOP_CONFIRM}
      confirmLabel="중지"
      danger
      onConfirm={apply}
      onCancel={() => setAsking(false)}
    />
  );

  if (compact) {
    return (
      <>
        <ActionMenu
          label="작업 동작"
          disabled={pending}
          items={[
            control === "cancel"
              ? { label: "취소", onSelect: apply }
              : { label: "중지...", danger: true, onSelect: () => setAsking(true) },
          ]}
        />
        {confirm}
        <Dialog
          open={error !== null}
          title="취소하지 못했습니다"
          onClose={() => setError(null)}
          footer={
            <Button variant="secondary" onClick={() => setError(null)}>
              닫기
            </Button>
          }
        >
          <ErrorBanner message={error ?? ""} />
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {control === "cancel" ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={apply}>
          취소
        </Button>
      ) : (
        <div>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => setAsking(true)}
          >
            중지...
          </Button>
        </div>
      )}
      {error ? <ErrorBanner message={error} /> : null}
      {confirm}
    </div>
  );
}
