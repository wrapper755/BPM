/** CON-04 결재 설명 (`lib/markdown.ts`) — C14 「결재 설명」이 적은 목록만 읽는다 (ADR-0134). */
import { describe, expect, it } from "vitest";
import { isWebLink, parseBlocks, parseInline } from "./markdown";

describe("parseBlocks", () => {
  it("제목·문단·목록·코드 블록을 가른다", () => {
    const blocks = parseBlocks("## 보완 요청\n\n첫 줄\n둘째 줄\n\n- 하나\n- 둘\n\n1. 첫째\n2) 둘째\n\n```\nx = 1\n```");
    expect(blocks.map((one) => one.kind)).toEqual(["heading", "paragraph", "list", "list", "code"]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", lines: [[{ kind: "text", text: "첫 줄" }], [{ kind: "text", text: "둘째 줄" }]] });
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: false });
    expect(blocks[3]).toMatchObject({ kind: "list", ordered: true });
    expect(blocks[4]).toEqual({ kind: "code", text: "x = 1" });
  });

  it("빈 글은 아무것도 없다", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("\n  \n")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("굵게·기울임·코드를 읽는다", () => {
    expect(parseInline("**수치** 와 *문안* 과 `ID`")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "수치" }] },
      { kind: "text", text: " 와 " },
      { kind: "em", children: [{ kind: "text", text: "문안" }] },
      { kind: "text", text: " 과 " },
      { kind: "code", text: "ID" },
    ]);
  });

  it("웹 주소만 링크가 되고 나머지는 글로 남는다", () => {
    expect(parseInline("[보고](https://x.test/a)")).toEqual([
      { kind: "link", href: "https://x.test/a", children: [{ kind: "text", text: "보고" }] },
    ]);
    expect(parseInline("[누르기](javascript:alert(1))")[0]).toEqual({ kind: "text", text: "누르기" });
  });

  it("HTML은 읽지 않고 글자로 둔다", () => {
    expect(parseInline("<b>태그</b>")).toEqual([{ kind: "text", text: "<b>태그</b>" }]);
  });

  it("짝이 없는 기호는 글자다", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
  });
});

describe("isWebLink", () => {
  it("http·https만", () => {
    expect(isWebLink("http://a")).toBe(true);
    expect(isWebLink("HTTPS://a")).toBe(true);
    expect(isWebLink("file:///etc")).toBe(false);
    expect(isWebLink("javascript:x")).toBe(false);
  });
});
