"use client";

import { useRef, useTransition, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@bpm/ui";

/**
 * 목록의 거르기 칸 (CON-00 [F], [ADR-0165](../../../../../docs/decisions/0165-lists-filter-as-you-go-and-page.md)) —
 * **고르는 대로 든다**. 고르는 칸(선택·체크)은 바뀌는 즉시, 글자 칸은 멈춘 뒤 0.4초에 **주소를 바꿔 서버에 다시
 * 묻는다** — 「좁히기」 단추를 누르는 한 번이 없다. Enter도 든다.
 *
 * 속은 그대로 **GET 폼**이라 JS가 없어도 Enter로 돈다. 빈 칸은 주소에 싣지 않는다. 쪽(`page`)은 싣지 않아
 * 조건이 바뀌면 첫 쪽이다. 「조건 지우기」는 **조건이 있을 때만** 보인다.
 */
const WAIT_MS = 400;

export function AutoFilter({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, start] = useTransition();

  const go = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!form.current) return;
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      if (typeof value === "string" && value.trim() !== "") query.append(key, value.trim());
    }
    const next = query.size > 0 ? `${pathname}?${query}` : pathname;
    start(() => router.replace(next as Route, { scroll: false }));
  };

  const active = [...params.keys()].some((key) => key !== "page");

  return (
    <form
      ref={form}
      method="get"
      aria-busy={pending || undefined}
      className={cn("filter-card flex flex-wrap items-end gap-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
      onChange={(event) => {
        // 바뀐 것은 폼 안의 칸이다 — React는 폼의 `target`을 폼으로 적어 두므로 원래 사건에서 읽는다.
        const target = event.nativeEvent.target as HTMLInputElement;
        // 글자를 치는 칸은 멈출 때까지 기다린다 — 한 글자마다 서버에 묻지 않는다.
        const typing = target.tagName === "INPUT" && !["checkbox", "radio"].includes(target.type);
        if (!typing) return go();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(go, WAIT_MS);
      }}
    >
      {children}
      <span className="ml-auto flex items-center gap-3 self-center">
        {pending ? (
          <span role="status" className="text-caption text-text-muted">
            읽는 중...
          </span>
        ) : null}
        {active ? (
          <Link href={pathname as Route} scroll={false} className="text-body-sm text-text-secondary hover:text-primary">
            조건 지우기
          </Link>
        ) : null}
      </span>
    </form>
  );
}
