import { describe, expect, it } from "vitest";
import type { TrialInfo } from "@bpm/api-types/c17-test-run-info";

// 생성된 표만 읽는다 — `@bpm/ui` 전체를 들이면 React 구성요소까지 따라온다.
import { STATUS_MAP } from "../../../packages/ui/src/status-map";
import { caseFilePath, caseLabel, elapsed, isLive, modeLabel, stateLabel } from "./trials";

const trial = (over: Partial<TrialInfo> = {}): TrialInfo => ({
  run_id: "test_20261113_090000_abc123",
  workspace_id: "finance.invoice",
  state: "done",
  requested_at: "2026-11-13T09:00:00Z",
  updated_at: "2026-11-13T09:00:12Z",
  ...over,
});

describe("상태", () => {
  it("끝나지 않은 것만 되묻는다", () => {
    expect(["queued", "running", "waiting"].every(isLive)).toBe(true);
    expect(["done", "failed", "cancelled"].some(isLive)).toBe(false);
  });

  it("표기는 status_map 「시험 실행」에 있는 것만 쓴다 (스타일 가이드 §2-2)", () => {
    expect(stateLabel("queued")).toBe("대기열");
    for (const state of ["queued", "running", "waiting", "done", "failed", "cancelled"]) {
      expect(Object.keys(STATUS_MAP["시험 실행"])).toContain(stateLabel(state));
    }
  });

  it("모르는 상태는 그대로 보인다 — 계약의 상태는 열린 문자열이다 (원칙 10)", () => {
    expect(stateLabel("paused")).toBe("paused");
  });
});

describe("판정", () => {
  it("다섯 가지가 모두 status_map에 있다 (C17 VERDICT_*)", () => {
    // 판정 글은 **계약이 쥐고 있고**(엔진이 그것을 쓴다) 콘솔은 번역하지 않는다.
    expect(Object.keys(STATUS_MAP["시험 판정"])).toEqual(["통과", "실패", "비교 안 함", "중지", "오류"]);
  });
});

describe("케이스 파일", () => {
  it("진입 정의 옆이다 — 엔진이 그 자리만 본다", () => {
    expect(caseFilePath("process/main.bpmn")).toBe("cases/main.cases.json");
    expect(caseFilePath("process/sub/order.bpmn")).toBe("cases/order.cases.json");
  });

  it("진입 정의가 없거나 그림이 아니면 고를 케이스도 없다", () => {
    expect(caseFilePath(null)).toBeNull();
    expect(caseFilePath("")).toBeNull();
    expect(caseFilePath("process/limit.dmn")).toBeNull();
  });

  it("케이스 없이 돌린 것은 비교하지 않는다", () => {
    expect(caseLabel(trial({ case: "정상" }))).toBe("정상");
    expect(caseLabel(trial())).toBe("비교 안 함");
  });
});

describe("소요", () => {
  it("끝난 실행은 마지막으로 바뀐 때까지다", () => {
    expect(elapsed(trial())).toBe("12초");
    expect(elapsed(trial({ updated_at: "2026-11-13T09:01:20Z" }))).toBe("1분 20초");
    expect(elapsed(trial({ updated_at: "2026-11-13T09:02:00Z" }))).toBe("2분");
    expect(elapsed(trial({ updated_at: "2026-11-13T10:30:00Z" }))).toBe("1시간 30분");
  });

  it("도는 중에는 지금까지다 — 멈춘 숫자를 보이면 멎은 줄로 읽힌다", () => {
    const now = Date.parse("2026-11-13T09:00:05Z");
    expect(elapsed(trial({ state: "running" }), now)).toBe("5초");
  });

  it("시작한 때를 모르면 지어내지 않는다", () => {
    expect(elapsed(trial({ requested_at: null }))).toBe("—");
  });
});

describe("수행 모드", () => {
  it("글자로만 보인다 (06-screens §3)", () => {
    expect(modeLabel("autonomous")).toBe("자율 수행");
    expect(modeLabel("deterministic")).toBe("결정 수행");
  });
});
