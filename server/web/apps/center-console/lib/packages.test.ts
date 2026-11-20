/** 패키지 글·거르기 (`lib/packages.ts`). */
import { describe, expect, it } from "vitest";
import { nameMatches } from "./packages";

describe("nameMatches", () => {
  it("id와 name에서 대소문자 없이 찾고, 빈 글자면 다 지난다", () => {
    const row = { id: "company1.lib-common", name: "Common Steps" };
    expect(nameMatches(row, "STEPS")).toBe(true);
    expect(nameMatches(row, "lib-com")).toBe(true);
    expect(nameMatches(row, "  ")).toBe(true);
    expect(nameMatches(row, "invoice")).toBe(false);
    expect(nameMatches({ id: "a", name: null }, "a")).toBe(true);
  });
});
