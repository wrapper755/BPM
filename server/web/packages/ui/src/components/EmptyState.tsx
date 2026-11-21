import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * 빈 상태 (스타일 가이드 §3). **다음에 할 일을 말한다** (U12).
 *
 * 「설치된 BPM 프로세스가 없습니다. Center에서 배포하면 여기에 나타납니다.」
 *
 * `art`를 주면 문구 위에 **그림 하나**(96)가 선다 — 한 색 마스크 PNG의 주소이고 모양만 따서 `text-muted`로
 * 칠한다(밝게·어둡게는 칠하는 색만 바뀐다, ADR-0187). 그림은 장식이라 읽지 않는다. 주소는 앱이 정한다 —
 * 그림 파일은 그 앱의 `public/`에 있다.
 */
export interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  art?: string;
  className?: string;
}

export function EmptyState({ title, hint, action, art, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 border border-border-default bg-bg-surface px-6 py-12 text-center shadow-sm",
        className,
      )}
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      {art ? <EmptyArt src={art} /> : null}
      <p className="text-body font-medium text-text-primary">{title}</p>
      {hint ? <p className="text-body-sm text-text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function EmptyArt({ src }: { src: string }) {
  const mask = `url("${src}") center / contain no-repeat`;
  return <span aria-hidden className="mb-2 block size-24 bg-text-muted" style={{ mask, WebkitMask: mask }} />;
}
