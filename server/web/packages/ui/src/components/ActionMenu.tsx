"use client";

import { useEffect, useRef, useState } from "react";
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
}

const WIDTH = 176;

export function ActionMenu({ items, label, disabled, className }: ActionMenuProps) {
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
          // 단추의 오른쪽 끝에 맞춰 펴되 화면 밖으로 나가지 않게 민다.
          const left = Math.max(8, Math.min(at.right - WIDTH, window.innerWidth - WIDTH - 8));
          setPlace({ left, top: at.bottom + 4 });
        }}
        className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary disabled:opacity-50"
      >
        <MoreHorizontal size={18} aria-hidden />
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
