/** 결재 폼의 조건부 칸 (`lib/form-conditions.ts`, C6 `when`, ADR-0188) — 보일 칸만 고른다. */
import { describe, expect, it } from "vitest";
import type { FormField } from "@bpm/api-types/c6-approval-info";
import { formValue, hasConditions, shownFields } from "./form-conditions";

const decision: FormField = { key: "결정", label: "결정", type: "choice", required: true, choices: ["승인", "보완요청"] };
const what: FormField = {
  key: "보완서류",
  label: "보완할 서류",
  type: "text",
  required: true,
  when: { field: "결정", in: ["보완요청"] },
};
const why: FormField = { key: "사유", label: "사유", type: "text", when: { field: "보완서류", in: ["통장"] } };

describe("shownFields", () => {
  it("조건이 맞을 때만 보인다", () => {
    expect([...shownFields([decision, what], { 결정: "승인" })]).toEqual(["결정"]);
    expect([...shownFields([decision, what], { 결정: "보완요청" })]).toEqual(["결정", "보완서류"]);
  });

  it("아무것도 고르지 않으면 조건부 칸은 숨는다", () => {
    expect(shownFields([decision, what], {}).has("보완서류")).toBe(false);
  });

  it("조건은 이어진다 — 가리키는 칸이 숨으면 이 칸도 숨는다", () => {
    expect(shownFields([decision, what, why], { 결정: "승인", 보완서류: "통장" }).has("사유")).toBe(false);
    expect(shownFields([decision, what, why], { 결정: "보완요청", 보완서류: "통장" }).has("사유")).toBe(true);
  });

  it("true는 1이 아니다", () => {
    const flag: FormField = { key: "ok", label: "확인", type: "bool" };
    const note: FormField = { key: "메모", label: "메모", type: "text", when: { field: "ok", in: [1] } };
    expect(shownFields([flag, note], { ok: true }).has("메모")).toBe(false);
  });
});

describe("formValue", () => {
  it("선택지는 원래 값으로, 참거짓은 체크로 읽는다", () => {
    const data = new FormData();
    data.set("수", "2");
    data.set("ok", "on");
    expect(formValue({ key: "수", label: "수", type: "choice", choices: [1, 2] }, data)).toBe(2);
    expect(formValue({ key: "ok", label: "ok", type: "bool" }, data)).toBe(true);
    expect(formValue({ key: "없음", label: "없음", type: "bool" }, data)).toBe(false);
    expect(formValue({ key: "글", label: "글", type: "text" }, data)).toBeUndefined();
  });
});

it("hasConditions", () => {
  expect(hasConditions([decision])).toBe(false);
  expect(hasConditions([decision, what])).toBe(true);
});
