import { describe, expect, it } from "vitest";

import {
  answerProblems,
  answerSummary,
  choicesFromText,
  conditionSources,
  moveField,
  newAnswerField,
  readAnswerFields,
  readAssignees,
  renameKey,
  withType,
  writeAssignees,
  type AnswerField,
} from "./answer-fields";

const decision: AnswerField = { key: "decision", label: "결정", type: "choice", required: true, choices: ["승인", "보완요청"] };
const docs: AnswerField = { key: "docs", label: "보완할 서류", type: "text", when: { field: "decision", in: ["보완요청"] } };

describe("답 칸 읽기", () => {
  it("없으면 빈 목록, 배열이 아니면 읽지 않는다", () => {
    expect(readAnswerFields(undefined)).toEqual([]);
    expect(readAnswerFields("x")).toBeNull();
    expect(readAnswerFields([1])).toBeNull();
  });

  it("모르는 속성을 들고 간다", () => {
    expect(readAnswerFields([{ key: "a", label: "A", type: "text", extra: 1 }])?.[0]?.extra).toBe(1);
  });
});

describe("고치기", () => {
  it("새 칸의 키는 겹치지 않는다", () => {
    expect(newAnswerField([{ key: "field2", label: "", type: "text" }]).key).toBe("field3");
  });

  it("고르기가 아니게 바꾸면 고를 거리와 맞지 않는 기본값을 걷는다", () => {
    const made = withType({ ...decision, default: "승인" }, "bool");
    expect(made.choices).toBeUndefined();
    expect(made.default).toBeUndefined();
  });

  it("고를 거리의 수는 수로 남는다", () => {
    expect(choicesFromText("3\n새것\n\n", [3])).toEqual([3, "새것"]);
  });

  it("차례를 옮기고 끝은 넘지 않는다", () => {
    expect(moveField([decision, docs], 1, -1).map((one) => one.key)).toEqual(["docs", "decision"]);
    expect(moveField([decision, docs], 0, -1)).toEqual([decision, docs]);
  });

  it("조건은 앞의 고르기·참거짓 칸만 본다", () => {
    expect(conditionSources([decision, docs], 1).map((one) => one.key)).toEqual(["decision"]);
    expect(conditionSources([decision, docs], 0)).toEqual([]);
  });

  it("키를 바꾸면 그 칸을 보던 조건이 따라간다", () => {
    expect(renameKey([decision, docs], 0, "result")[1]?.when?.field).toBe("result");
  });

  it("요약", () => {
    expect(answerSummary(docs)).toBe("글 · 조건 decision");
  });
});

describe("말할 것 (막지 않는다)", () => {
  it("맞는 폼은 조용하다", () => {
    expect(answerProblems([decision, docs])).toEqual([[], []]);
  });

  it("키가 겹치거나 비면 말한다", () => {
    const found = answerProblems([decision, { ...docs, key: "decision", when: null }, { key: "", label: "", type: "text" }]);
    expect(found[1]).toContain("키가 다른 칸과 겹칩니다.");
    expect(found[2]).toContain("키가 비어 있습니다.");
  });

  it("조건이 뒤의 칸을 보거나 값이 고를 거리에 없으면 말한다", () => {
    expect(answerProblems([docs, decision])[0]).toContain("조건은 앞에 오는 고르기·참거짓 칸만 볼 수 있습니다.");
    expect(answerProblems([decision, { ...docs, when: { field: "decision", in: ["반려"] } }])[1]).toContain(
      "조건 값이 그 칸의 고를 거리에 없습니다.",
    );
  });

  it("고르기에 고를 거리가 없으면 말한다", () => {
    expect(answerProblems([{ ...decision, choices: [] }])[0]).toContain("고를 거리가 없습니다.");
  });
});

describe("담당자", () => {
  it("글 하나는 변수, 배열은 이름 목록", () => {
    expect(readAssignees("approver")).toEqual({ mode: "variable", name: "approver" });
    expect(readAssignees(["김", "이"])).toEqual({ mode: "names", names: ["김", "이"] });
    expect(readAssignees([1])).toBeNull();
  });

  it("비면 칸을 뺀다", () => {
    expect(writeAssignees({ mode: "names", names: [" ", ""] })).toBeUndefined();
    expect(writeAssignees({ mode: "variable", name: "" })).toBeUndefined();
    expect(writeAssignees({ mode: "names", names: [" 김 "] })).toEqual(["김"]);
  });
});
