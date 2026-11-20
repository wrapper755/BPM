import { BpmSymbol } from "./bpm-mark";
import { cn } from "./cn";

/**
 * 앱 타일 — `primary` 둥근 정사각 안에 흰 정사각 기호 (스타일 가이드 §6-1, ADR-0164).
 *
 * 콘솔의 위 막대와 로그인이 쓴다 — 가로로 긴 흐름 마크는 작은 자리에서 연결선이 흐렸다(ADR-0163).
 * 크기는 둘이다 — 위 막대(`sm` 28)와 로그인(`lg` 40). 모서리도 크기를 따른다. 장식이라 읽지 않는다 —
 * 옆에 「BPM」 글자가 선다.
 */
export function AppTile({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-primary text-primary-fg",
        size === "lg" ? "size-10 rounded-lg" : "size-7 rounded-md",
        className,
      )}
    >
      <BpmSymbol className="size-[62%]" />
    </span>
  );
}
