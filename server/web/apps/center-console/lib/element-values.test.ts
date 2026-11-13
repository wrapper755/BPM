import { describe, expect, it } from "vitest";
import type { ElementField, EventInfo } from "@bpm/bpmn-canvas";

import {
  eventFields,
  eventPatch,
  fromInput,
  parseBody,
  strayKeys,
  toInput,
  withField,
  writeBody,
} from "./element-values";

const field = (kind: ElementField["kind"], name = "x"): ElementField => ({ name, kind, required: false });

describe("본문 읽고 쓰기", () => {
  it("깨진 글은 빈 본문으로 본다 — 반쯤 그린 그림도 열려야 한다", () => {
    expect(parseBody("{잘못")).toEqual({});
    expect(parseBody("")).toEqual({});
    expect(parseBody("[1,2]")).toEqual({});
    expect(parseBody('{"goal":"읽기"}')).toEqual({ goal: "읽기" });
  });

  it("쓸 때는 사람이 읽게 들여 쓴다", () => {
    expect(writeBody({ goal: "읽기" })).toBe('{\n  "goal": "읽기"\n}');
  });
});

describe("칸 하나", () => {
  it("목록은 줄로 펼치고 줄로 거둔다", () => {
    expect(toInput(field("list-text"), ["a", "b"])).toBe("a\nb");
    expect(fromInput(field("list-text"), "a\n b \n")).toEqual(["a", "b"]);
  });

  it("표는 `이름=값` 줄이다", () => {
    expect(toInput(field("map-text"), { 금액: "$총액" })).toBe("금액=$총액");
    expect(fromInput(field("map-text"), "금액=$총액\n수량 = 3")).toEqual({ 금액: "$총액", 수량: "3" });
  });

  it("숫자가 아닌 글은 칸을 빼 버린다 — 0으로 읽히지 않게", () => {
    expect(fromInput(field("number"), "3")).toBe(3);
    expect(fromInput(field("number"), "")).toBeNull();
    expect(fromInput(field("number"), "셋")).toBeNull();
  });

  it("고치는 중인 JSON은 글 그대로 들고 있는다 — 버리지 않는다", () => {
    expect(fromInput(field("json"), '{"a":1}')).toEqual({ a: 1 });
    expect(fromInput(field("json"), '{"a":')).toBe('{"a":');
    expect(fromInput(field("json"), "  ")).toBeNull();
  });

  it("빈 글은 그 칸을 뺀다", () => {
    expect(withField({ goal: "읽기" }, field("text", "goal"), "")).toEqual({});
    expect(withField({}, field("text", "goal"), "쓰기")).toEqual({ goal: "쓰기" });
  });

  it("다른 칸은 건드리지 않는다 (C14 — 모르는 칸을 버리지 않는다)", () => {
    const made = withField({ goal: "읽기", 미래칸: 1 }, field("text", "goal"), "쓰기");
    expect(made).toEqual({ goal: "쓰기", 미래칸: 1 });
  });
});

describe("폼이 모르는 칸", () => {
  it("있다는 것을 숨기지 않는다", () => {
    expect(strayKeys({ goal: "읽기", 미래칸: 1, schema: 1 }, [field("text", "goal")])).toEqual(["미래칸"]);
  });
});

describe("이벤트 칸", () => {
  const event = (over: Partial<EventInfo> = {}): EventInfo => ({
    definition: "bpmn:TimerEventDefinition",
    attachedTo: "",
    cancelActivity: true,
    timer: { kind: "timeDuration", value: "PT30M" },
    message: "",
    signal: "",
    error: "",
    ...over,
  });

  it("타이머가 없으면 기본은 「그만큼 뒤에」다 — 가장 흔하다", () => {
    expect(eventFields(event({ timer: null })).timerKind).toBe("timeDuration");
    expect(eventFields(null).timerValue).toBe("");
  });

  it("건드리지 않으면 아무 칸도 보내지 않는다 — 멀쩡한 정의 요소를 다시 쓰지 않게", () => {
    const one = event();
    expect(eventPatch(one, eventFields(one))).toEqual({});
  });

  it("타이머는 갈래·값 중 하나만 바뀌어도 함께 간다 (둘이 한 요소다)", () => {
    const one = event();
    expect(eventPatch(one, { ...eventFields(one), timerValue: "PT1H" })).toEqual({
      timer: { kind: "timeDuration", value: "PT1H" },
    });
    expect(eventPatch(one, { ...eventFields(one), timerKind: "timeCycle" })).toEqual({
      timer: { kind: "timeCycle", value: "PT30M" },
    });
  });

  it("빈 글은 **지우라는 뜻**이다 — 「건드리지 않았다」와 다르다", () => {
    const one = event({ definition: "bpmn:ErrorEventDefinition", timer: null, error: "E_PAY" });
    expect(eventPatch(one, { ...eventFields(one), error: "" })).toEqual({ error: "" });
  });

  it("경계의 「걷는다」도 바뀔 때만 간다", () => {
    const one = event({ attachedTo: "Task_1" });
    expect(eventPatch(one, { ...eventFields(one), cancelActivity: false })).toEqual({
      cancelActivity: false,
    });
  });
});
