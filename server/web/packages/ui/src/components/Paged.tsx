"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "../cn";

/**
 * `DataTable`의 쪽 나누기 (ADR-0165) — 그린 줄(표 줄·휴대폰 카드)을 받아 지금 쪽만 보인다.
 * 줄이 한 쪽 이하면 쪽 단추를 그리지 않는다. 쪽은 주소에 싣지 않는다 — 한 화면에 표가 여럿이라 겹친다.
 *
 * **표 머리는 위 막대 바로 아래에 붙어 선다** (ADR-0166). 틀이 `overflow-auto`면 스크롤 틀이 되어 머리가
 * 틀 안에만 붙었다(틀이 늘 제 키라 붙을 일이 없다). 그래서 틀은 평소 `overflow-x: clip`(스크롤 틀이 아니다 —
 * 모서리는 그대로 깎인다)이고, **표가 틀보다 넓을 때만** 가로 스크롤로 바꾼다 — 그때 머리는 틀 안에 남는다.
 */
export function Paged({
  size,
  cards,
  lines,
  head,
  caption,
  className,
}: {
  size: number;
  cards: ReactNode[];
  lines: ReactNode[];
  head: ReactNode;
  caption?: string;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);

  // 표가 틀보다 넓은지 — 폭이 바뀔 때마다 다시 잰다. 처음은 넓지 않다고 본다(`clip`이라 새지는 않는다).
  useEffect(() => {
    const box = frame.current;
    const table = box?.firstElementChild;
    if (!box || !table) return;
    const measure = () => setWide(table.scrollWidth > box.clientWidth + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    watch.observe(table);
    return () => watch.disconnect();
  }, []);

  const total = lines.length;
  const pages = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  const from = size > 0 ? page * size : 0;
  const to = size > 0 ? Math.min(from + size, total) : total;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden" aria-label={caption}>
        {cards.slice(from, to)}
      </ul>
      <div
        ref={frame}
        data-table-frame
        className={cn(
          "hidden border border-border-default bg-bg-surface shadow-sm md:block",
          wide ? "overflow-x-auto" : "overflow-x-clip",
        )}
        style={{ borderRadius: "var(--radius-lg)" }}
      >
        <table className="w-full border-collapse text-body">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead
            className={cn("z-10 bg-bg-subtle", wide ? "" : "sticky")}
            style={wide ? undefined : { top: "var(--size-topbar-height)" }}
          >
            {head}
          </thead>
          <tbody>{lines.slice(from, to)}</tbody>
        </table>
      </div>
      {pages > 1 ? <Pager page={page} pages={pages} from={from} to={to} total={total} onPage={setPage} /> : null}
    </div>
  );
}

/** 「11–20 / 134」와 맨 앞·앞·쪽 번호·뒤·맨 뒤 (ADR-0166). 번호는 처음·끝·지금 둘레만 보이고 사이는 「…」이다. */
function Pager({
  page,
  pages,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const near = new Set([0, pages - 1, page - 1, page, page + 1].filter((one) => one >= 0 && one < pages));
  const shown = [...near].sort((a, b) => a - b);
  const step = "inline-flex size-8 items-center justify-center rounded-md text-body-sm disabled:opacity-40";
  return (
    <nav aria-label="쪽" className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-body-sm text-text-muted tabular-nums">
        {from + 1}–{to} / {total}
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label="맨 앞 쪽"
          title="맨 앞"
          disabled={page === 0}
          onClick={() => onPage(0)}
          className={cn(step, "text-text-secondary hover:bg-bg-subtle")}
        >
          <ChevronsLeft size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="앞 쪽"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className={cn(step, "text-text-secondary hover:bg-bg-subtle")}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        {shown.map((one, index) => (
          <span key={one} className="flex items-center gap-1">
            {index > 0 && one - shown[index - 1]! > 1 ? <span className="px-1 text-text-muted">…</span> : null}
            <button
              type="button"
              aria-current={one === page ? "page" : undefined}
              onClick={() => onPage(one)}
              className={cn(
                step,
                "tabular-nums",
                one === page ? "bg-primary-subtle font-semibold text-primary" : "text-text-secondary hover:bg-bg-subtle",
              )}
            >
              {one + 1}
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-label="뒤 쪽"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className={cn(step, "text-text-secondary hover:bg-bg-subtle")}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="맨 뒤 쪽"
          title="맨 뒤"
          disabled={page >= pages - 1}
          onClick={() => onPage(pages - 1)}
          className={cn(step, "text-text-secondary hover:bg-bg-subtle")}
        >
          <ChevronsRight size={16} aria-hidden />
        </button>
      </span>
    </nav>
  );
}
