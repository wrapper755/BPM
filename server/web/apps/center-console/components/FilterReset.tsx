"use client";

import Link from "next/link";
import type { Route } from "next";
import { createContext, useContext, type MouseEvent } from "react";
import { RotateCcw } from "lucide-react";

/** `AutoFilter` 안이면 칸을 비우고 다시 묻는 함수가 여기로 온다. */
export const FilterResetContext = createContext<(() => void) | null>(null);

/**
 * 거르기의 ↺ 「초기화」 — **글 칸 바로 옆의 아이콘 단추**다 ([ADR-0171](../../../../docs/decisions/0171-con-02-filter-says-what-the-table-says.md)).
 *
 * 속은 링크다 — JS가 없으면 `href`(조건 없는 주소)로 간다. JS가 있으면 `onClick`(CON-02 — 브라우저가
 * 거른다)이나 둘러싼 `AutoFilter`가 그 자리에서 비운다. 이름은 보조기기 이름 + 말풍선(아이콘 단추라서, U20).
 */
export function FilterReset({ href, onClick }: { href: string; onClick?: () => void }) {
  const fromForm = useContext(FilterResetContext);
  const reset = onClick ?? fromForm;
  return (
    <Link
      href={href as Route}
      scroll={false}
      aria-label="초기화"
      title="초기화"
      onClick={(event: MouseEvent) => {
        if (!reset) return;
        event.preventDefault();
        reset();
      }}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary"
    >
      <RotateCcw size={16} aria-hidden />
    </Link>
  );
}
