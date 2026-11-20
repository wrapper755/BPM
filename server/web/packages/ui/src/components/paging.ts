/**
 * 쪽 나누기의 셈 (ADR-0165·0167) — 화면을 모른다. 서버의 `DataTable`과 브라우저의 `Paged`가 함께 쓰므로
 * "use client" 밖에 둔다(브라우저 파일의 값은 서버에서 참조로만 보인다).
 */

/** 고를 수 있는 한 쪽의 줄 수. */
export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** 기본 줄 수 (ADR-0167 — ADR-0166의 10을 되돌렸다). */
export const PAGE_SIZE = 20;

/** 쪽 번호를 몇 개씩 묶어 보이나 (ADR-0167). */
const WINDOW = 10;

/** 주소로 쪽을 넘기는 목록이 `DataTable`에 넘기는 것 — `query`는 쪽 말고 지금 주소에 있는 조건이다. */
export type Paging = {
  page: number;
  size: number;
  query: Record<string, string | undefined>;
};

/** 주소의 `page`(1부터)·`size` → 쪽(0부터)·줄 수. 모르는 줄 수는 기본, 잘못된 쪽은 첫 쪽이다. */
export function readPaging(asked: { page?: string; size?: string }): { page: number; size: number } {
  const size = Number(asked.size);
  const page = Math.floor(Number(asked.page));
  return {
    page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZE,
  };
}

/** 조건을 남기고 쪽만 바꾼 주소(`?…`). 빈 조건은 싣지 않는다. 쪽은 1부터 적는다. */
export function pageHref(query: Record<string, string | undefined>, page: number, size: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key !== "page" && key !== "size" && value) params.set(key, value);
  }
  params.set("page", String(page + 1));
  params.set("size", String(size));
  return `?${params.toString()}`;
}

/** 보일 쪽 번호 — 지금 쪽이 든 묶음(0–9, 10–19 …)이다. */
export function pageWindow(page: number, pages: number): number[] {
  const start = Math.floor(page / WINDOW) * WINDOW;
  const end = Math.min(start + WINDOW, pages);
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
}
