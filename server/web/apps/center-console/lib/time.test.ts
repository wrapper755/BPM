/** 시각·기간 표기 (`lib/time.ts`) — 스타일 가이드 §5의 규칙을 숫자로 본다. */
import { describe, expect, it } from "vitest";
import { between, fullTime, time, took } from "./time";

const now = new Date(2026, 10, 21, 15, 0);
const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();

describe("time", () => {
  it("오늘은 시:분, 올해는 월-일, 다른 해는 연도까지", () => {
    expect(time(local(2026, 11, 21, 9, 5), now)).toBe("09:05");
    expect(time(local(2026, 11, 10, 22, 16), now)).toBe("11-10 22:16");
    expect(time(local(2025, 12, 31, 23, 59), now)).toBe("2025-12-31 23:59");
  });

  it("없으면 「—」, 못 읽으면 그대로", () => {
    expect(time(null, now)).toBe("—");
    expect(time("어제", now)).toBe("어제");
  });
});

describe("fullTime", () => {
  it("늘 연도까지", () => {
    expect(fullTime(local(2026, 11, 21, 9, 5))).toBe("2026-11-21 09:05");
  });
});

describe("took", () => {
  it("1분 아래는 소수 한 자리, 그 위는 큰 단위로 접는다", () => {
    expect(took(0.43)).toBe("0.4초");
    expect(took(41.8)).toBe("41.8초");
    expect(took(59.96)).toBe("1분");
    expect(took(1298.3)).toBe("21분 38초");
    expect(took(3600 * 2 + 300)).toBe("2시간 5분");
    expect(took(86400 + 3 * 3600)).toBe("1일 3시간");
  });

  it("모르면 「—」 — 0과 다르다", () => {
    expect(took(null)).toBe("—");
    expect(took(0)).toBe("0초");
  });
});

describe("between", () => {
  it("끝이 없으면 지금까지, 있으면 그때까지", () => {
    expect(between(local(2026, 11, 21, 14, 0), null, now)).toBe(3600);
    expect(between(local(2026, 11, 21, 9, 0), local(2026, 11, 21, 9, 1), now)).toBe(60);
  });

  it("시작을 모르면 null", () => {
    expect(between(null, null, now)).toBeNull();
    expect(between("어제", null, now)).toBeNull();
  });
});
