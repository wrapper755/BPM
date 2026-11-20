"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CON-20b 탐색기·속성 패널의 폭 — **끌어서 바꾸고 최소·최대 안에 선다** (CON-20 [E]·[P]).
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
 * 패널과 캔버스 사이의 세로 막대. 끌면 폭이 바뀌고, 화살표 키로 16px씩, 두 번 누르면 기본 폭이다.
 * `side`는 패널이 막대의 어느 쪽에 있나다 — 오른쪽 패널은 왼쪽으로 끌어야 넓어진다.
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
  side: "left" | "right";
  onChange: (next: number) => void;
  onDone: () => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const sign = side === "left" ? 1 : -1;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      aria-valuenow={width}
      tabIndex={0}
      title={`${label} — 끌어서 폭을 바꿉니다. 두 번 누르면 처음 폭입니다.`}
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onChange(start.current.width + sign * (event.clientX - start.current.x));
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
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onChange(width + (event.key === "ArrowRight" ? 16 : -16) * sign);
        onDone();
      }}
    >
      {/* 보이는 선은 가운데 1px — 올리거나 잡으면 짙어진다. */}
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
