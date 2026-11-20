import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageHref, pageWindow, readPaging } from "./paging";

describe("readPaging", () => {
  it("주소의 쪽은 1부터, 안은 0부터다", () => {
    expect(readPaging({ page: "3", size: "50" })).toEqual({ page: 2, size: 50 });
  });
  it("모르는 줄 수·잘못된 쪽은 기본으로", () => {
    expect(readPaging({ page: "0", size: "37" })).toEqual({ page: 0, size: PAGE_SIZE });
    expect(readPaging({ page: "abc" })).toEqual({ page: 0, size: PAGE_SIZE });
    expect(readPaging({})).toEqual({ page: 0, size: PAGE_SIZE });
  });
});

describe("pageHref", () => {
  it("조건을 남기고 빈 조건·옛 쪽은 버린다", () => {
    expect(pageHref({ state: "open", host: "", page: "9", size: "10" }, 1, 20)).toBe("?state=open&page=2&size=20");
  });
  it("한글 조건은 퍼센트로 싣는다", () => {
    expect(pageHref({ assignee: "회계팀장" }, 0, 10)).toBe(`?assignee=${encodeURIComponent("회계팀장")}&page=1&size=10`);
  });
});

describe("pageWindow", () => {
  it("지금 쪽이 든 열 개 묶음", () => {
    expect(pageWindow(0, 104)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pageWindow(13, 104)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });
  it("마지막 묶음은 남은 만큼", () => {
    expect(pageWindow(103, 104)).toEqual([100, 101, 102, 103]);
    expect(pageWindow(0, 1)).toEqual([0]);
  });
});
