import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * 오류 띠 (스타일 가이드 §3).
 *
 * 한 줄 요약(굵게) → 「상세 보기」 접힘 (U13). 오류 코드는 mono.
 * 문구는 **무엇이 + 왜 + 무엇을 하면 되는지** (§5): 「Center에 닿지 못했습니다 — 주소와 포트를
 * 확인하세요」.
 *
 * **`message`의 첫 줄이 요약이고 나머지는 상세다** — `details`를 따로 주지 않으면 둘째 줄부터 「상세 보기」에
 * 접는다. 콘솔이 Center 오류를 사람 말로 갈음하고 원문을 그 아래 줄에 싣는다 (ADR-0162).
 */
export interface ErrorBannerProps {
  /** 한 줄 요약. 둘째 줄부터는 `details`가 없을 때 「상세 보기」로 접힌다. */
  message: string;
  /** 계약의 오류 코드 (`key_revoked` 등). */
  code?: string;
  /** 접어 두는 상세 (본문·추적). */
  details?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function ErrorBanner({ message, code, details, action, className }: ErrorBannerProps) {
  const [summary, ...rest] = message.split("\n");
  const more = details ?? (rest.join("\n").trim() || null);
  return (
    <div
      role="alert"
      className={cn("rounded-lg border px-4 py-3", className)}
      style={{
        borderRadius: "var(--radius-lg)",
        borderColor: "var(--status-failed-solid)",
        backgroundColor: "var(--status-failed-bg)",
        color: "var(--status-failed-fg)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-body font-semibold">{summary}</p>
        {action}
      </div>
      {code ? <p className="mt-1 font-mono text-caption">{code}</p> : null}
      {more ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-body-sm">상세 보기</summary>
          <div className="mt-2 font-mono text-caption whitespace-pre-wrap">{more}</div>
        </details>
      ) : null}
    </div>
  );
}
