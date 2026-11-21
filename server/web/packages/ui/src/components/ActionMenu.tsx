"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../cn";

/**
 * 줄 끝의 「⋯」 (스타일 가이드 §3, [ADR-0164](../../../../../../docs/decisions/0164-neutral-pro.md)).
 *
 * 표의 줄 동작을 한 자리에 모은다 — 줄마다 빨간 「승인 철회...」가 서면 그것이 화면에서 가장 큰 소리였다.
 * **되돌릴 수 없는 것은 빨간 글자**로만 보인다. 고른 뒤의 확인 창(U9)은 부르는 쪽이 띄운다.
 * 펼친 목록은 화면 안에 가둔다(가장자리의 줄에서도 잘리지 않게). `Esc`·밖을 누르거나 굴리면 닫힌다.
 */
export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  /** 되돌릴 수 없는 동작 — 빨간 글자. */
  danger?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** 단추 이름 (보조기기) — 무엇의 동작인지 말한다: 「company1.sc03 0.3.0 동작」. */
  label: string;
  disabled?: boolean;
  className?: string;
  /** 「⋯」 대신 글이 있는 단추로 연다 (상세 패널의 「설정 더하기」). 펼친 목록은 단추의 왼쪽 끝에 맞춘다. */
  children?: ReactNode;
}

const WIDTH = 176;
/** 줄 하나의 높이 (`py-2` + `text-body-sm`) — 펼 자리를 어림한다. */
const ROW = 36;

export function ActionMenu({ items, label, disabled, className, children }: ActionMenuProps) {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const open = place !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPlace(null);
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={box} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          if (open) return setPlace(null);
          const at = event.currentTarget.getBoundingClientRect();
          // 단추의 오른쪽 끝에 맞춰(글 단추면 왼쪽 끝에) 펴되 화면 밖으로 나가지 않게 민다.
          const anchor = children ? at.left : at.right - WIDTH;
          const left = Math.max(8, Math.min(anchor, window.innerWidth - WIDTH - 8));
          // 아래에 자리가 없으면 위로 편다 — 패널 바닥의 단추에서 열면 목록이 화면 밖으로 잘렸다.
          const height = items.length * ROW + 8;
          const below = at.bottom + 4;
          const top = below + height > window.innerHeight - 8 ? Math.max(8, at.top - 4 - height) : below;
          setPlace({ left, top });
        }}
        className={
          children
            ? "inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-bg-surface px-3 text-body-sm text-text-primary shadow-sm hover:bg-bg-subtle disabled:opacity-50"
            : "inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary disabled:opacity-50"
        }
      >
        {children ?? <MoreHorizontal size={18} aria-hidden />}
      </button>
      {place ? (
        <ul
          role="menu"
          aria-label={label}
          style={{ left: place.left, top: place.top, width: WIDTH }}
          className="fixed z-50 m-0 list-none rounded-lg border border-border-default bg-bg-surface p-1 shadow-md"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlace(null);
                  item.onSelect();
                }}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-body-sm hover:bg-bg-subtle",
                  item.danger ? "text-status-failed-fg" : "text-text-primary",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
