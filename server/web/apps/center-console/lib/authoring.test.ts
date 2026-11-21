import { describe, expect, it } from "vitest";
import type { ProcessStatus } from "@bpm/api-types/c17-process-status";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import { checkText, deployStand, deployText, trialStand } from "./authoring";

function deployment(version: string, signedAt: string, extra: Partial<DeploymentInfo> = {}): DeploymentInfo {
  return {
    bpm_process_id: "order-intake",
    content_hash: "h",
    deployment_id: `dep_${version}`,
    signed_at: signedAt,
    signed_by: "Center",
    target: { type: "server_runner", id: "*" },
    version,
    ...extra,
  };
}

const STATUS: ProcessStatus = {
  workspace_id: "order-intake",
  revision: "now",
  builds: [
    { package_id: "order-intake", version: "1.3.0", revision: "now" },
    { package_id: "order-intake", version: "1.2.0", revision: "before" },
  ],
};

describe("배포 열 (CON-20c, ADR-0185)", () => {
  it("배포가 없으면 「배포 안 됨」", () => {
    expect(deployText(deployStand("order-intake", STATUS, []))).toBe("배포 안 됨");
  });
  it("철회된 배포는 세지 않는다", () => {
    const gone = deployment("1.3.0", "2026-11-21T10:00:00+09:00", { revoked_at: "2026-11-21T11:00:00+09:00" });
    expect(deployStand("order-intake", STATUS, [gone]).kind).toBe("none");
  });
  it("배포된 판을 지은 묶음이 지금 묶음이면 「같음」", () => {
    expect(deployText(deployStand("order-intake", STATUS, [deployment("1.3.0", "2026-11-21T10:00:00+09:00")]))).toBe(
      "v1.3.0 · 같음",
    );
  });
  it("가장 최근에 서명한 배포를 본다 — 옛 묶음이면 「배포 뒤 고침」", () => {
    const rows = [deployment("1.3.0", "2026-11-20T10:00:00+09:00"), deployment("1.2.0", "2026-11-21T10:00:00+09:00")];
    expect(deployText(deployStand("order-intake", STATUS, rows))).toBe("v1.2.0 · 배포 뒤 고침");
  });
  it("지은 기록이 없으면 판만 — 「같음」이라 짐작하지 않는다", () => {
    expect(deployText(deployStand("order-intake", STATUS, [deployment("1.0.0", "2026-11-21T10:00:00+09:00")]))).toBe(
      "v1.0.0",
    );
    expect(deployStand("order-intake", undefined, [deployment("1.3.0", "2026-11-21T10:00:00+09:00")]).kind).toBe(
      "unknown",
    );
  });
  it("작업공간 id와 다른 패키지 id로 지은 것도 찾는다", () => {
    const status = { ...STATUS, builds: [{ package_id: "company1.order", version: "0.1.0", revision: "now" }] };
    const row = deployment("0.1.0", "2026-11-21T10:00:00+09:00", { bpm_process_id: "company1.order" });
    expect(deployStand("order-intake", status, [row]).kind).toBe("same");
  });
});

describe("마지막 시험 열", () => {
  it("없으면 null", () => {
    expect(trialStand(STATUS)).toBeNull();
  });
  it("끝났으면 판정, 지금 묶음이 아니면 고치기 전", () => {
    const status = {
      ...STATUS,
      last_trial: { run_id: "test_1", state: "done", verdict: "통과", revision: "before", requested_at: "2026-11-21T10:00:00+09:00" },
    };
    expect(trialStand(status)).toEqual({ group: "시험 판정", label: "통과", at: "2026-11-21T10:00:00+09:00", stale: true });
  });
  it("도는 중이면 상태", () => {
    const status = { ...STATUS, last_trial: { run_id: "test_1", state: "running", revision: "now" } };
    expect(trialStand(status)).toMatchObject({ group: "시험 실행", label: "실행 중", stale: false });
  });
});

describe("검사 열", () => {
  it("「검사 안 함」과 「흠 없음」은 다른 말이다", () => {
    expect(checkText(STATUS)).toBe("검사 안 함");
    expect(checkText({ ...STATUS, check: { state: "done", errors: 0, warnings: 0 } })).toBe("흠 없음");
  });
  it("오류·경고를 센다", () => {
    expect(checkText({ ...STATUS, check: { state: "done", errors: 2, warnings: 1 } })).toBe("오류 2 · 경고 1");
    expect(checkText({ ...STATUS, check: { state: "done", warnings: 3 } })).toBe("경고 3");
  });
  it("검사 중·못 함·요약 없음", () => {
    expect(checkText({ ...STATUS, check: { state: "pending" } })).toBe("검사 중");
    expect(checkText({ ...STATUS, check: { state: "failed" } })).toBe("검사 못 함");
    expect(checkText(undefined)).toBe("—");
  });
});
