"use client";

import Link from "next/link";
import { Button, ErrorBanner } from "@bpm/ui";

/**
 * 화면이 예외로 죽었을 때 (H9, ADR-0162) — Next 기본 화면 대신 **한 줄 요약 + 다시 시도 + 나가는 길**(U13).
 *
 * 틀(`Shell`)은 서버에서 그리는 것이라 여기서는 그리지 못한다 — 그래서 대시보드로 가는 길을 둔다.
 * 원문은 「상세 보기」 안이다(운영 빌드에서는 Next가 지운 요약 번호(`digest`)만 온다).
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-16">
      <ErrorBanner
        message="화면을 그리지 못했습니다. 다시 시도해 보고, 되풀이되면 관리자에게 아래 상세를 알려 주세요."
        code={error.digest}
        details={error.message || undefined}
      />
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => retry()}>
          다시 시도
        </Button>
        <Link href="/dashboard" className="inline-flex items-center px-2 text-primary underline">
          대시보드로
        </Link>
      </div>
    </main>
  );
}
