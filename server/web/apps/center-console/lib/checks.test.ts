import { describe, expect, it } from "vitest";
import type { CheckResponse, Violation } from "@bpm/api-types/c17-check-response";

// 생성된 표만 읽는다 — `@bpm/ui` 전체를 들이면 React 구성요소까지 따라온다.
import { STATUS_MAP } from "../../../packages/ui/src/status-map";
import { blocks, buildLabel, building, checking, counts, sorted, summary } from "./checks";

const bad = (rule: string, severity?: string): Violation => ({ rule, message: `${rule}이 걸렸다`, severity });

describe("막는 흠", () => {
  it("적지 않으면 막는 쪽이다 (계약 기본값)", () => {
    expect(blocks({ rule: "B1", message: "x" })).toBe(true);
    expect(blocks(bad("B1", "error"))).toBe(true);
    expect(blocks(bad("B11", "warning"))).toBe(false);
  });

  it("막는 것 먼저, 그 안에서는 규칙 이름 순", () => {
    const rows = sorted([bad("B11", "warning"), bad("B7"), bad("B2"), bad("B3", "warning")]);
    expect(rows.map((one) => one.rule)).toEqual(["B2", "B7", "B11", "B3"]);
  });

  it("센다", () => {
    expect(counts([bad("B2"), bad("B11", "warning")])).toEqual({ errors: 1, warnings: 1 });
  });
});

describe("한 줄 요약", () => {
  const done = (violations: Violation[]): CheckResponse => ({ state: "done", violations });

  it("「흠이 없다」와 「아직 검사하지 않았다」는 다른 말이다", () => {
    expect(summary(null)).toBe("아직 검사하지 않았습니다.");
    expect(summary(done([]))).toBe("흠이 없습니다.");
  });

  it("도는 중에는 그렇게 말한다 — 끝난 줄로 읽히지 않게", () => {
    expect(summary({ state: "pending" })).toBe("검사하는 중입니다…");
    expect(checking({ state: "pending" })).toBe(true);
    expect(checking(done([]))).toBe(false);
  });

  it("오류만 돌리기를 막는다고 적는다", () => {
    expect(summary(done([bad("B2"), bad("B11", "warning")]))).toBe(
      "오류 1개 · 경고 1개 — 오류만 돌리기를 막습니다.",
    );
    expect(summary(done([bad("B11", "warning")]))).toBe("경고 1개 — 오류만 돌리기를 막습니다.");
  });
});

describe("짓기", () => {
  it("도는 동안만 되묻는다 (C17 KNOWN_BUILD_STATES)", () => {
    expect(["queued", "building"].every(building)).toBe(true);
    expect(["done", "failed"].some(building)).toBe(false);
  });

  it("표기는 status_map 「배포 후보 짓기」에 있는 것만 쓴다", () => {
    for (const state of ["queued", "building", "done", "failed"]) {
      expect(Object.keys(STATUS_MAP["배포 후보 짓기"])).toContain(buildLabel(state));
    }
  });

  it("모르는 상태는 그대로 보인다 (계약 원칙 10)", () => {
    expect(buildLabel("uploading")).toBe("uploading");
  });
});
