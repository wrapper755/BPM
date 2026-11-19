"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@bpm/ui";

/**
 * CON-00 위 막대 「새로 고침」 — 지금 화면을 Center에서 다시 읽는다. 브라우저는 다시 그려 달라고만
 * 하고 Center를 부르는 것은 서버 쪽이다(`router.refresh()` — 토큰은 여기 오지 않는다).
 */
export function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    // 좁은 화면(640 아래)에서는 **아이콘만** — 위 막대에 메뉴 단추·배지가 설 자리를 남긴다 (ADR-0161). 이름은 말풍선과 보조기기에 남는다.
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      title="새로 고침"
      aria-label={pending ? "읽는 중" : "새로 고침"}
      className="px-2 sm:px-4"
    >
      <RefreshCw size={16} aria-hidden className={`sm:hidden${pending ? " animate-spin" : ""}`} />
      <span className="hidden sm:inline">{pending ? "읽는 중..." : "새로 고침"}</span>
    </Button>
  );
}
