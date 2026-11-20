"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@bpm/ui";
import { BAR_BUTTON } from "./bar-button";

/**
 * CON-00 위 막대 「새로 고침」 — 지금 화면을 Center에서 다시 읽는다. 브라우저는 다시 그려 달라고만
 * 하고 Center를 부르는 것은 서버 쪽이다(`router.refresh()` — 토큰은 여기 오지 않는다).
 */
export function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    // **늘 아이콘만**이다 — 이름은 말풍선과 보조기기에 있다 (ADR-0173, U20). 읽는 동안 돈다.
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      title="새로 고침"
      aria-label={pending ? "읽는 중" : "새로 고침"}
      className={BAR_BUTTON}
    >
      <RefreshCw size={18} aria-hidden className={pending ? "animate-spin" : undefined} />
    </Button>
  );
}
