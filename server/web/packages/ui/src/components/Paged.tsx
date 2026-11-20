"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "../cn";
import { PAGE_SIZES, pageHref, pageWindow } from "./paging";

/**
 * `DataTable`의 쪽 나누기 (ADR-0165·0167) — 그린 줄(표 줄·휴대폰 카드)을 받아 지금 쪽만 보인다.
 *
 * 두 갈래다. **`link`가 없으면 브라우저가 나눈다** — 받은 줄이 전부이고 쪽·줄 수는 여기의 상태다(쪽을 주소에
 * 싣지 않는다 — 한 화면에 표가 여럿이라 겹친다). **`link`가 있으면 서버가 이미 한 쪽만 그려 보냈다** — 쪽
 * 단추는 주소(`page`·`size`)로 가는 링크다 (ADR-0167 — 결재 1,032줄을 다 그려 보내 한 장이 8.3MB였다).
 * 줄이 가장 작은 쪽 하나 이하면 쪽 줄을 그리지 않는다.
 *
 * **표 머리는 위 막대 바로 아래에 붙어 선다** (ADR-0166). 틀이 `overflow-auto`면 스크롤 틀이 되어 머리가
 * 틀 안에만 붙었다(틀이 늘 제 키라 붙을 일이 없다). 그래서 틀은 평소 `overflow-x: clip`(스크롤 틀이 아니다 —
 * 모서리는 그대로 깎인다)이고, **표가 틀보다 넓을 때만** 가로 스크롤로 바꾼다 — 그때 머리는 틀 안에 남는다.
 */
export function Paged({
  size: initial,
  cards,
  lines,
  head,
  caption,
  className,
  link,
}: {
  size: number;
  cards: ReactNode[];
  lines: ReactNode[];
  head: ReactNode;
  caption?: string;
  className?: string;
  /** 서버가 자른 쪽 — 받은 줄은 이 쪽의 것뿐이다 (ADR-0167). */
  link?: { page: number; total: number; query: Record<string, string | undefined> };
}) {
  const [own, setOwn] = useState(0);
  const [ownSize, setOwnSize] = useState(initial);
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

  const size = link ? initial : ownSize;
  const page = link ? link.page : own;
  const total = link ? link.total : lines.length;
  const pages = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  const from = size > 0 ? page * size : 0;
  const to = size > 0 ? Math.min(from + size, total) : total;
  // 서버가 자른 줄은 그대로, 받은 줄 전부면 지금 쪽만.
  const shown = (rows: ReactNode[]) => (link ? rows : rows.slice(from, to));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden" aria-label={caption}>
        {shown(cards)}
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
          <tbody>{shown(lines)}</tbody>
        </table>
      </div>
      {size > 0 && total > PAGE_SIZES[0] ? (
        <Pager
          page={page}
          pages={pages}
          from={from}
          to={to}
          total={total}
          size={size}
          href={link ? (one, rows) => pageHref(link.query, one, rows) : undefined}
          onPage={setOwn}
          onSize={(rows) => {
            setOwnSize(rows);
            setOwn(0);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 「21–40 / 134」·한 쪽 줄 수와 맨 앞·앞·쪽 번호·뒤·맨 뒤 (ADR-0166·0167). 번호는 지금 쪽이 든 **열 개 묶음**이다.
 * `href`가 있으면 단추가 링크이고 줄 수를 고르면 그 주소로 간다.
 */
function Pager({
  page,
  pages,
  from,
  to,
  total,
  size,
  href,
  onPage,
  onSize,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  size: number;
  href?: (page: number, size: number) => string;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const step = "inline-flex size-8 items-center justify-center rounded-md text-body-sm";
  const go = (target: number, label: string, off: boolean, body: ReactNode, current = false, far = false) => {
    const shape = cn(
      step,
      // 휴대폰에서는 지금 쪽 ±2만 — 열 개가 두 줄로 접혔다 (ADR-0167).
      far && "max-sm:hidden",
      off && "pointer-events-none opacity-40",
      current ? "bg-primary-subtle font-semibold text-primary" : "text-text-secondary hover:bg-bg-subtle",
      typeof body === "number" && "tabular-nums",
    );
    if (href) {
      // 끈 자리는 링크가 아니다 — 갈 곳이 없다.
      return off ? (
        <span key={label} aria-label={label} aria-disabled className={shape}>
          {body}
        </span>
      ) : (
        <a key={label} href={href(target, size)} aria-label={label} aria-current={current ? "page" : undefined} className={shape}>
          {body}
        </a>
      );
    }
    return (
      <button
        key={label}
        type="button"
        aria-label={label}
        aria-current={current ? "page" : undefined}
        disabled={off}
        onClick={() => onPage(target)}
        className={shape}
      >
        {body}
      </button>
    );
  };
  return (
    <nav aria-label="쪽" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="flex items-center gap-3 text-body-sm text-text-muted">
        <span className="tabular-nums">
          {from + 1}–{to} / {total}
        </span>
        <label className="flex items-center gap-1.5">
          <select
            aria-label="한 쪽 줄 수"
            value={size}
            onChange={(event) => {
              const rows = Number(event.target.value);
              if (href) window.location.assign(href(0, rows));
              else onSize(rows);
            }}
            className="h-8 min-h-0 border border-border-default bg-bg-surface px-2 text-body-sm text-text-primary"
          >
            {PAGE_SIZES.map((rows) => (
              <option key={rows} value={rows}>
                {rows}줄씩
              </option>
            ))}
          </select>
        </label>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {go(0, "맨 앞 쪽", page === 0, <ChevronsLeft size={16} aria-hidden />)}
        {go(page - 1, "앞 쪽", page === 0, <ChevronLeft size={16} aria-hidden />)}
        {pageWindow(page, pages).map((one) => go(one, `${one + 1}쪽`, false, one + 1, one === page, Math.abs(one - page) > 2))}
        {go(page + 1, "뒤 쪽", page >= pages - 1, <ChevronRight size={16} aria-hidden />)}
        {go(pages - 1, "맨 뒤 쪽", page >= pages - 1, <ChevronsRight size={16} aria-hidden />)}
      </span>
    </nav>
  );
}
