"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CON-20b 탐색기·속성 패널의 폭과 아래 탭의 높이 — **끌어서 바꾸고 최소·최대 안에 선다** (CON-20 [E]·[P]·[L]).
 *
 * 폭은 그 브라우저에만 기억한다(`localStorage` — 보는 사람의 편의다). 못 읽으면 기본 폭이다.
 */
export interface PanelSize {
  key: string;
  initial: number;
  min: number;
  max: number;
}

export const FILES_PANEL: PanelSize = { key: "bpm.workspace.files-width", initial: 256, min: 200, max: 480 };
export const DETAIL_PANEL: PanelSize = { key: "bpm.workspace.detail-width", initial: 288, min: 240, max: 560 };
/** 아래 탭(변수·검사·로그)의 **높이** — 같은 손잡이를 눕혀 쓴다. */
export const BOTTOM_PANEL: PanelSize = { key: "bpm.workspace.bottom-height", initial: 288, min: 120, max: 640 };

const clamp = (size: PanelSize, value: number) => Math.min(size.max, Math.max(size.min, Math.round(value)));

/** 패널 하나의 폭과 그 값을 바꾸는 함수. 바꿀 때마다 기억한다. */
export function usePanelWidth(size: PanelSize): [number, (next: number) => void] {
  const [width, setWidth] = useState(size.initial);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(size.key));
      if (saved) setWidth(clamp(size, saved));
    } catch {
      // 사생활 창·막힌 저장소 — 기본 폭으로 둔다.
    }
  }, [size]);
  const set = useCallback(
    (next: number) => {
      const value = clamp(size, next);
      setWidth(value);
      try {
        window.localStorage.setItem(size.key, String(value));
      } catch {
        // 위와 같다.
      }
    },
    [size],
  );
  return [width, set];
}

/**
 * 패널과 캔버스 사이의 막대. 끌면 크기가 바뀌고, 화살표 키로 16px씩, 두 번 누르면 기본 크기다.
 * `side`는 패널이 막대의 어느 쪽에 있나다 — 오른쪽 패널은 왼쪽으로, 아래 패널은 위로 끌어야 커진다.
 * 아래 패널이면 막대가 **눕는다**(위아래로 끈다).
 */
export function Splitter({
  label,
  size,
  width,
  side,
  onChange,
  onDone,
}: {
  label: string;
  size: PanelSize;
  width: number;
  side: "left" | "right" | "bottom";
  onChange: (next: number) => void;
  onDone: () => void;
}) {
  const start = useRef<{ at: number; width: number } | null>(null);
  const sign = side === "left" ? 1 : -1;
  const lying = side === "bottom";
  const at = (event: { clientX: number; clientY: number }) => (lying ? event.clientY : event.clientX);
  const [less, more] = lying ? ["ArrowDown", "ArrowUp"] : sign > 0 ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];

  return (
    <div
      role="separator"
      aria-orientation={lying ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      aria-valuenow={width}
      tabIndex={0}
      title={`${label} — 끌어서 ${lying ? "높이" : "폭"}를 바꿉니다. 두 번 누르면 처음 크기입니다.`}
      className={
        lying
          ? "group relative z-10 -my-1 h-2 shrink-0 cursor-row-resize touch-none outline-none"
          : "group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none"
      }
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { at: at(event), width };
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onChange(start.current.width + sign * (at(event) - start.current.at));
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        start.current = null;
        onDone();
      }}
      onDoubleClick={() => {
        onChange(size.initial);
        onDone();
      }}
      onKeyDown={(event) => {
        if (event.key !== less && event.key !== more) return;
        event.preventDefault();
        onChange(width + (event.key === more ? 16 : -16));
        onDone();
      }}
    >
      {/* 보이는 선은 가운데 1px — 올리거나 잡으면 짙어진다. */}
      <span
        className={`absolute bg-transparent group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary ${
          lying ? "inset-x-0 top-1/2 h-px -translate-y-1/2" : "inset-y-0 left-1/2 w-px -translate-x-1/2"
        }`}
      />
    </div>
  );
}
