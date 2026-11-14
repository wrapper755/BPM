import { describe, expect, it } from "vitest";
import type { Case } from "@bpm/api-types/c14-case-file";

import {
  definitionPath,
  duplicateNames,
  freshName,
  fromText,
  kindOf,
  kindOfField,
  parseCases,
  strayApprovals,
  toText,
  withEntry,
  writeCases,
} from "./cases";

describe("케이스 파일", () => {
  it("깨진 글은 빈 파일로 보지 않고 그렇게 말한다", () => {
    expect(parseCases("{잘못").error).toContain("읽지 못했습니다");
    expect(parseCases("[]").error).toContain("객체여야");
  });

  it("빠진 칸은 채워 준다 — 손으로 만든 파일도 열려야 한다", () => {
    expect(parseCases("{}").file).toEqual({ schema: 1, cases: [] });
  });

  it("쓸 때는 사람이 읽게 들여 쓰고 줄을 맺는다", () => {
    expect(writeCases({ schema: 1, cases: [] })).toBe('{\n  "schema": 1,\n  "cases": []\n}\n');
  });
});

describe("값 하나", () => {
  it("갈래는 값이 정한다", () => {
    expect(kindOf("글")).toBe("글");
    expect(kindOf(3)).toBe("수");
    expect(kindOf(true)).toBe("참거짓");
    expect(kindOf([1, 2])).toBe("JSON");
  });

  it("글은 따옴표 없이 보인다 — 사람이 적는 것은 값이지 JSON이 아니다", () => {
    expect(toText("서울")).toBe("서울");
    expect(toText(3)).toBe("3");
    expect(toText({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("수가 아닌 글은 받지 않고 그렇게 말한다", () => {
    expect(fromText("수", "3.5")).toEqual({ value: 3.5 });
    expect(fromText("수", "셋").error).toBe("수가 아닙니다.");
    expect(fromText("수", "").error).toBe("수가 아닙니다.");
  });

  it("JSON이 아닌 글도 그렇게 말한다", () => {
    expect(fromText("JSON", '{"a":1}')).toEqual({ value: { a: 1 } });
    expect(fromText("JSON", "{a").error).toBe("JSON이 아닙니다.");
  });
});

describe("사전 한 줄", () => {
  it("이름을 바꿔도 차례가 그대로다", () => {
    const made = withEntry({ 금액: 1, 지역: "서울" }, "금액", "총액", 2);
    expect(Object.keys(made)).toEqual(["총액", "지역"]);
    expect(made.총액).toBe(2);
  });

  it("이름을 비우면 그 줄을 뺀다", () => {
    expect(withEntry({ 금액: 1, 지역: "서울" }, "금액", "", 1)).toEqual({ 지역: "서울" });
  });

  it("새 줄은 뒤에 붙는다", () => {
    expect(withEntry({ 금액: 1 }, "", "지역", "서울")).toEqual({ 금액: 1, 지역: "서울" });
  });
});

describe("케이스 이름", () => {
  const cases = [{ name: "케이스 1" }, { name: "케이스 2" }] as Case[];

  it("겹치지 않는 이름을 짓는다", () => {
    expect(freshName(cases)).toBe("케이스 3");
  });

  it("겹친 이름을 찾아낸다 — 엔진은 이름으로 케이스를 고른다", () => {
    expect(duplicateNames(cases)).toEqual([]);
    expect(duplicateNames([...cases, { name: "케이스 1" } as Case])).toEqual(["케이스 1"]);
  });
});

describe("결재 답 폼", () => {
  it("케이스 파일의 짝은 같은 이름의 정의다 — 엔진이 그 짝만 본다", () => {
    expect(definitionPath("cases/main.cases.json")).toBe("process/main.bpmn");
    expect(definitionPath("cases/order.cases.json")).toBe("process/order.bpmn");
  });

  it("케이스 파일이 아니면 짝도 없다", () => {
    expect(definitionPath("process/main.bpmn")).toBeNull();
    expect(definitionPath("cases/main.json")).toBeNull();
  });

  it("폼 칸의 갈래를 값 칸으로 옮긴다 (모르는 갈래는 글)", () => {
    expect(kindOfField("bool")).toBe("참거짓");
    expect(kindOfField("number")).toBe("수");
    expect(kindOfField("choice")).toBe("글");
    expect(kindOfField("signature")).toBe("글");
  });

  it("그림에 없는 결재도 지우지 않고 보인다 — 적어 둔 답이 조용히 사라지면 안 된다", () => {
    expect(strayApprovals({ Approve_Hold: {}, Gone: {} }, ["Approve_Hold"])).toEqual(["Gone"]);
    expect(strayApprovals(undefined, ["Approve_Hold"])).toEqual([]);
  });
});
