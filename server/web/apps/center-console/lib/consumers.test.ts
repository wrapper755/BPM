/** CON-17 일꾼 (`lib/consumers.ts`) — 토픽 칸 읽기와 「들어온 길」. */
import { describe, expect, it } from "vitest";
import { cameFrom, parseTopics } from "./consumers";

describe("parseTopics", () => {
  it("한 줄에 하나, 쉼표도 받고 빈 줄·겹친 것은 버린다", () => {
    expect(parseTopics("ext-ocr\n\n  mail , ext-ocr\r\n")).toEqual(["ext-ocr", "mail"]);
    expect(parseTopics("  \n")).toEqual([]);
  });
});

describe("cameFrom", () => {
  it("폴더면 「일꾼 폴더」, 콘솔이면 만든 계정을 붙인다", () => {
    expect(cameFrom("folder", "일꾼 폴더")).toBe("일꾼 폴더");
    expect(cameFrom("console", "admin")).toBe("콘솔 · admin");
    expect(cameFrom(undefined, null)).toBe("콘솔");
  });
});
