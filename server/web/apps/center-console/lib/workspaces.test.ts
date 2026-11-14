import { describe, expect, it } from "vitest";
import type { FileInfo } from "@bpm/api-types/c17-file-info";

import { fileKind, fileLabel, firstOpen, groupFiles, isEditable, opensWith } from "./workspaces";

const file = (path: string): FileInfo => ({
  path,
  size_bytes: 1,
  revision: "r",
  updated_at: "2026-11-13T00:00:00Z",
  updated_by: "admin",
});

describe("파일 갈래", () => {
  it("자리와 확장자로 가른다 (C17 경로 규칙)", () => {
    expect(fileKind("process/main.bpmn")).toBe("process");
    expect(fileKind("process/limit.dmn")).toBe("decision");
    expect(fileKind("cases/main.cases.json")).toBe("cases");
    expect(fileKind("libs/erp.shared@1.2.0/process/a.bpmn")).toBe("lib");
    expect(fileKind("memory/specs.json")).toBe("memory");
    expect(fileKind("process.json")).toBe("settings");
  });

  it("받아 둔 것은 고칠 수 없다 — C17이 거부하기 전에 화면이 안다", () => {
    expect(isEditable("process/main.bpmn")).toBe(true);
    expect(isEditable("libs/erp.shared@1.2.0/process/a.bpmn")).toBe(false);
    expect(isEditable("memory/specs.json")).toBe(false);
    expect(isEditable("process.json")).toBe(false);
  });

  it("고른 파일이 가운데를 정한다 (ADR-0147)", () => {
    expect(opensWith("process/main.bpmn")).toBe("canvas");
    expect(opensWith("process/limit.dmn")).toBe("table");
    expect(opensWith("cases/main.cases.json")).toBe("cases");
    expect(opensWith("libs/erp.shared@1.2.0/process/a.bpmn")).toBe("viewer");
    // 받아 둔 것이라도 그림·표가 아니면 띄울 것이 없다.
    expect(opensWith("libs/erp.shared@1.2.0/process.json")).toBeNull();
    expect(opensWith("process.json")).toBeNull();
  });

  it("줄에 보일 이름은 마지막 조각이다", () => {
    expect(fileLabel("process/main.bpmn")).toBe("main.bpmn");
    expect(fileLabel("process.json")).toBe("process.json");
  });
});

describe("탐색기 묶음", () => {
  it("갈래로 묶고 묶음 안에서는 경로 순이다", () => {
    const groups = groupFiles([
      file("process/zeta.bpmn"),
      file("cases/main.cases.json"),
      file("process/alpha.bpmn"),
      file("process/limit.dmn"),
      file("memory/specs.json"),
    ]);
    expect(groups.map((one) => one.label)).toEqual(["정의", "결정표", "시험 케이스", "받아 둔 공유 프로세스"]);
    expect(groups[0]?.files.map((one) => one.path)).toEqual(["process/alpha.bpmn", "process/zeta.bpmn"]);
    expect(groups[1]?.files.map((one) => one.path)).toEqual(["process/limit.dmn"]);
  });

  it("빈 묶음도 남긴다 — 둘 수 있다는 것이 보여야 한다", () => {
    const groups = groupFiles([file("process/main.bpmn")]);
    expect(groups).toHaveLength(4);
    expect(groups[2]?.files).toEqual([]);
  });

  it("`memory/`와 `process.json`은 탐색기에 두지 않는다", () => {
    const paths = groupFiles([file("memory/specs.json"), file("process.json")]).flatMap((one) =>
      one.files.map((f) => f.path),
    );
    expect(paths).toEqual([]);
  });
});

describe("처음 열 파일", () => {
  const files = [file("process/alpha.bpmn"), file("process/main.bpmn"), file("libs/x@1/process/a.bpmn")];

  it("진입 정의를 연다", () => {
    expect(firstOpen(files, "process/main.bpmn")).toBe("process/main.bpmn");
  });

  it("진입 정의가 없으면 첫 정의다", () => {
    expect(firstOpen(files, null)).toBe("process/alpha.bpmn");
  });

  it("진입 정의가 지워졌으면 첫 정의로 물러난다", () => {
    expect(firstOpen(files, "process/gone.bpmn")).toBe("process/alpha.bpmn");
  });

  it("정의가 없으면 아무것도 열지 않는다 — 남의 그림을 띄우지 않는다", () => {
    expect(firstOpen([file("libs/x@1/process/a.bpmn")], null)).toBeNull();
  });
});
