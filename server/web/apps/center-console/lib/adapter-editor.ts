/**
 * CON-18 만들기·고치기 — 콘솔에서 HTTP 어댑터 앱의 정의(C13)를 짓고 고친다 (ADR-0141).
 *
 * 화면을 모르는 순수 함수만 둔다 (vitest가 잰다 — `adapter-editor.test.ts`). 정의는 열린 객체라 **모르는 칸을
 * 버리지 않는다** — 고칠 때는 앞 정의를 바탕으로 폼이 다루는 칸만 바꾼다. 검사(E1~E4)는 **Center가 한다**
 * (한 자리에서만 판정한다). 여기서는 JSON 칸을 읽지 못한 것만 막고, Center의 E3 사유를 탭마다 나눈다.
 */

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─────────────────────────── 앱 ───────────────────────────

/** 「인증」 — 키 값은 받지 않는다 (일꾼 설정 `BPM_ADAPTER__EXT__<id>__KEY`). */
export type AuthKind = "none" | "bearer" | "header";

export const AUTH_LABEL: Record<AuthKind, string> = { none: "없음", bearer: "Bearer 키", header: "헤더 키" };

/** 만들기·편집 창의 칸들. */
export interface AppFields {
  id: string;
  name: string;
  description: string;
  /** 「앱 묶음」 — 있는 것을 고르거나 새로 적는다. id만 받고 이름은 id와 같게 둔다(있던 묶음이면 그 이름). */
  appGroup: string;
  baseUrl: string;
  testBaseUrl: string;
  /** 「더 보기」 — 주소 밖에서 더 부를 호스트 (한 줄에 하나). */
  extraHosts: string[];
  auth: AuthKind;
  authHeader: string;
}

/** 앱 id 모양 (C13 `ExtensionId`) — 영문 소문자로 시작, 소문자·숫자·`-`, 2~50자. */
export const APP_ID = /^[a-z][a-z0-9-]{1,49}$/;

/** 주소의 호스트 — 읽지 못하면 null. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "") || null;
  } catch {
    return null;
  }
}

/** 「더 보기」 글 칸 → 호스트들 (쉼표나 줄로 나눈다, 겹친 것은 버린다). */
export function parseHosts(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((one) => one.trim()).filter(Boolean))];
}

/** 폼 칸을 읽기 전에 막을 것 — 비어 있거나 모양이 틀린 것만. 나머지는 Center가 본다. */
export function appProblems(fields: AppFields, { creating }: { creating: boolean }): string[] {
  const out: string[] = [];
  if (creating && !APP_ID.test(fields.id)) out.push("앱 id는 영문 소문자로 시작하고 소문자·숫자·-만 씁니다 (2~50자).");
  if (!fields.name.trim()) out.push("이름을 넣으세요.");
  if (!fields.baseUrl.trim()) out.push("주소를 넣으세요.");
  else if (!fields.baseUrl.startsWith("https://")) out.push("주소는 https://로 시작합니다.");
  else if (!hostOf(fields.baseUrl)) out.push("주소를 읽지 못했습니다.");
  if (fields.testBaseUrl.trim() && !fields.testBaseUrl.startsWith("https://")) out.push("시험 주소도 https://로 시작합니다.");
  if (fields.auth === "header" && !fields.authHeader.trim()) out.push("헤더 키는 헤더 이름이 필요합니다.");
  return out;
}

/** 지금 정의 → 편집 창의 칸들 (만들기면 빈 칸). 「더 보기」는 주소에서 나오지 않는 허용 호스트다. */
export function appFieldsOf(definition: unknown): AppFields {
  const found = record(definition) ?? {};
  const service = record(found.service) ?? {};
  const adapter = record(service.adapter) ?? {};
  const auth = record(adapter.auth);
  const baseUrl = text(service.base_url);
  const testBaseUrl = text(service.test_base_url);
  const fromUrls = new Set([hostOf(baseUrl), hostOf(testBaseUrl)].filter(Boolean));
  const hosts = Array.isArray(adapter.allowed_hosts) ? adapter.allowed_hosts.map(text).filter(Boolean) : [];
  const kind = text(auth?.type);
  return {
    id: text(found.id),
    name: text(found.name),
    description: text(found.description),
    appGroup: text(record(found.app_group)?.id),
    baseUrl,
    testBaseUrl,
    extraHosts: hosts.filter((one) => !fromUrls.has(one)),
    auth: kind === "bearer" || kind === "header" ? kind : "none",
    authHeader: text(auth?.name),
  };
}

/**
 * 폼 칸 → 정의. `previous`가 있으면 그것을 바탕으로 폼이 다루는 칸만 바꾼다(작업·한도·모르는 칸은 그대로).
 * 판은 Center가 정하므로 싣지 않는다. 키를 받는 앱이면 `requires_keys`에 `run`을 둔다(E3 — 둘이 짝이다).
 */
export function buildApp(
  fields: AppFields,
  { previous, publisher, groups }: { previous?: unknown; publisher: string; groups?: Array<{ id: string; name: string }> },
): Json {
  const out: Json = clone(record(previous) ?? {});
  delete out.version;
  const service: Json = record(out.service) ?? {};
  const adapter: Json = record(service.adapter) ?? {};
  const hosts = [hostOf(fields.baseUrl), hostOf(fields.testBaseUrl), ...fields.extraHosts].filter(
    (one): one is string => Boolean(one),
  );

  out.schema = 2;
  out.id = record(previous) ? out.id : fields.id.trim();
  out.name = fields.name.trim();
  if (fields.description.trim()) out.description = fields.description.trim();
  else delete out.description;
  out.publisher = text(out.publisher) || publisher;
  out.tier = "external";
  const group = fields.appGroup.trim();
  if (group) out.app_group = { id: group, name: groups?.find((one) => one.id === group)?.name ?? group };
  else delete out.app_group;

  service.protocol = "http-adapter";
  service.base_url = fields.baseUrl.trim();
  if (fields.testBaseUrl.trim()) service.test_base_url = fields.testBaseUrl.trim();
  else delete service.test_base_url;
  adapter.allowed_hosts = [...new Set(hosts)];
  if (fields.auth === "none") delete adapter.auth;
  else adapter.auth = fields.auth === "header" ? { type: "header", name: fields.authHeader.trim() } : { type: "bearer" };
  if (!Array.isArray(adapter.operations)) adapter.operations = [];
  service.adapter = adapter;
  out.service = service;

  const keys = (Array.isArray(out.requires_keys) ? out.requires_keys : []).filter(
    (one) => record(one)?.purpose !== "run",
  );
  out.requires_keys = fields.auth === "none" ? keys : [...keys, { purpose: "run" }];
  if (!record(out.contributes)) out.contributes = {};
  return out;
}

/** 저장하면 붙을 판 — 끝자리 + 1 (Center 규칙, C7). 읽지 못하면 null. */
export function nextVersion(version: string): string | null {
  const parts = version.split(".");
  const last = Number(parts.at(-1));
  if (parts.length !== 3 || !Number.isInteger(last)) return null;
  return [...parts.slice(0, -1), String(last + 1)].join(".");
}

/** 정의에 있는 앱 묶음들 — 「앱 묶음」 고르기 목록 (C13 `app_group`). */
export function appGroupsOf(definitions: unknown[]): Array<{ id: string; name: string }> {
  const out = new Map<string, string>();
  for (const one of definitions) {
    const group = record(record(one)?.app_group);
    const id = text(group?.id);
    if (id && !out.has(id)) out.set(id, text(group?.name) || id);
  }
  return [...out].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// ─────────────────────────── 원본 ───────────────────────────

/** 「원본」 열 — 콘솔에서 만든 것만 여기서 고친다 (C7 `source`, 일꾼 앱은 늘 「일꾼」). */
export function sourceOf(source: string | null | undefined): "console" | "consumer" {
  return source === "console" ? "console" : "consumer";
}

export const SOURCE_LABEL = { console: "콘솔", consumer: "일꾼" } as const;
export const SOURCE_HINT = {
  console: "콘솔 — 여기서 고칩니다",
  consumer: "일꾼 — 맡은 일꾼이 뜰 때 올립니다",
} as const;

// ─────────────────────────── 작업 ───────────────────────────

/** 작업 창의 JSON 탭 넷. */
export const OPERATION_TABS = ["input", "output", "request", "response"] as const;
export type OperationTab = (typeof OPERATION_TABS)[number];
export const TAB_LABEL: Record<OperationTab, string> = {
  input: "입력",
  output: "출력",
  request: "요청 본문",
  response: "응답",
};

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** 작업 창의 칸들 — 넷은 폼, 넷은 JSON 글. */
export interface OperationFields {
  name: string;
  group: string;
  method: string;
  path: string;
  description: string;
  idempotent: boolean;
  tabs: Record<OperationTab, string>;
}

function pretty(value: unknown): string {
  return value === undefined || value === null ? "" : JSON.stringify(value, null, 2);
}

/** 작업 하나 → 창의 칸들. 없으면 새 작업의 본보기. 「요청 본문」 탭은 `request`의 `body`·`query`·`headers`다. */
export function operationFieldsOf(operation: unknown): OperationFields {
  const found = record(operation);
  if (!found) {
    return {
      name: "",
      group: "",
      method: "POST",
      path: "/",
      description: "",
      idempotent: false,
      tabs: {
        input: pretty({ type: "object", properties: {}, required: [] }),
        output: "",
        request: pretty({ body: {} }),
        response: pretty({ output: { result: "$" } }),
      },
    };
  }
  const request = record(found.request) ?? {};
  const requestTab: Json = {};
  for (const key of ["body", "query", "headers"]) if (request[key] !== undefined) requestTab[key] = request[key];
  return {
    name: text(found.name),
    group: text(found.group),
    method: text(request.method) || "POST",
    path: text(request.path) || "/",
    description: text(found.description),
    idempotent: found.idempotent === true,
    tabs: {
      input: pretty(found.input_schema),
      output: pretty(found.output_schema),
      request: Object.keys(requestTab).length ? pretty(requestTab) : "",
      response: pretty(found.response),
    },
  };
}

export interface OperationParsed {
  operation: Json | null;
  /** 탭 또는 `form` → 사유. */
  errors: Partial<Record<OperationTab | "form", string>>;
}

function parseTab(raw: string): { value: unknown; error?: string } {
  if (!raw.trim()) return { value: undefined };
  try {
    return { value: JSON.parse(raw) };
  } catch (cause) {
    return { value: undefined, error: `JSON을 읽지 못했습니다 — ${cause instanceof Error ? cause.message : cause}` };
  }
}

/** 창의 칸들 → 작업 하나. `previous`의 모르는 칸(`modes`·`retry_on`·`keywords` 등)은 그대로 둔다. */
export function parseOperation(fields: OperationFields, previous?: unknown): OperationParsed {
  const errors: OperationParsed["errors"] = {};
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(fields.name.trim())) {
    errors.form = "이름은 영문 소문자로 시작하고 소문자·숫자·_만 씁니다.";
  }
  if (!fields.path.trim().startsWith("/")) errors.form = errors.form ?? "경로는 /로 시작합니다.";
  const parsed = Object.fromEntries(OPERATION_TABS.map((tab) => [tab, parseTab(fields.tabs[tab])])) as Record<
    OperationTab,
    ReturnType<typeof parseTab>
  >;
  for (const tab of OPERATION_TABS) if (parsed[tab].error) errors[tab] = parsed[tab].error;
  const requestTab = parsed.request.value;
  if (requestTab !== undefined && !record(requestTab)) errors.request = "{\"body\": …, \"query\": …, \"headers\": …} 모양으로 적습니다.";
  if (Object.keys(errors).length) return { operation: null, errors };

  const out: Json = clone(record(previous) ?? {});
  out.name = fields.name.trim();
  if (fields.description.trim()) out.description = fields.description.trim();
  else delete out.description;
  if (fields.group.trim()) out.group = fields.group.trim();
  else delete out.group;
  out.idempotent = fields.idempotent;
  out.kind = "api";
  const pick = (tab: OperationTab, key: string) => {
    if (parsed[tab].value === undefined) delete out[key];
    else out[key] = parsed[tab].value;
  };
  pick("input", "input_schema");
  pick("output", "output_schema");
  pick("response", "response");
  out.request = { method: fields.method, path: fields.path.trim(), ...(record(requestTab) ?? {}) };
  return { operation: out, errors };
}

function operationsOf(definition: Json): Json[] {
  const adapter = record(record(definition.service)?.adapter);
  return Array.isArray(adapter?.operations) ? (adapter.operations as Json[]) : [];
}

/** 작업 이름들 (정의 순서). */
export function operationNames(definition: unknown): string[] {
  return operationsOf(record(definition) ?? {}).map((one) => text(one.name));
}

/** 정의에서 작업 하나 (이름으로). */
export function operationOf(definition: unknown, name: string): Json | null {
  return operationsOf(record(definition) ?? {}).find((one) => text(one.name) === name) ?? null;
}

/**
 * 작업 하나를 넣는다 — `replacing`이 있으면 그 자리를 바꾸고(이름이 바뀌어도 자리는 그대로), 없으면 끝에 더한다.
 * 이름이 다른 작업과 겹치면 오류. 새 묶음 id면 `groups`에 더한다(이름 = id). 앞 정의는 건드리지 않는다.
 */
export function putOperation(definition: unknown, operation: Json, replacing: string | null): { definition: Json; error?: string } {
  const out = clone(record(definition) ?? {});
  const adapter = record(record(out.service)?.adapter);
  if (!adapter) return { definition: out, error: "정의에 어댑터가 없습니다." };
  const list = operationsOf(out);
  const name = text(operation.name);
  if (list.some((one) => text(one.name) === name && name !== replacing)) {
    return { definition: out, error: `작업 이름이 겹칩니다: ${name}` };
  }
  const at = replacing === null ? -1 : list.findIndex((one) => text(one.name) === replacing);
  adapter.operations = at < 0 ? [...list, operation] : list.map((one, i) => (i === at ? operation : one));
  const group = text(operation.group);
  const groups = Array.isArray(adapter.groups) ? (adapter.groups as Json[]) : [];
  if (group && !groups.some((one) => text(one.id) === group)) adapter.groups = [...groups, { id: group, name: group }];
  return { definition: out };
}

/** 작업 하나를 뺀다. 비게 된 묶음은 남겨 둔다(E3가 막지 않는다 — 사람이 다시 쓸 수 있다). */
export function removeOperation(definition: unknown, name: string): Json {
  const out = clone(record(definition) ?? {});
  const adapter = record(record(out.service)?.adapter);
  if (adapter) adapter.operations = operationsOf(out).filter((one) => text(one.name) !== name);
  return out;
}

/** 「복제...」 — 이름에 `_copy`(겹치면 `_copy2`…)를 붙인 같은 작업. */
export function cloneOperation(operation: Json, names: string[]): Json {
  const base = `${text(operation.name)}_copy`;
  let name = base;
  for (let i = 2; names.includes(name); i += 1) name = `${base}${i}`;
  return { ...clone(operation), name };
}

/** 작업 묶음들 (`adapter.groups`) — 「묶음」 고르기 목록. */
export function operationGroupsOf(definition: unknown): Array<{ id: string; name: string }> {
  const adapter = record(record(record(definition)?.service)?.adapter);
  return (Array.isArray(adapter?.groups) ? adapter.groups : []).flatMap((one) => {
    const id = text(record(one)?.id);
    return id ? [{ id, name: text(record(one)?.name) || id }] : [];
  });
}

// ─────────────────────────── Center의 사유 ───────────────────────────

/** Center가 돌려준 검사 사유 한 줄 (`detail.violations[]`). */
export interface Violation {
  rule?: string;
  message: string;
  items?: string[];
}

/**
 * E3 사유를 작업 창의 탭으로 나눈다 — `service.adapter.operations[<자리>].<칸>`이 그 작업의 것이다.
 * 그 작업의 것이 아니거나 탭이 아닌 칸이면 `form`으로 간다(창 위에 보인다).
 */
export function violationsByTab(violations: Violation[], index: number): Partial<Record<OperationTab | "form", string>> {
  const out: Partial<Record<OperationTab | "form", string[]>> = {};
  const prefix = `service.adapter.operations[${index}]`;
  for (const one of violations) {
    const where = one.items?.[0] ?? "";
    let tab: OperationTab | "form" = "form";
    if (where.startsWith(prefix)) {
      const rest = where.slice(prefix.length);
      if (rest.startsWith(".input_schema")) tab = "input";
      else if (rest.startsWith(".output_schema")) tab = "output";
      else if (/^\.request\.(body|query|headers)/.test(rest)) tab = "request";
      else if (rest.startsWith(".response")) tab = "response";
    }
    (out[tab] ??= []).push(one.message);
  }
  return Object.fromEntries(Object.entries(out).map(([key, list]) => [key, list.join("\n")]));
}

/** 시험 호출 입력 칸 → 값. 비면 `{}`. */
export function parseInput(raw: string): { input: Json | null; error?: string } {
  if (!raw.trim()) return { input: {} };
  try {
    const value: unknown = JSON.parse(raw);
    return record(value) ? { input: value as Json } : { input: null, error: "입력은 JSON 객체({…})로 적습니다." };
  } catch (cause) {
    return { input: null, error: `JSON을 읽지 못했습니다 — ${cause instanceof Error ? cause.message : cause}` };
  }
}

/** 입력 스키마의 칸으로 시험 입력의 본보기를 짓는다 — 칸마다 빈 값. */
export function sampleInput(operation: unknown): string {
  const props = record(record(record(operation)?.input_schema)?.properties) ?? {};
  const sample: Json = {};
  for (const [name, raw] of Object.entries(props)) {
    const type = record(raw)?.type;
    sample[name] =
      type === "number" || type === "integer" ? 0 : type === "boolean" ? false : type === "array" ? [] : type === "object" ? {} : "";
  }
  return JSON.stringify(sample, null, 2);
}

// ─────────────────────────── 확인 창 ───────────────────────────

/** 쓰는 배포 한 줄 (C7 `ExtensionDependent`) — 화면이 쓰는 칸만. */
export interface DependentLine {
  package_id: string;
  package_version: string;
  deployments: number;
  pinned_hash?: string | null;
  pinned_version?: string | null;
}

/** 저장 확인 창의 글 — 판이 어떻게 오르고, 이 앱을 고정한 배포가 옛 판으로 도는가 (CON-18). */
export function saveConfirmText(id: string, version: string, dependents: DependentLine[] | null): string[] {
  const next = nextVersion(version) ?? "새 판";
  const lines = [`${id} ${version} → ${next} 판으로 올립니다. 다음 일감부터 새 정의로 부릅니다.`];
  const pinned = (dependents ?? []).filter((one) => one.pinned_hash);
  const count = pinned.reduce((total, one) => total + one.deployments, 0);
  if (count > 0) {
    lines.push(`이 판을 고정한 배포 ${count}개는 옛 판으로 돕니다 — 새 판을 쓰려면 다시 승인·배포합니다.`);
  }
  if (dependents === null) lines.push("이 앱을 쓰는 배포를 읽지 못했습니다.");
  return lines;
}

/** 확인 창의 배포 목록 한 줄 — 「<패키지>@<판> · 배포 n · <고정한 판> 고정」. */
export function dependentLine(one: DependentLine): string {
  const pinned = one.pinned_hash ? ` · ${one.pinned_version ?? "알 수 없는 판"} 고정` : "";
  return `${one.package_id}@${one.package_version} · 배포 ${one.deployments}${pinned}`;
}

/** 시험 호출을 못 하는 까닭 — 맡은 일꾼이 없거나 붙어 있지 않다. 되면 null (토픽 상태는 C7 `status`). */
export function untestableReason(workers: string[] | null, status: string | null | undefined): string | null {
  if (workers !== null && workers.length === 0) return "맡은 일꾼이 없습니다 — 「편집...」의 「맡을 일꾼」에서 고르세요.";
  if (status === "unreachable") return "맡은 일꾼이 90초 넘게 가져가지 않았습니다 — 일꾼이 떠 있는지 보세요.";
  return null;
}
