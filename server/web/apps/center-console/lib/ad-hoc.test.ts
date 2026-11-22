import { describe, expect, it } from "vitest";

import { adHocMode, aiProblems, readAi, summarizeAi, switchMode, writeAi } from "./ad-hoc";

describe("Ad Hoc 고르는 방식 (C14 B18 — 식 또는 AI 하나)", () => {
  it("본문에서 방식을 읽는다", () => {
    expect(adHocMode({})).toBe("");
    expect(adHocMode({ activate: "모자란서류" })).toBe("activate");
    expect(adHocMode({ ai: { goal: "고른다" } })).toBe("ai");
  });

  it("방식을 바꾸면 다른 쪽을 빼고 모으는 칸은 남긴다", () => {
    const body = { activate: "모자란서류", result: "받은서류", collect_into: "받은서류목록" };
    expect(switchMode(body, "ai")).toEqual({ ai: { goal: "" }, result: "받은서류", collect_into: "받은서류목록" });
    expect(switchMode({ ai: { goal: "x" } }, "activate")).toEqual({ activate: "" });
    expect(switchMode(body, "activate")).toBe(body);
    // 둘 다 적힌 것(B18 오류)은 AI로 고르면 하나가 된다.
    expect(switchMode({ activate: "a", ai: { goal: "x" } }, "ai")).toEqual({ ai: { goal: "x" } });
  });
});

describe("Ad Hoc AI 설정", () => {
  const ai = {
    goal: "모자란 서류를\n받는다",
    inputs: { 요청사유: "string" },
    results: { 판정: "bool" },
    replay: "full",
    limits: { max_steps: 5 },
    forbidden_actions: ["삭제"],
    extra: 1,
  };

  it("읽고 그대로 다시 쓴다 — 모르는 칸도 든다", () => {
    const form = readAi(ai);
    expect(form?.maxSteps).toBe("5");
    expect(form?.forbidden).toBe("삭제");
    expect(writeAi(form!)).toEqual(ai);
  });

  it("빈 칸은 적지 않고 목표만 남긴다", () => {
    const form = readAi(undefined)!;
    expect(writeAi(form)).toEqual({ goal: "" });
    expect(writeAi({ ...form, maxSteps: "abc" })).toEqual({ goal: "" });
  });

  it("읽지 못하는 모양이면 null", () => {
    expect(readAi("글")).toBeNull();
    expect(readAi({ goal: 3 })).toBeNull();
    expect(readAi({ goal: "x", forbidden_actions: "삭제" })).toBeNull();
  });

  it("말할 것 — 빈 목표·수 아닌 차례·모르는 타입", () => {
    const form = readAi({ goal: "", inputs: { 값: "text" } })!;
    const found = aiProblems({ ...form, maxSteps: "x" });
    expect(found.goal).toBeTruthy();
    expect(found.maxSteps).toBeTruthy();
    expect(found.inputs).toContain("값");
    expect(found.results).toBeUndefined();
  });

  it("패널 요약은 목표 첫 줄과 셈 한 줄", () => {
    expect(summarizeAi(ai)).toEqual({ goal: "모자란 서류를", facts: "입력 1 · 결과 1 · 모두 되밟기 · 최대 차례 5" });
    expect(summarizeAi({ goal: "" })?.facts).toBe("입력 0 · 결과 0 · 계획만 되밟기 · 최대 차례 기본");
  });
});
