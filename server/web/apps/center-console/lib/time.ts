/**
 * 시각을 사람의 말로 — **한 자리다**.
 *
 * 전에는 CON-03 페이지에 살았다. PC 실행기를 걷으면서(ADR-0144) 그 페이지가 Studio 하나만
 * 그리게 되었으므로 공용 자리로 뺀다 — 여러 화면이 같은 모양으로 시각을 보인다.
 */

/** 오늘이면 시:분, 아니면 월-일 시:분. */
export function time(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  const today = new Date().toDateString() === at.toDateString();
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return today ? clock : `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock}`;
}

/**
 * **연도까지** 적는 시각 — 배포 유효 기간처럼 「언제까지냐」가 요점인 자리에 쓴다.
 * 짧은 `time()`은 `2027-01-01`을 「01-01」로 보여서, 내일인지 내년인지 알 수 없다.
 */
export function fullTime(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
