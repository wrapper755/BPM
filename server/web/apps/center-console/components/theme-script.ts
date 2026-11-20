/**
 * 고른 화면 테마를 **그리기 전에** `<html data-theme>`에 단다 (ADR-0182) — React가 깨어난 뒤에 달면 어두운 테마를
 * 고른 사람에게 흰 화면이 한 번 번쩍인다. 서버 틀(`layout.tsx`)과 단추(`ThemeToggle`)가 같은 열쇠를 쓰므로
 * "use client" 밖에 둔다.
 */
export const THEME_KEY = "bpm-theme";

export type Theme = "system" | "light" | "dark";

export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
