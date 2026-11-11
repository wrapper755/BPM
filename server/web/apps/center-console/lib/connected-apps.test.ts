import { describe, expect, it } from "vitest";
import {
  addressSetting,
  connectedApps,
  filterApps,
  groupApps,
  kindsLabel,
  readServiceApp,
  addressView,
  authLabel,
  filterOperations,
  groupOperations,
  modesLabel,
  readDefinition,
  schemaFields,
  workersOf,
} from "./connected-apps";

const DEFINITION = {
  id: "ext-ocr",
  service: {
    protocol: "http-adapter",
    base_url: "https://ocr.example.com",
    adapter: {
      auth: { type: "bearer" },
      operations: [
        {
          name: "read_invoice",
          description: "세금계산서 이미지에서 항목 추출",
          modes: ["autonomous", "deterministic"],
          idempotent: false,
          input_schema: { type: "object", required: ["file_url"], properties: { file_url: { type: "string" } } },
          output_schema: { type: "object", properties: { amount: { type: ["integer", "null"], description: "합계" } } },
          request: { method: "POST", path: "/v2/invoice" },
        },
        { name: "ping", idempotent: true },
        { description: "이름 없는 작업은 버린다" },
      ],
    },
  },
};

describe("readDefinition", () => {
  it("정의 순서대로 작업을 읽고 C13 기본값을 채운다", () => {
    const head = readDefinition(DEFINITION, []);
    expect(head.baseUrl).toBe("https://ocr.example.com");
    expect(head.auth).toBe("Bearer");
    expect(head.operations.map((one) => one.name)).toEqual(["read_invoice", "ping"]);
    const first = head.operations[0]!;
    const second = head.operations[1]!;
    expect(first.request).toBe("POST /v2/invoice");
    expect(first.input).toEqual([{ name: "file_url", type: "string", required: true, description: null }]);
    expect(first.output[0]).toMatchObject({ type: "integer | null", required: false, description: "합계" });
    expect(second.modes).toEqual(["autonomous"]);
    expect(second.idempotent).toBe(true);
    expect(second.request).toBeNull();
  });

  it("집계는 이름으로 맞추고, 일감이 없던 작업은 0으로 — 집계를 못 받으면 null", () => {
    const counted = readDefinition(DEFINITION, [{ operation: "ping", waiting: 2 }, { operation: "gone", waiting: 9 }]);
    expect(counted.operations[1]!.counts?.waiting).toBe(2);
    expect(counted.operations[0]!.counts).toEqual({ operation: "read_invoice" });
    expect(readDefinition(DEFINITION, null).operations[0]!.counts).toBeNull();
  });

  it("모양이 틀린 정의는 빈 목록이다", () => {
    expect(readDefinition(null, []).operations).toEqual([]);
    expect(readDefinition({ service: { adapter: { operations: "x" } } }, []).auth).toBe("없음");
  });
});

describe("표기", () => {
  it("모드·인증", () => {
    expect(modesLabel(["autonomous", "deterministic"])).toBe("자율·결정");
    expect(modesLabel(["odd"])).toBe("odd");
    expect(authLabel({ type: "header", name: "X-Key" })).toBe("헤더 X-Key");
    expect(authLabel(undefined)).toBe("없음");
  });

  it("schemaFields — properties가 없으면 빈 목록", () => {
    expect(schemaFields({ type: "object" })).toEqual([]);
  });
});

describe("filterOperations·workersOf", () => {
  const rows = readDefinition(DEFINITION, []).operations;
  it("이름·설명에서 대소문자 없이 찾는다", () => {
    expect(filterOperations(rows, "INVOICE").map((one) => one.name)).toEqual(["read_invoice"]);
    expect(filterOperations(rows, "세금계산서").length).toBe(1);
    expect(filterOperations(rows, "  ").length).toBe(2);
  });
  it("토픽을 맡은 일꾼", () => {
    expect(workersOf([{ name: "worker", topics: ["ext-ocr"] }, { name: "other", topics: [] }], "ext-ocr")).toEqual(["worker"]);
  });
});

describe("groupOperations", () => {
  const grouped = {
    service: {
      adapter: {
        groups: [
          { id: "b", name: "둘째", description: "뒤" },
          { id: "a", name: "첫째" },
          { id: "empty", name: "빈 묶음" },
        ],
        operations: [
          { name: "x", group: "a" },
          { name: "y", group: "b" },
          { name: "z" },
          { name: "w", group: "a" },
          { name: "q", group: "unknown" },
        ],
      },
    },
  };
  it("groups 순서대로, 안은 정의 순서, 묶음 없는 것과 모르는 것은 맨 뒤 「기타」, 빈 묶음은 빠진다", () => {
    const head = readDefinition(grouped, [
      { operation: "x", waiting: 1, failed_recent: 2, completed_recent: 5, last_finished_at: "2026-11-08T01:00:00+00:00" },
      { operation: "w", failed_recent: 1, working: 2, last_finished_at: "2026-11-08T10:00:00+09:00" },
    ]);
    const sections = groupOperations(head.operations, head.groups)!;
    expect(sections.map((one) => [one.name, one.rows.map((row) => row.name)])).toEqual([
      ["둘째", ["y"]],
      ["첫째", ["x", "w"]],
      ["기타", ["z", "q"]],
    ]);
    expect(sections[1]).toMatchObject({ waiting: 1, working: 2, completed: 5, failed: 3 });
    // 시간대가 달라도 시각으로 비교한다 — 10:00+09:00은 01:00Z와 같고 먼저 적힌 것이 남는다.
    expect(sections[1]!.lastFinished).toBe("2026-11-08T01:00:00+00:00");
    expect(sections[0]!.description).toBe("뒤");
  });
  it("정의에 묶음이 없으면 묶지 않는다", () => {
    expect(groupOperations(readDefinition(DEFINITION, []).operations, [])).toBeNull();
  });
});

describe("addressView", () => {
  it("일꾼이 알린 주소가 이기고, 다르면 「일꾼 설정」과 정의 기본값을 툴팁에", () => {
    expect(addressView("https://a.example.com", { base_url: "https://b.example.com", test_base_url: "https://t.example.com" })).toEqual({
      url: "https://b.example.com",
      source: "일꾼 설정",
      note: "정의 기본값: https://a.example.com\n시험 일감: https://t.example.com",
    });
  });
  it("같거나(끝 / 무시) 알리지 않았으면 정의 기본값", () => {
    expect(addressView("https://a.example.com/", { base_url: "https://a.example.com" })).toMatchObject({ source: "정의 기본값", note: null });
    expect(addressView("https://a.example.com", undefined)).toEqual({ url: "https://a.example.com", source: "정의 기본값", note: null });
  });
  it("바꾸는 곳 — 어댑터 일꾼의 환경변수 이름", () => {
    expect(addressSetting("ext-credit")).toBe("BPM_ADAPTER__EXT__EXT_CREDIT__BASE_URL");
  });
});

describe("연결 앱 목록", () => {
  const extensions = [
    { id: "ext-ocr", tier: "external", name: "외부 OCR", version: "1.0.0", status: "ok", definition: { ...DEFINITION, app_group: { id: "ext", name: "외부 서비스" }, keywords: ["영수증"] } },
    { id: "seal", tier: "builtin", name: "인감", version: "1.0.0" },
  ];
  const serviceApps = [
    { app_id: "review", name: "검토 초안", version: "2.0.0", status: "unknown", operations: [{ name: "draft", kind: "ai" }, { name: "save", kind: "api" }, { name: "x" }] },
    { app_id: "ext-ocr", name: "같은 토픽", operations: [] },
  ];
  const apps = connectedApps(extensions, serviceApps);

  it("외부 정의와 일꾼 앱을 한 목록으로 — 내장 확장은 빼고, 같은 id는 외부 정의가 이긴다", () => {
    expect(apps.map((one) => [one.id, one.impl, one.operations])).toEqual([
      ["review", "worker", 3],
      ["ext-ocr", "external", 2],
    ]);
    expect(kindsLabel(apps[0]!.kinds)).toBe("AI·API");
    expect(kindsLabel(apps[1]!.kinds)).toBe("API");
    // 일꾼 manifest가 말하는 종류가 정의의 것을 이긴다.
    const counted = connectedApps(extensions, [], new Map([["ext-ocr", [{ operation: "ping", kind: "ai" }]]]));
    expect(kindsLabel(counted[0]!.kinds)).toBe("API·AI");
  });

  it("찾기는 이름·id·키워드", () => {
    expect(filterApps(apps, "영수증").map((one) => one.id)).toEqual(["ext-ocr"]);
    expect(filterApps(apps, "REVIEW").map((one) => one.id)).toEqual(["review"]);
  });

  it("앱 묶음 — 이름 순, 묶음 없는 앱은 「기타」, 아무도 묶지 않으면 null", () => {
    expect(groupApps(apps)?.map((one) => [one.name, one.apps.map((app) => app.id)])).toEqual([
      ["외부 서비스", ["ext-ocr"]],
      ["기타", ["review"]],
    ]);
    expect(groupApps(apps.filter((one) => one.id === "review"))).toBeNull();
  });

  it("일꾼 앱의 작업 — C11 기본 종류는 ai, 다시 불러도 됨은 없다", () => {
    const head = readServiceApp(
      { operations: [{ name: "x", group: "g", keywords: ["k"] }], groups: [{ id: "g", name: "묶음" }] },
      null,
    );
    expect(head.operations[0]).toMatchObject({ kind: "ai", idempotent: null, group: "g", keywords: ["k"], counts: null });
    expect(head.groups).toEqual([{ id: "g", name: "묶음", description: null }]);
    expect(head.auth).toBeNull();
  });
});
