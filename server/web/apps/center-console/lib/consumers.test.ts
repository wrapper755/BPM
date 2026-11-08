/** CON-17 일꾼 (`lib/consumers.ts`) — 토픽 칸 읽기·「들어온 길」·「종류」. */
import { describe, expect, it } from "vitest";
import { cameFrom, kindMismatches, kindsLabel, parseKinds, parseTopics } from "./consumers";

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

describe("parseKinds", () => {
  it("체크한 것만 정해진 차례로, 모르는 값은 버린다", () => {
    expect(parseKinds(["rpa", "ai", "zzz", "ai"])).toEqual(["ai", "rpa"]);
    expect(parseKinds([])).toEqual([]);
  });
});

describe("kindsLabel", () => {
  it("AI·API·RPA 순으로, 모르는 값은 뒤에 그대로", () => {
    expect(kindsLabel(["rpa", "zzz", "ai"])).toBe("AI·RPA·zzz");
  });
  it("정하지 않았으면 「정하지 않음」", () => {
    expect(kindsLabel(null)).toBe("정하지 않음");
    expect(kindsLabel([])).toBe("정하지 않음");
  });
});

describe("kindMismatches", () => {
  it("맡지 않는 종류의 작업이 있는 토픽만, 토픽 이름 순으로", () => {
    expect(kindMismatches(["ai"], { external: ["api"], summarize: ["ai"], crm: ["ai", "api", "rpa"] })).toEqual([
      "crm은 API·RPA 작업이 있는데 이 일꾼은 API·RPA를 맡지 않습니다 — 그 일감을 가져가지 않습니다.",
      "external은 API 작업이 있는데 이 일꾼은 API를 맡지 않습니다 — 그 일감을 가져가지 않습니다.",
    ]);
  });
  it("정하지 않은 일꾼·맞는 일꾼은 어긋남이 없다", () => {
    expect(kindMismatches(null, { external: ["api"] })).toEqual([]);
    expect(kindMismatches(["api"], { external: ["api"] })).toEqual([]);
  });
});
