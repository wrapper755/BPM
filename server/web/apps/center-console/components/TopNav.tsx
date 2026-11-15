"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, Menu } from "lucide-react";
import { BpmMark } from "@bpm/ui";

/**
 * CON-00 [A]·[M] — **위 막대의 메뉴**다 ([ADR-0152](../../../../../docs/decisions/0152-console-chrome-is-one-top-bar.md)).
 *
 * 묶음 여섯이 **가로로** 서고(생애주기 차례라 왼쪽에서 오른쪽으로 읽힌다) 누르면 그 아래로 펼쳐진다.
 * 펼친 줄은 **이름 + 한 줄 설명**이다 — 설명이 **그 화면에 무엇이 있는지**를 말한다(아이콘 말풍선
 * 한 마디를 대신한다, ADR-0152 §2).
 *
 * **줄이 하나인 묶음은 펼치지 않는다** — 「대시보드」·「저작」은 눌러서 바로 간다(펼쳐 봐야 같은 이름 하나다).
 *
 * 좁은 화면(1024px 아래)에서는 여섯이 한 줄에 들어가지 않아 **단추 하나로 접고** 누르면 묶음·줄
 * 전부가 한 장에 펼쳐진다 — 결재함은 휴대폰에서도 답할 수 있어야 한다 (CON-00).
 */

/** 탐색 한 줄. **아직 없는 화면에는 `href`가 없다** — 끄고 이유(`later`)를 말풍선에 보인다 (U3). */
export type NavItem =
  | { label: string; href: Route; note: string; later?: never }
  | { label: string; href?: never; note: string; later: string };

export type NavGroup = { label: string; items: NavItem[] };

/** 좁은 화면에서 **묶음 전부**를 한 장에 펼칠 때의 열쇠 — 묶음 이름과 겹치지 않는다. */
const ALL = "\u0000all";

export function TopNav({ groups, current }: { groups: NavGroup[]; current: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // **밖을 누르거나 `Esc`면 닫는다.** 펼친 동안에만 듣는다 — 늘 듣고 있으면 화면마다 비용이다.
  useEffect(() => {
    if (open === null) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const here = groups.find((group) => group.items.some((item) => item.href === current)) ?? null;

  return (
    <div ref={box} className="relative flex min-w-0 flex-1 items-center gap-1">
      {/* 마크 + 이름 — 누르면 첫 화면이다 (ADR-0153). 가로 막대라 긴 마크가 제 폭으로 들어간다. */}
      <Link
        href="/dashboard"
        title="첫 화면"
        className="mr-1 flex shrink-0 items-center gap-2 rounded-md px-1 py-1 md:mr-3"
      >
        <BpmMark className="h-5 w-auto" />
        <span className="text-body font-bold tracking-wide">BPM</span>
      </Link>

      {/* 좁은 화면 — 단추 하나. 누르면 묶음·줄 전부가 한 장에 뜬다. */}
      <button
        type="button"
        onClick={() => setOpen(open === ALL ? null : ALL)}
        aria-expanded={open === ALL}
        aria-label="메뉴"
        title="메뉴"
        className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-bg-subtle lg:hidden"
      >
        <Menu size={20} aria-hidden />
      </button>

      {/* 넓은 화면 — 묶음 여섯이 가로로. */}
      <nav aria-label="주요 탐색" className="hidden min-w-0 lg:block">
        <ul className="flex list-none items-center gap-0.5 p-0">
          {groups.map((group) => (
            <li key={group.label} className="relative">
              <Group
                group={group}
                here={here?.label === group.label}
                open={open === group.label}
                onToggle={() => setOpen(open === group.label ? null : group.label)}
              />
              {open === group.label ? (
                <div className="console-menu absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border border-border-default p-2 shadow-md">
                  <Rows items={group.items} current={current} onGo={() => setOpen(null)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </nav>

      {/* 좁은 화면의 한 장 — 묶음마다 이름 + 그 줄들. */}
      {open === ALL ? (
        <div className="console-menu absolute top-full left-0 z-50 mt-1 max-h-[80vh] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-border-default p-2 shadow-md lg:hidden">
          {groups.map((group) => (
            <div key={group.label} className="mb-1">
              {/* 묶음과 줄의 이름이 같으면(「대시보드」) **묶음 머리를 그리지 않는다** — 같은 말이 두 줄이 된다. */}
              {group.items.length === 1 && group.items[0]?.label === group.label ? null : (
                <p className="px-3 py-1 text-caption font-semibold text-text-muted">{group.label}</p>
              )}
              <Rows items={group.items} current={current} onGo={() => setOpen(null)} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 묶음 하나 — **줄이 하나면 링크**, 여럿이면 펼치는 단추다. 지금 자리의 묶음은 `primary` 밑줄이다. */
function Group({
  group,
  here,
  open,
  onToggle,
}: {
  group: NavGroup;
  here: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const shape = `flex items-center gap-1 rounded-md px-3 py-1.5 text-body-sm whitespace-nowrap hover:bg-bg-subtle${
    here ? " font-semibold" : ""
  }`;
  const mark = here ? (
    <span
      aria-hidden
      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
      style={{ backgroundColor: "var(--primary)" }}
    />
  ) : null;

  const only = group.items.length === 1 ? group.items[0] : null;
  if (only) {
    // 갈 곳이 없는 묶음은 **끄고 까닭을 말풍선에** 둔다 (U3).
    if (!only.href) {
      return (
        <span className={`${shape} text-text-muted`} title={only.later}>
          {group.label}
        </span>
      );
    }
    return (
      <Link href={only.href} className={shape} aria-current={here ? "true" : undefined}>
        {mark}
        {group.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className={shape}>
      {mark}
      {group.label}
      <ChevronDown size={14} aria-hidden className={open ? "rotate-180" : undefined} />
    </button>
  );
}

/** 펼친 줄들 — **이름 + 한 줄 설명**. 고른 줄은 `primary.subtle` 바탕 + 굵게. */
function Rows({
  items,
  current,
  onGo,
}: {
  items: NavItem[];
  current: string;
  onGo: () => void;
}) {
  return (
    <ul className="flex list-none flex-col gap-0.5 p-0">
      {items.map((item) =>
        item.href ? (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={onGo}
              aria-current={current === item.href ? "page" : undefined}
              className={`block rounded-md px-3 py-2 hover:bg-bg-subtle${
                current === item.href ? " bg-primary-subtle" : ""
              }`}
            >
              <span
                className={`block text-body-sm${current === item.href ? " font-semibold" : ""}`}
              >
                {item.label}
              </span>
              <span className="block text-caption text-text-muted">{item.note}</span>
            </Link>
          </li>
        ) : (
          <li key={item.label}>
            <span className="block rounded-md px-3 py-2 text-text-muted" title={item.later}>
              <span className="flex items-center justify-between text-body-sm">
                {item.label}
                <span className="text-caption">아직</span>
              </span>
              <span className="block text-caption">{item.note}</span>
            </span>
          </li>
        ),
      )}
    </ul>
  );
}
