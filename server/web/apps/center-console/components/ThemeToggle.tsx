"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@bpm/ui";
import { BAR_BUTTON } from "./bar-button";
import { THEME_KEY, type Theme } from "./theme-script";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "시스템", light: "밝게", dark: "어둡게" };

function stored(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * CON-00 위 막대 「화면 테마」 — 누를 때마다 시스템 → 밝게 → 어둡게 (ADR-0182). 고른 값은 이 브라우저에만
 * 남는다. `<html data-theme>`을 바꾸면 토큰이 바뀌고 화면 코드는 그대로다. 처음 그리는 값은 `<head>`의
 * 스크립트(`theme-script`)가 이미 달아 두었으니 여기서는 아이콘만 맞춘다.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(stored()), []);

  const choose = (next: Theme) => {
    setTheme(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 창)는 이 탭에서만 바뀐다.
    }
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const title = `화면 테마: ${LABEL[theme]} (누르면 ${LABEL[NEXT[theme]]})`;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => choose(NEXT[theme])}
      title={title}
      aria-label={title}
      className={BAR_BUTTON}
    >
      <Icon size={18} aria-hidden />
    </Button>
  );
}
