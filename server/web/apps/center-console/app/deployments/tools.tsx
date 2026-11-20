"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu, ConfirmDialog, ErrorBanner } from "@bpm/ui";
import { revokeDeployment } from "@/app/actions";

/**
 * CON-15 「철회...」 — **되살릴 수 없어** 확인 창을 거치고 기본은 「취소」다 (U9). 줄 끝 「⋯」 안의 빨간 글자다
 * (ADR-0164 — 줄마다 빨간 단추가 서면 그것이 화면에서 가장 큰 소리였다).
 * Center가 철회 봉투에 서명하고, 현장은 다음 하트비트에 그 BPM 프로세스를 내린다.
 */
export function RevokeDeployment({ deploymentId, label }: { deploymentId: string; label: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <ActionMenu
        label={`${label} 동작`}
        disabled={pending}
        items={[{ label: "철회...", danger: true, onSelect: () => setAsking(true) }]}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <ConfirmDialog
        open={asking}
        title={`${label} 배포를 철회할까요?`}
        description="현장은 다음 하트비트에 이 프로세스를 내립니다. 도는 실행은 끝까지 갑니다. 되돌릴 수 없습니다 — 다시 쓰려면 새로 배포하세요."
        confirmLabel="철회"
        danger
        onConfirm={() =>
          start(async () => {
            const result = await revokeDeployment(deploymentId);
            setAsking(false);
            setError(result.error ?? null);
            if (!result.error) router.refresh();
          })
        }
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
