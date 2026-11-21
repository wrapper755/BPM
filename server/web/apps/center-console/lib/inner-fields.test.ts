import { describe, expect, it } from "vitest";

import {
  numberProblem,
  parseCodes,
  readDelegate,
  readLimits,
  readParams,
  readRetry,
  retryProblems,
  summarizeInputs,
  writeDelegate,
  writeLimits,
  writeRetry,
} from "./inner-fields";

describe("다시 시도", () => {
  it("예제의 모양을 읽고 그대로 돌려 쓴다", () => {
    const form = readRetry({ max: 2, on: [503] });
    expect(form).toEqual({ max: "2", on: "503", rest: {} });
    expect(writeRetry(form!)).toEqual({ max: 2, on: [503] });
  });

  it("코드는 쉼표·빈칸으로 여럿이고 수가 아닌 조각은 넣지 않고 말한다", () => {
    expect(parseCodes("503, 429 abc,")).toEqual({ codes: [503, 429], bad: ["abc"] });
    const form = { max: "1", on: "503, x", rest: {} };
    expect(writeRetry(form)).toEqual({ max: 1, on: [503] });
    expect(retryProblems(form).on).toContain("x");
    expect(retryProblems({ max: "둘", on: "", rest: {} }).max).toBeDefined();
  });

  it("횟수가 비거나 0이고 코드가 없으면 칸을 뺀다", () => {
    expect(writeRetry({ max: "", on: "", rest: {} })).toBeUndefined();
    expect(writeRetry({ max: "0", on: "", rest: {} })).toBeUndefined();
    expect(writeRetry({ max: "0", on: "503", rest: {} })).toEqual({ max: 0, on: [503] });
  });

  it("모르는 속성은 들고 가고, 읽지 못하는 모양은 JSON 칸이다", () => {
    const form = readRetry({ max: 1, backoff: "exp" });
    expect(writeRetry({ ...form!, max: "" })).toEqual({ backoff: "exp" });
    expect(readRetry("max=2")).toBeNull();
    expect(readRetry({ on: ["503"] })).toBeNull();
    expect(readRetry(undefined)).toEqual({ max: "", on: "", rest: {} });
  });
});

describe("한도", () => {
  it("두 칸을 읽고 쓰며 다 비면 칸을 뺀다", () => {
    const form = readLimits({ timeout_s: 180, max_steps: 10 });
    expect(form).toEqual({ timeout_s: "180", max_steps: "10", rest: {} });
    expect(writeLimits({ ...form!, timeout_s: "" })).toEqual({ max_steps: 10 });
    expect(writeLimits({ timeout_s: "", max_steps: "", rest: {} })).toBeUndefined();
  });

  it("수가 아닌 칸은 넣지 않고 말한다", () => {
    expect(writeLimits({ timeout_s: "삼분", max_steps: "6", rest: {} })).toEqual({ max_steps: 6 });
    expect(numberProblem("삼분")).toBeDefined();
    expect(numberProblem("")).toBeUndefined();
    expect(readLimits({ timeout_s: "180" })).toBeNull();
  });
});

describe("매개변수", () => {
  it("값이 모두 글일 때만 표다 — 수가 글이 되면 안 된다", () => {
    expect(readParams({ 첫날안내: "09:30 로비" })).toEqual([["첫날안내", "09:30 로비"]]);
    expect(readParams({})).toEqual([]);
    expect(readParams(undefined)).toEqual([]);
    expect(readParams({ 한도: 3 })).toBeNull();
    expect(readParams(["a"])).toBeNull();
  });
});

describe("맡기기", () => {
  it("칸이 있으면 켜진 것이고, 끄면 칸을 뺀다", () => {
    const form = readDelegate({ bpm_process_id: "fx25-batch-item" });
    expect(form?.on).toBe(true);
    expect(writeDelegate(form!)).toEqual({ bpm_process_id: "fx25-batch-item" });
    expect(writeDelegate({ ...form!, on: false })).toBeUndefined();
    expect(readDelegate(undefined)?.on).toBe(false);
  });

  it("켜고 id가 비어도 칸을 둔다 — 켠 것을 잃지 않게", () => {
    const off = readDelegate(undefined)!;
    expect(writeDelegate({ ...off, on: true })).toEqual({ bpm_process_id: "" });
  });

  it("판은 비우면 넣지 않고, 모르는 속성은 들고 간다", () => {
    expect(writeDelegate({ on: true, bpm_process_id: "a", version: " 1.2.0 ", rest: { note: 1 } })).toEqual({
      note: 1,
      bpm_process_id: "a",
      version: "1.2.0",
    });
    expect(readDelegate("a")).toBeNull();
  });
});

describe("BPM 프로세스 입력 요약", () => {
  it("이름과 「타입 · 필수 · 출처」 한 줄", () => {
    expect(
      summarizeInputs([
        { name: "사번", type: "string", required: true },
        { name: "부서", type: "string", source: "department.name" },
        { name: "건수", type: "int", source: "caller" },
      ]),
    ).toEqual([
      { name: "사번", detail: "글 · 필수" },
      { name: "부서", detail: "글 · 출처 department.name" },
      { name: "건수", detail: "정수" },
    ]);
  });

  it("읽지 못하는 모양은 JSON 칸이다", () => {
    expect(summarizeInputs({ name: "a" })).toBeNull();
    expect(summarizeInputs(["a"])).toBeNull();
    expect(summarizeInputs(undefined)).toEqual([]);
  });
});
