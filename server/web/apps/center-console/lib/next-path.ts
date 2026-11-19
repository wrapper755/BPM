/**
 * 로그인 뒤 돌아갈 곳 (U19, [ADR-0162](../../../../../docs/decisions/0162-usability-heuristics-review.md)).
 *
 * **같은 사이트의 경로만** 받는다 — `/`로 시작하고 `//`·`/\`가 아닌 것(브라우저가 바깥 주소로 읽는다).
 * 로그인 화면 자체와 줄바꿈이 섞인 것도 받지 않는다. 못 받으면 `null` — 부르는 쪽이 대시보드로 보낸다.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\r\n\t]/.test(value)) return null;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) return null;
  return value;
}

/** 로그인 화면으로 보내는 주소 — 돌아갈 곳을 `next`에 싣는다. 첫 화면(`/`)이면 싣지 않는다. */
export function loginUrl(path: string): string {
  const next = safeNext(path);
  return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
