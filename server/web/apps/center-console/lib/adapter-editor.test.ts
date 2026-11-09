import { describe, expect, it } from "vitest";
import {
  appFieldsOf,
  appProblems,
  buildApp,
  cloneOperation,
  nextVersion,
  operationFieldsOf,
  parseInput,
  parseOperation,
  putOperation,
  removeOperation,
  sampleInput,
  saveConfirmText,
  untestableReason,
  violationsByTab,
  type AppFields,
} from "./adapter-editor";

const FIELDS: AppFields = {
  id: "ext-credit",
  name: "신용 조회",
  description: "",
  appGroup: "finance",
  baseUrl: "https://credit.example.com/v1",
  testBaseUrl: "https://sandbox.credit.example.com",
  extraHosts: ["files.example.com"],
  auth: "bearer",
  authHeader: "",
};

const LOOKUP = {
  name: "lookup",
  modes: ["autonomous", "deterministic"],
  retry_on: [503],
  idempotent: true,
  request: { method: "POST", path: "/lookup", body: { bizNo: "{{input.biz_no}}" } },
  response: { output: { result: "$.result" } },
  input_schema: { type: "object", properties: { biz_no: { type: "string" }, n: { type: "integer" } } },
};

describe("앱 정의 짓기", () => {
  it("만들면 C13 외부 정의이고 판은 싣지 않는다 — 허용 호스트는 주소에서, 키를 받으면 run 키가 짝이다", () => {
    const made = buildApp(FIELDS, { publisher: "admin" });
    expect(made).toMatchObject({
      schema: 2,
      id: "ext-credit",
      tier: "external",
      publisher: "admin",
      app_group: { id: "finance", name: "finance" },
      requires_keys: [{ purpose: "run" }],
      service: {
        protocol: "http-adapter",
        base_url: "https://credit.example.com/v1",
        test_base_url: "https://sandbox.credit.example.com",
        adapter: {
          allowed_hosts: ["credit.example.com", "sandbox.credit.example.com", "files.example.com"],
          auth: { type: "bearer" },
          operations: [],
        },
      },
    });
    expect(made).not.toHaveProperty("version");
  });

  it("고치면 작업·한도·모르는 칸은 그대로 두고 id·만든 곳은 바꾸지 않는다", () => {
    const previous = buildApp(FIELDS, { publisher: "admin" });
    (previous.service as { adapter: Record<string, unknown> }).adapter.operations = [LOOKUP];
    (previous.service as { adapter: Record<string, unknown> }).adapter.limits = { timeout_s: 30 };
    previous.version = "0.1.3";
    previous.docs_url = "https://docs.example.com";
    const edited = buildApp({ ...FIELDS, id: "other", auth: "none", testBaseUrl: "", extraHosts: [] }, {
      previous,
      publisher: "someone",
    });
    expect(edited).toMatchObject({ id: "ext-credit", publisher: "admin", docs_url: "https://docs.example.com" });
    expect(edited).not.toHaveProperty("version");
    const adapter = (edited.service as { adapter: Record<string, unknown> }).adapter;
    expect(adapter.operations).toEqual([LOOKUP]);
    expect(adapter.limits).toEqual({ timeout_s: 30 });
    expect(adapter).not.toHaveProperty("auth");
    expect(adapter.allowed_hosts).toEqual(["credit.example.com"]);
    expect(edited.requires_keys).toEqual([]);
    expect(edited.service).not.toHaveProperty("test_base_url");
  });

  it("편집 창의 칸은 정의에서 읽고, 주소에서 나오지 않는 호스트만 「더 보기」에 둔다", () => {
    expect(appFieldsOf(buildApp(FIELDS, { publisher: "admin" }))).toEqual(FIELDS);
    expect(appFieldsOf(null).auth).toBe("none");
  });

  it("빈 칸·https가 아닌 주소·모양이 틀린 id는 Center에 보내기 전에 막는다", () => {
    expect(appProblems(FIELDS, { creating: true })).toEqual([]);
    const bad = { ...FIELDS, id: "Ext.Credit", name: " ", baseUrl: "http://x", auth: "header" as const };
    expect(appProblems(bad, { creating: true })).toHaveLength(4);
    expect(appProblems({ ...FIELDS, id: "" }, { creating: false })).toEqual([]);
  });

  it("저장하면 판의 끝자리가 오른다", () => {
    expect(nextVersion("0.1.9")).toBe("0.1.10");
    expect(nextVersion("bad")).toBeNull();
  });
});

describe("작업", () => {
  it("창의 칸 ↔ 작업 — 모르는 칸(modes·retry_on)은 남고 요청 탭은 body·query·headers다", () => {
    const fields = operationFieldsOf(LOOKUP);
    expect(fields).toMatchObject({ name: "lookup", method: "POST", path: "/lookup", idempotent: true });
    expect(JSON.parse(fields.tabs.request)).toEqual({ body: { bizNo: "{{input.biz_no}}" } });
    const parsed = parseOperation({ ...fields, description: "신용" }, LOOKUP);
    expect(parsed.errors).toEqual({});
    expect(parsed.operation).toEqual({ ...LOOKUP, description: "신용", kind: "api" });
  });

  it("JSON을 읽지 못한 탭과 모양이 틀린 이름은 그 자리에 사유를 둔다", () => {
    const fields = operationFieldsOf(null);
    const parsed = parseOperation({ ...fields, name: "Bad Name", tabs: { ...fields.tabs, input: "{", request: "[]" } });
    expect(parsed.operation).toBeNull();
    expect(Object.keys(parsed.errors).sort()).toEqual(["form", "input", "request"]);
  });

  it("넣기는 자리를 지키고, 겹친 이름은 막고, 새 묶음은 groups에 더한다", () => {
    const app = buildApp(FIELDS, { publisher: "admin" });
    const one = putOperation(app, { ...LOOKUP }, null).definition;
    const two = putOperation(one, { ...LOOKUP, name: "report", group: "reports" }, null).definition;
    expect(putOperation(two, { ...LOOKUP, name: "report" }, "lookup").error).toMatch("겹칩니다");
    const renamed = putOperation(two, { ...LOOKUP, name: "lookup2" }, "lookup").definition;
    const adapter = (renamed.service as { adapter: { operations: Array<{ name: string }>; groups: unknown[] } }).adapter;
    expect(adapter.operations.map((op) => op.name)).toEqual(["lookup2", "report"]);
    expect(adapter.groups).toEqual([{ id: "reports", name: "reports" }]);
    const removed = removeOperation(renamed, "report");
    expect((removed.service as { adapter: { operations: unknown[] } }).adapter.operations).toHaveLength(1);
    expect(cloneOperation(LOOKUP, ["lookup", "lookup_copy"]).name).toBe("lookup_copy2");
  });

  it("Center의 E3 사유는 그 작업의 탭으로, 나머지는 창 위로 간다", () => {
    const found = violationsByTab(
      [
        { message: "본문 템플릿", items: ["service.adapter.operations[1].request.body.x"] },
        { message: "출력 경로", items: ["service.adapter.operations[1].response.output.a"] },
        { message: "다른 작업", items: ["service.adapter.operations[0].request.path"] },
        { message: "경로", items: ["service.adapter.operations[1].request.path"] },
      ],
      1,
    );
    expect(found).toEqual({ request: "본문 템플릿", response: "출력 경로", form: "다른 작업\n경로" });
  });
});

describe("시험 호출·확인 창", () => {
  it("입력 본보기는 입력 칸마다 빈 값이고, 입력은 JSON 객체만 받는다", () => {
    expect(JSON.parse(sampleInput(LOOKUP))).toEqual({ biz_no: "", n: 0 });
    expect(parseInput("").input).toEqual({});
    expect(parseInput("[1]").error).toBeTruthy();
  });

  it("맡은 일꾼이 없거나 붙어 있지 않으면 시험 호출을 끈다", () => {
    expect(untestableReason([], "unknown")).toMatch("맡은 일꾼이 없습니다");
    expect(untestableReason(["w"], "unreachable")).toMatch("90초");
    expect(untestableReason(["w"], "ok")).toBeNull();
    expect(untestableReason(null, "ok")).toBeNull();
  });

  it("저장 확인은 판이 오르는 것과 고정한 배포 수를 말한다", () => {
    expect(saveConfirmText("ext-credit", "0.1.0", [])).toEqual([
      "ext-credit 0.1.0 → 0.1.1 판으로 올립니다. 다음 일감부터 새 정의로 부릅니다.",
    ]);
    const lines = saveConfirmText("ext-credit", "0.1.0", [
      { package_id: "fin.a", package_version: "1.0.0", deployments: 2, pinned_hash: "sha256:x", pinned_version: "0.1.0" },
      { package_id: "fin.b", package_version: "1.0.0", deployments: 5 },
    ]);
    expect(lines[1]).toBe("이 판을 고정한 배포 2개는 옛 판으로 돕니다 — 새 판을 쓰려면 다시 승인·배포합니다.");
  });
});
