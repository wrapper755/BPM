import type { Route } from "next";

/**
 * 패키지를 **글과 주소로** 옮기는 일 — 화면을 모르고 `server-only`도 끌지 않는다.
 *
 * 페이지 파일에 두면 **브라우저 쪽 구성요소가 못 쓴다** (`app/packages/page.tsx`는 `lib/center`를
 * 거쳐 `server-only`를 끌고 온다). `lib/summary.ts`를 따로 둔 까닭과 같다.
 */

/** C5 상태 → `status_map`의 「패키지」 표기. 모르는 값은 **그대로 보인다** (원칙 10). */
export const STATUS_LABEL: Record<string, string> = {
  candidate: "후보",
  approved: "승인됨",
  deprecated: "지원 종료",
  revoked: "철회",
};

/**
 * 패키지 상세 주소 — **BPM 프로세스는 CON-02 「프로세스 상세」**(`/processes/…`), 나머지는 CON-06(`/packages/…`).
 * 종류를 모르면 `/packages/…`이고 그 상세가 종류를 읽어 넘긴다.
 *
 * 타입 라우트는 질의·경로가 붙은 주소를 리터럴로 요구한다 — 한 자리에서 만든다.
 */
export function packageHref(row: { id: string; version: string; kind?: string }): Route {
  const area = row.kind === "bpm_process" ? "processes" : "packages";
  return `/${area}/${encodeURIComponent(row.id)}/${encodeURIComponent(row.version)}` as Route;
}

/**
 * 「이름」 거르기 — id·`name`에 든 글자로, 대소문자를 가리지 않는다 (CON-02 `filterGroups`와 같은 규칙).
 * 빈 글자면 다 지난다.
 */
export function nameMatches(row: { id: string; name?: string | null }, q: string | undefined): boolean {
  const text = (q ?? "").trim().toLowerCase();
  return !text || row.id.toLowerCase().includes(text) || (row.name ?? "").toLowerCase().includes(text);
}
