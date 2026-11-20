import { describe, expect, it } from "vitest";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { ServiceAppResource } from "@bpm/api-types/c7-service-app-resource";

import { appRows, resourceRoots, serviceCallHints, sharedRows } from "./resources";

/**
 * CON-20b 「리소스」 탭이 **무엇을 줄로 세우고 그 줄이 무엇을 만드는가** (ADR-0155).
 *
 * 화면이 아니라 이 함수가 판정한다 — 틀리면 캔버스에 부를 수 없는 노드가 생기고 그것이
 * 실행 전 검사(B14)에서야 드러난다.
 */

const lib = (overrides: Partial<PackageInfo> = {}): PackageInfo =>
  ({
    id: "shared.billing",
    version: "1.2.0",
    kind: "process_lib",
    name: "청구 공통",
    status: "approved",
    content_hash: "sha256:" + "0".repeat(64),
    uploaded_at: "2026-11-01T00:00:00+09:00",
    uploaded_by: "admin",
    manifest: {
      provides: {
        processes: [
          { process_id: "Proc_tax", file: "process/tax.bpmn", name: "세금 계산" },
          { process_id: "Proc_fee", file: "process/fee.bpmn" },
        ],
      },
    },
    ...overrides,
  }) as PackageInfo;

const app = (overrides: Partial<ServiceAppResource> = {}): ServiceAppResource => ({
  app_id: "erp",
  name: "ERP",
  operations: [
    { name: "create_invoice", description: "청구서를 만든다" },
    { name: "void_invoice" },
  ],
  ...overrides,
});

describe("공유 프로세스", () => {
  it("설치된 판의 정의는 CallActivity를 만들고 calledElement가 그 process id다", () => {
    const rows = sharedRows([lib()], [{ id: "shared.billing", version: "1.2.0" }]);
    const made = rows.find((one) => one.key.endsWith("Proc_tax"));
    expect(made?.spec).toEqual({
      bpmn: "bpmn:CallActivity",
      name: "세금 계산",
      attrs: { calledElement: "Proc_tax" },
    });
    // 이름이 없는 정의는 **process id가 이름이다** — 빈 이름의 노드를 만들지 않는다.
    expect(rows.find((one) => one.key.endsWith("Proc_fee"))?.label).toBe("Proc_fee");
  });

  it("설치되지 않은 판은 끄고 까닭을 말한다 — 만들 것이 없으니 spec도 없다", () => {
    const rows = sharedRows([lib()], []);
    const made = rows.find((one) => one.key.endsWith("Proc_tax"));
    expect(made?.spec).toBeUndefined();
    expect(made?.blocked).toContain("설치");
    expect(rows.find((one) => one.kind === "group")?.note).toBe("설치 안 됨");
  });

  it("판이 다르면 설치된 것이 아니다", () => {
    const rows = sharedRows([lib()], [{ id: "shared.billing", version: "1.1.0" }]);
    expect(rows.find((one) => one.key.endsWith("Proc_tax"))?.spec).toBeUndefined();
  });

  it("provides가 없는 패키지는 줄을 내지 않는다 — 부를 것이 없다", () => {
    expect(sharedRows([lib({ manifest: {} as PackageInfo["manifest"] })], [])).toEqual([]);
  });
});

describe("서비스 앱", () => {
  it("작업은 ServiceTask + bpm:serviceCall을 만들고 입력·출력 짝은 짓지 않는다", () => {
    const made = appRows([app()]).find((one) => one.key === "op:erp:create_invoice");
    expect(made?.spec).toEqual({
      bpmn: "bpmn:ServiceTask",
      name: "create_invoice",
      bpm: { serviceCall: JSON.stringify({ app_id: "erp", operation: "create_invoice" }) },
    });
    expect(JSON.parse(made?.spec?.bpm?.serviceCall ?? "{}")).not.toHaveProperty("input");
  });

  it("작업이 없는 앱은 줄을 내지 않는다", () => {
    expect(appRows([app({ operations: [] })])).toEqual([]);
  });
});

describe("찾기", () => {
  it("묶음 이름으로 찾으면 그 묶음의 줄이 다 남는다", () => {
    expect(appRows([app()], "ERP").filter((one) => one.kind === "item")).toHaveLength(2);
  });

  it("줄 이름으로 찾으면 그 줄만 남고 묶음 머리는 따라온다", () => {
    const rows = appRows([app()], "void");
    expect(rows.map((one) => one.kind)).toEqual(["group", "item"]);
    expect(rows[1]?.label).toBe("void_invoice");
  });

  it("아무것도 맞지 않으면 묶음 머리도 서지 않는다", () => {
    expect(appRows([app()], "없는이름")).toEqual([]);
  });

  it("대소문자를 가리지 않는다", () => {
    expect(appRows([app()], "VOID")).toHaveLength(2);
  });
});

describe("뿌리", () => {
  it("뿌리는 둘이다 — 확장이 기여한 자원의 뿌리는 두지 않는다 (ADR-0114)", () => {
    const roots = resourceRoots([lib()], [app()], []);
    expect(roots.map((one) => one.label)).toEqual(["공유 프로세스", "서비스 앱"]);
  });

  it("찾는 중에 비면 「없습니다」가 아니라 「찾는 것이 없습니다」다", () => {
    const [shared] = resourceRoots([], [], [], "무엇");
    expect(shared?.empty).toBe("찾는 것이 없습니다.");
  });
});

describe("서비스 앱 태스크 칸의 고를 거리", () => {
  it("등록된 앱과 그 앱의 작업을 띄운다", () => {
    const found = serviceCallHints([app()], "erp", "");
    expect(found.apps).toEqual([{ value: "erp", label: "ERP" }]);
    expect(found.operations.map((one) => one.value)).toEqual(["create_invoice", "void_invoice"]);
    expect(found.appWarning).toBeUndefined();
  });

  it("없는 앱·없는 작업은 한 줄로 알린다", () => {
    expect(serviceCallHints([app()], "erq", "").appWarning).toContain("erq");
    expect(serviceCallHints([app()], "erp", "create_invoce").operationWarning).toContain("create_invoce");
    expect(serviceCallHints([app()], "erp", "void_invoice").operationWarning).toBeUndefined();
  });

  it("목록이 비면 아무 말도 하지 않는다 — 못 읽은 것을 「없다」로 단정하지 않는다", () => {
    expect(serviceCallHints([], "anything", "op")).toEqual({ apps: [], operations: [] });
  });
});
