"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "../cn";

/**
 * 눌러 펴는 「?」 (스타일 가이드 §3, U20 — [ADR-0162](../../../../../../docs/decisions/0162-usability-heuristics-review.md)).
 *
 * 설명을 글로 펼 자리가 없을 때(표 칸의 표지·배지 옆) 쓴다. **말풍선(`title`)을 대신한다** —
 * 말풍선은 터치에서 뜨지 않아 휴대폰에서는 설명이 아예 없었다. 누르면 그 아래에 펴지고
 * `Esc`·밖을 누르면 닫힌다. 자리가 있으면 이것보다 **화면 글**이 먼저다.
 */
export interface InfoTipProps {
  /** 펴질 설명. */
  children: ReactNode;
  /** 단추 이름 (보조기기). 무엇에 대한 설명인지 말한다 — 「열린 모드 설명」. */
  label?: string;
  className?: string;
}

export function InfoTip({ children, label = "설명", className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  // 펴질 자리 — **화면 안에 가둔다**. 「?」 아래 가운데가 기본이고 가장자리에 닿으면 안쪽으로 민다
  // (위 막대의 열린 모드 배지는 좁은 화면에서 오른쪽에 붙어 가운데로 펴면 잘렸다).
  const [place, setPlace] = useState<{ left: number; top: number; width: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();

  // 펼친 동안에만 듣는다 — 표의 줄마다 붙으므로 늘 들으면 화면마다 비용이다.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // 화면에 붙여 편 것이라 굴리면 「?」와 떨어진다 — 굴리면 닫는다.
    const scrolled = () => setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  return (
    <span ref={box} className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          const at = box.current?.getBoundingClientRect();
          if (at) {
            const edge = 8;
            const width = Math.min(288, window.innerWidth - edge * 2); // 18rem, 좁으면 화면 폭 안
            const middle = at.left + at.width / 2 - width / 2;
            setPlace({
              left: Math.max(edge, Math.min(middle, window.innerWidth - width - edge)),
              top: at.bottom + 4,
              width,
            });
          }
          setOpen(!open);
        }}
        className="inline-flex size-6 items-center justify-center rounded-full text-text-muted hover:bg-bg-subtle hover:text-text-primary"
      >
        <CircleHelp size={14} aria-hidden />
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          style={place ? { left: place.left, top: place.top, maxWidth: place.width } : undefined}
          className="fixed z-50 block w-max rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left text-caption font-normal whitespace-pre-line text-text-secondary shadow-md"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
