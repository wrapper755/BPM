import { cn } from "../cn";
import { statusToken, type StatusGroup, type StatusToken } from "../status-map";

/**
 * 상태 배지 — 점 + 글자 (스타일 가이드 §3, ADR-0164).
 *
 * **글자를 생략하지 않는다.** 색만으로 뜻을 전하지 않기 때문이다 (§7).
 * 색은 `status_map`이 정한다 — 화면이 색을 고르지 않는다. 표기는 그 묶음에 있는 것만 쓴다.
 * 모르는 표기(계약의 상태 값은 열린 문자열이다)는 `neutral`로 보인다.
 */
export interface StatusBadgeProps {
  /** 어느 묶음의 상태인가 (`"BPM 프로세스"`, `"작업"` …). `status_map`의 열쇠다. */
  group: StatusGroup;
  /** 화면에 그대로 보일 표기 (`"실행 중"`). */
  label: string;
  className?: string;
}

export function StatusBadge({ group, label, className }: StatusBadgeProps) {
  const token: StatusToken = statusToken(group, label) ?? "neutral";
  // **점 + 글자, 바탕 없음** (ADR-0164) — 색은 지름 7px 점에만 있다. 표마다 줄마다 칠한 알약이 서면
  // 그것이 화면의 색 면이 되어 주 단추보다 시끄러웠다.
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-body-sm whitespace-nowrap text-text-primary", className)}>
      <span
        aria-hidden
        className="inline-block size-[7px] shrink-0 rounded-full"
        style={{ backgroundColor: `var(--status-${token}-solid)` }}
      />
      {label}
    </span>
  );
}
