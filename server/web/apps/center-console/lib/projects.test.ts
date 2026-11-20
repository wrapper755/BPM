import { describe, expect, it } from "vitest";
import { filterProcesses } from "./projects";

const ROWS = [
  { id: "company1.sc01", name: "장면 1 손익 점검" },
  { id: "company1.s2.sc01", name: "S2 SC01 납기 위험 조기 감지" },
];

describe("프로세스 거르기 (CON-20c)", () => {
  it("비우면 다 남긴다", () => {
    expect(filterProcesses(ROWS, "  ")).toHaveLength(2);
  });
  it("이름으로도 id로도 걸린다", () => {
    expect(filterProcesses(ROWS, "납기").map((one) => one.id)).toEqual(["company1.s2.sc01"]);
    expect(filterProcesses(ROWS, "S2.SC").map((one) => one.id)).toEqual(["company1.s2.sc01"]);
  });
});
