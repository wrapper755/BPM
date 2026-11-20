"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, Menu } from "lucide-react";
import { AppTile, InfoTip } from "@bpm/ui";

/**
 * CON-00 [A]·[M] — **위 막대의 메뉴**다 ([ADR-0152](../../../../../docs/decisions/0152-console-chrome-is-one-top-bar.md)).
 *
 * 묶음 여섯이 **가로로** 서고(생애주기 차례라 왼쪽에서 오른쪽으로 읽힌다) 누르면 그 아래로 펼쳐진다.
 * 펼친 줄은 **이름 + 한 줄 설명**이다 — 설명이 **그 화면에 무엇이 있는지**를 말한다(ADR-0152 §2).
 * 넓은 화면에서는 이름만 서고 설명은 **말풍선**이다 — 좁은 화면의 한 장 메뉴는 말풍선이 뜨지 않아 글로
 * 둔다 (ADR-0170, U20).
 *
 * **줄이 하나인 묶음은 펼치지 않는다** — 「대시보드」·「배포」는 눌러서 바로 간다(펼쳐 봐야 같은 이름 하나다).
 *
 * 묶음 여섯은 **글자**이고 지금 자리의 묶음은 `primary` 2px 밑줄 + 굵게다 (ADR-0164 — ADR-0161의 알약을 걷었다).
 *
 * 좁은 화면(1024px 아래)에서는 여섯이 한 줄에 들어가지 않아 **단추 하나로 접고** 누르면 묶음·줄
 * 전부가 한 장에 펼쳐진다 — 결재함은 휴대폰에서도 답할 수 있어야 한다 (CON-00). 위 막대에서 접힌
 * 「누구인지」(`who`)는 그 장의 맨 아래에 선다.
 */

/** 탐색 한 줄. **아직 없는 화면에는 `href`가 없다** — 끄고 이유(`later`)를 화면 글로 보인다 (U3·U20, ADR-0162). */
export type NavItem =
  | { label: string; href: Route; note: string; later?: never }
  | { label: string; href?: never; note: string; later: string };

export type NavGroup = { label: string; items: NavItem[] };

/** 좁은 화면에서 **묶음 전부**를 한 장에 펼칠 때의 열쇠 — 묶음 이름과 겹치지 않는다. */
const ALL = "\u0000all";

export function TopNav({ groups, current, who }: { groups: NavGroup[]; current: string; who: string }) {
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
    <div ref={box} className="relative flex h-full min-w-0 flex-1 items-center gap-1">
      {/* 마크 + 이름 — 누르면 첫 화면이다 (ADR-0153). 가로 막대라 긴 마크가 제 폭으로 들어간다. */}
      <Link
        href="/dashboard"
        title="첫 화면"
        className="mr-1 flex shrink-0 items-center gap-2 rounded-md py-1 lg:mr-6"
      >
        {/* 앱 타일 — `primary` 둥근 정사각에 흰 기호 (ADR-0164). 24에 「BPM」 16이 짝이다 (ADR-0166). */}
        <AppTile />
        <span className="text-body-lg leading-none font-bold tracking-tight text-text-primary">BPM</span>
      </Link>

      {/* 좁은 화면 — 단추 하나. 누르면 묶음·줄 전부가 한 장에 뜬다. */}
      <button
        type="button"
        onClick={() => setOpen(open === ALL ? null : ALL)}
        aria-expanded={open === ALL}
        aria-label="메뉴"
        title="메뉴"
        className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-bg-subtle lg:hidden"
      >
        <Menu size={20} aria-hidden />
      </button>

      {/* 넓은 화면 — 묶음 여섯이 가로로. */}
      <nav aria-label="주요 탐색" className="hidden h-full min-w-0 lg:block">
        <ul className="m-0 flex h-full list-none items-stretch gap-1 p-0">
          {groups.map((group) => (
            <li key={group.label} className="relative flex items-stretch">
              <Group
                group={group}
                here={here?.label === group.label}
                open={open === group.label}
                onToggle={() => setOpen(open === group.label ? null : group.label)}
              />
              {open === group.label ? (
                <div className="console-menu absolute top-full left-0 z-50 mt-2 w-56 rounded-xl border border-border-default p-2 shadow-md">
                  <Rows items={group.items} current={current} onGo={() => setOpen(null)} tips />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </nav>

      {/* 좁은 화면의 한 장 — 묶음마다 이름 + 그 줄들. */}
      {open === ALL ? (
        <div className="console-menu fixed inset-x-2 z-50 max-h-[80vh] overflow-y-auto rounded-xl border border-border-default p-2 shadow-md sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-2 sm:w-80 lg:hidden" style={{ top: "calc(var(--size-topbar-height) + 4px)" }}>
          {groups.map((group) => (
            <div key={group.label} className="mb-1">
              {/* 묶음과 줄의 이름이 같으면(「대시보드」) **묶음 머리를 그리지 않는다** — 같은 말이 두 줄이 된다. */}
              {group.items.length === 1 && group.items[0]?.label === group.label ? null : (
                <p className="px-3 py-1 text-caption font-semibold text-text-muted">{group.label}</p>
              )}
              <Rows items={group.items} current={current} onGo={() => setOpen(null)} />
            </div>
          ))}
          <p className="mt-1 border-t border-border-default px-3 pt-2 pb-1 text-caption text-text-muted">{who}</p>
        </div>
      ) : null}
    </div>
  );
}

/** 묶음 하나 — **줄이 하나면 링크**, 여럿이면 펼치는 단추다. 지금 자리의 묶음은 `primary` 밑줄이다 (ADR-0164). */
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
  // 밑줄은 막대의 아래 선에 붙는다(안쪽 그림자 2px) — 묶음의 높이가 막대 전체다. 글자는 14 — 막대는 화면의
  // 제목 줄이라 본문 보조 글(13)보다 작아 보였다 (ADR-0167).
  const shape = `flex h-full items-center gap-1 px-3 text-body whitespace-nowrap transition-colors${
    here
      ? " font-semibold text-text-primary shadow-[inset_0_-2px_0_var(--primary)]"
      : open
        ? " text-text-primary"
        : " text-text-secondary hover:text-text-primary"
  }`;

  const only = group.items.length === 1 ? group.items[0] : null;
  if (only) {
    // 갈 곳이 없는 묶음은 **끄고 까닭을 눌러 펴는 「?」에** 둔다 (U3·U20, ADR-0162 — 말풍선은 휴대폰에서 안 뜬다).
    if (!only.href) {
      return (
        <span className={`${shape} text-text-muted`}>
          {group.label}
          <InfoTip label={`${group.label} 설명`}>{only.later}</InfoTip>
        </span>
      );
    }
    return (
      <Link href={only.href} className={shape} aria-current={here ? "true" : undefined}>
        {group.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className={shape}>
      {group.label}
      <ChevronDown size={14} aria-hidden className={open ? "rotate-180" : undefined} />
    </button>
  );
}

/**
 * 펼친 줄들 — **이름 + 한 줄 설명**. 고른 줄은 `primary.subtle` 바탕 + 굵게. `tips`면 설명은 말풍선이고
 * 보조기기에만 글로 읽힌다 (넓은 화면, ADR-0170).
 */
function Rows({
  items,
  current,
  onGo,
  tips = false,
}: {
  items: NavItem[];
  current: string;
  onGo: () => void;
  tips?: boolean;
}) {
  const note = tips ? "sr-only" : "block text-caption text-text-muted";
  return (
    <ul className="flex list-none flex-col gap-0.5 p-0">
      {items.map((item) =>
        item.href ? (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={onGo}
              title={tips ? item.note : undefined}
              aria-current={current === item.href ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 hover:bg-bg-subtle${
                current === item.href ? " bg-primary-subtle" : ""
              }`}
            >
              <span
                className={`block text-body-sm${current === item.href ? " font-semibold" : ""}`}
              >
                {item.label}
              </span>
              <span className={note}>{item.note}</span>
            </Link>
          </li>
        ) : (
          <li key={item.label}>
            {/* 아직인 까닭은 그 줄 아래 글로 (U3·U20, ADR-0162). */}
            <span className="block rounded-lg px-3 py-2 text-text-muted" title={tips ? `${item.note} — ${item.later}` : undefined}>
              <span className="flex items-center justify-between text-body-sm">
                {item.label}
                <span className="text-caption">아직</span>
              </span>
              <span className={tips ? "sr-only" : "block text-caption"}>{item.note}</span>
              <span className={tips ? "sr-only" : "block text-caption"}>{item.later}</span>
            </span>
          </li>
        ),
      )}
    </ul>
  );
}
