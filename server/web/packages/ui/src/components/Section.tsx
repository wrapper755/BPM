import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * 묶음 (스타일 가이드 §3 「Section」) — **카드 안쪽 맨 위에 제목, 그 아래 카드 폭 전체에 옅은 선**.
 *
 * 화면마다 같은 이름의 작은 함수를 두었더니 카드도 선도 없는 맨 글이 되어 상세 화면이 흩어져 보였다
 * (ADR-0164). 제목 오른쪽의 것(`action`)은 그 묶음에만 영향을 주는 단추·링크다 (U14).
 */
export interface SectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, action, children, className }: SectionProps) {
  return (
    <section data-section className={cn("min-w-0 rounded-lg border border-border-default bg-bg-surface shadow-sm", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3 md:px-5">
        <h2 className="text-body-lg font-semibold text-text-primary">{title}</h2>
        {action}
      </header>
      <div className="flex min-w-0 flex-col gap-3 px-4 py-4 md:px-5">{children}</div>
    </section>
  );
}

/**
 * 「이름 / 값」 줄 — 상세 화면의 요약 (ADR-0164). 한 줄에 이름은 왼쪽 회색, 값은 오른쪽이고 줄 사이에
 * 옅은 선. 여러 칸 격자로 흩지 않는다 — 넓은 화면에서 이름과 값이 멀어져 짝이 안 보였다.
 */
export function MetaList({ items, className }: { items: Array<[string, ReactNode]>; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-col divide-y divide-border-default", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-body-sm text-text-muted">{label}</dt>
          <dd className="m-0 min-w-0 text-right text-body-sm break-words text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
