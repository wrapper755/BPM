/** 로그인 뒤 돌아갈 곳 (`lib/next-path.ts`, ADR-0162 U19). */
import { describe, expect, it } from "vitest";
import { loginUrl, safeNext } from "./next-path";

describe("safeNext", () => {
  it("같은 사이트의 경로는 쿼리째 받는다", () => {
    expect(safeNext("/approvals/apr_1")).toBe("/approvals/apr_1");
    expect(safeNext("/runs?status=failed")).toBe("/runs?status=failed");
  });

  it("바깥으로 튀는 주소는 받지 않는다", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", null, 3]) {
      expect(safeNext(bad)).toBeNull();
    }
  });

  it("로그인 화면 자체와 줄바꿈이 섞인 것도 받지 않는다", () => {
    expect(safeNext("/login")).toBeNull();
    expect(safeNext("/login?next=/x")).toBeNull();
    expect(safeNext("/runs\r\nSet-Cookie: x")).toBeNull();
  });
});

describe("loginUrl", () => {
  it("돌아갈 곳을 `next`에 싣고, 첫 화면이면 싣지 않는다", () => {
    expect(loginUrl("/approvals/apr_1?x=1")).toBe("/login?next=%2Fapprovals%2Fapr_1%3Fx%3D1");
    expect(loginUrl("/")).toBe("/login");
  });
});
