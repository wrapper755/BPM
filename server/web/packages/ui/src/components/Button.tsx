import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

/**
 * 단추 (스타일 가이드 §3).
 *
 * - `primary`는 **영역마다 하나**이고 할 일을 끝내는 단추에만 쓴다. 목록 머리의 「새 …」(창·폼을 여는 입구)는
 *   `tonal`이다 (ADR-0168). 창을 여는 단추는 글자 끝에 「...」를 붙인다 (문구 규칙).
 * - 할 일이 없으면 끄고, **왜 꺼졌는지 가까이에 적는다** (U3). `disabledReason`은 그 보조다 —
 *   화면이 문장으로도 적어야 한다.
 */
export type ButtonVariant = "primary" | "tonal" | "secondary" | "ghost" | "danger" | "danger-quiet";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border border-transparent",
  // 옅은 면 + `primary` 글자 — 칠하지 않은 입구 (ADR-0168). 누르면 `primary`를 8% 섞는다.
  tonal:
    "bg-primary-subtle text-primary border border-transparent hover:bg-[color-mix(in_srgb,var(--primary)_8%,var(--primary-subtle))]",
  secondary: "bg-bg-surface text-text-primary border border-border-default shadow-sm hover:bg-bg-subtle",
  ghost: "bg-transparent text-text-primary border border-transparent hover:bg-bg-subtle",
  danger: "bg-status-failed-solid text-danger-fg hover:brightness-95 border border-transparent",
  // 화면에 놓이는 되돌릴 수 없는 동작 — 칠하지 않는다 (ADR-0164). 칠한 `danger`는 확인 창 안에만.
  "danger-quiet":
    "bg-bg-surface text-status-failed-fg border border-border-default shadow-sm hover:bg-status-failed-bg",
};

const HEIGHT: Record<ButtonSize, string> = {
  sm: "var(--size-control-sm)",
  md: "var(--size-control-md)",
  lg: "var(--size-control-lg)",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 꺼진 이유 (U3). 화면에도 적되, 마우스·보조기기에도 알린다. */
  disabledReason?: string;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  disabledReason,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const off = disabled ?? false;
  return (
    <button
      type="button"
      disabled={off}
      title={off ? disabledReason : undefined}
      aria-disabled={off || undefined}
      style={{ height: HEIGHT[size], borderRadius: "var(--radius-md)" }}
      className={cn(
        "inline-flex items-center justify-center gap-2 px-4 text-body font-medium whitespace-nowrap",
        "transition-[color,background-color,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
