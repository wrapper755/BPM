/**
 * CON-18 연결 앱 — 외부 정의(C13)와 일꾼 앱(C11)을 같은 줄 모양으로 바꾸고 일감 집계(C15)와 맞춘다 (ADR-0138).
 *
 * 앱 하나 = 토픽 하나다 (Camunda 커넥터와 같은 결). 화면을 모르는 순수 함수라 vitest가 잰다
 * (`connected-apps.test.ts`). 외부 정의는 `unknown`으로 오므로(C7 `definition`은 열린 객체다) 여기서만
 * 모양을 읽고, 모르는 칸은 버리지 않고 「—」로 둔다.
 */

/** 작업 하나의 일감 집계 (C15 `TopicOperationStatus`) — 화면이 쓰는 칸만. */
export interface OperationCounts {
  operation: string;
  /** 일꾼이 올린 manifest가 말하는 종류 — 있으면 정의의 것보다 이긴다 (일감에 붙는 것과 같은 출처). */
  kind?: string | null;
  waiting?: number;
  working?: number;
  completed_recent?: number;
  failed_recent?: number;
  recent_days?: number;
  last_finished_at?: string | null;
  last_error_code?: string | null;
}

/** 입출력 칸 하나 (`input_schema`·`output_schema`의 `properties`). */
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

/** 정의의 작업 하나를 화면 줄로. */
export interface OperationRow {
  name: string;
  description: string | null;
  /** 묶음 id (C13·C11 작업의 `group`) — 없으면 null. */
  group: string | null;
  /** 일꾼 종류 (`ai`·`api`·`rpa`, ADR-0135). */
  kind: string;
  keywords: string[];
  modes: string[];
  /** 외부 정의만 — 일꾼 앱(C11)에는 그 칸이 없어 null. */
  idempotent: boolean | null;
  request: string | null;
  input: SchemaField[];
  output: SchemaField[];
  counts: OperationCounts | null;
}

/** 머리 줄에 보일 앱의 칸들. 주소·인증은 외부 정의만 있다. */
export interface DefinitionHead {
  baseUrl: string | null;
  auth: string | null;
  operations: OperationRow[];
  /** 앱의 작업 묶음 (C13 `adapter.groups`·C11 `groups`) — 적힌 순서. */
  groups: OperationGroup[];
}

/** 작업 묶음 하나 (C13 `adapter.groups[]`, ADR-0138). */
export interface OperationGroup {
  id: string;
  name: string;
  description: string | null;
}

/** 화면의 묶음 칸 하나 — 묶음 + 그 안 작업 + 머리 줄의 합. */
export interface GroupSection {
  id: string | null;
  name: string;
  description: string | null;
  rows: OperationRow[];
  waiting: number;
  working: number;
  completed: number;
  failed: number;
  /** 자식 가운데 가장 늦게 끝난 때 — 없으면 null. */
  lastFinished: string | null;
}

/** 「기타」 — 묶음이 없는 작업 (화면 문서 CON-18). */
export const OTHER_GROUP = "기타";

const MODE: Record<string, string> = { autonomous: "자율", deterministic: "결정" };

const KIND: Record<string, string> = { ai: "AI", api: "API", rpa: "RPA" };

/** 일꾼 종류 — 「AI」·「API」·「RPA」, 모르는 값은 그대로. */
export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  return KIND[kind] ?? kind;
}

/** 앱의 종류 — 작업들의 `kind`를 겹치지 않게, 정의 순서대로 (CON-18 목록 「종류」). */
export function kindsLabel(kinds: string[]): string {
  const seen = [...new Set(kinds)];
  return seen.length === 0 ? "—" : seen.map(kindLabel).join("·");
}

/** 수행 모드 — 「자율·결정」. 모르는 값은 그대로 보인다. */
export function modesLabel(modes: string[]): string {
  return modes.length === 0 ? "—" : modes.map((one) => MODE[one] ?? one).join("·");
}

/** 토픽 상태 → `status_map` 「서비스 앱」 표기 (C7 `topic_state`). */
const STATUS: Record<string, string> = { ok: "정상", unreachable: "응답 없음", unknown: "확인 전" };
const STATUS_WHY: Record<string, string> = {
  ok: "일꾼이 일감을 가져가고 있습니다",
  unreachable: "일꾼이 90초 넘게 가져가지 않았습니다",
  unknown: "맡은 일꾼이 없습니다",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "확인 전";
  return STATUS[status] ?? status;
}

export function statusWhy(status: string | null | undefined): string | undefined {
  return status ? STATUS_WHY[status] : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string" && one !== "") : [];
}

/** JSON Schema의 `properties`를 칸 목록으로 (적힌 순서 그대로). 타입이 여럿이면 「|」로 잇는다. */
export function schemaFields(schema: unknown): SchemaField[] {
  const found = record(schema);
  const props = record(found?.properties);
  if (!props) return [];
  const required = new Set(Array.isArray(found?.required) ? found.required.filter((one) => typeof one === "string") : []);
  return Object.entries(props).map(([name, raw]) => {
    const one = record(raw);
    const type = one?.type;
    return {
      name,
      type: Array.isArray(type) ? type.join(" | ") : (text(type) ?? "—"),
      required: required.has(name),
      description: text(one?.description),
    };
  });
}

/** 인증 — 「Bearer」/「헤더 <이름>」/「없음」 (C13 §4-1 `auth`, 없으면 키를 받지 않는 앱이다). */
export function authLabel(auth: unknown): string {
  const found = record(auth);
  if (!found) return "없음";
  if (found.type === "bearer") return "Bearer";
  if (found.type === "header") return `헤더 ${text(found.name) ?? ""}`.trim();
  return text(found.type) ?? "없음";
}

/** 정의(C13)를 머리 칸과 작업 줄로 — 작업 순서는 정의 그대로다. 집계가 없으면 `counts`가 null이다. */
export function readDefinition(definition: unknown, counts: OperationCounts[] | null): DefinitionHead {
  const service = record(record(definition)?.service);
  const adapter = record(service?.adapter);
  const byName = new Map((counts ?? []).map((one) => [one.operation, one]));
  const raw = Array.isArray(adapter?.operations) ? adapter.operations : [];
  const operations = raw.flatMap((item): OperationRow[] => {
    const one = record(item);
    const name = text(one?.name);
    if (!one || !name) return [];
    const request = record(one.request);
    const method = text(request?.method);
    const path = text(request?.path);
    return [
      {
        name,
        description: text(one.description),
        group: text(one.group),
        // 종류는 일꾼 manifest(집계 줄)가 먼저다 — 처리기가 외부 정의 안에서 AI 작업을 돌리기도 한다.
        // 없으면 정의의 것, 그것도 없으면 C13 기본 `api`.
        kind: byName.get(name)?.kind ?? text(one.kind) ?? "api",
        keywords: strings(one.keywords),
        // C13 기본값: 외부 확장은 `["autonomous"]`, `idempotent`는 false.
        modes: Array.isArray(one.modes) ? one.modes.filter((m): m is string => typeof m === "string") : ["autonomous"],
        idempotent: one.idempotent === true,
        request: method || path ? `${method ?? ""} ${path ?? ""}`.trim() : null,
        input: schemaFields(one.input_schema),
        output: schemaFields(one.output_schema),
        counts: counts === null ? null : (byName.get(name) ?? { operation: name }),
      },
    ];
  });
  return { baseUrl: text(service?.base_url), auth: authLabel(adapter?.auth), operations, groups: readGroups(adapter?.groups) };
}

function readGroups(value: unknown): OperationGroup[] {
  return (Array.isArray(value) ? value : []).flatMap((item): OperationGroup[] => {
    const one = record(item);
    const id = text(one?.id);
    return id ? [{ id, name: text(one?.name) ?? id, description: text(one?.description) }] : [];
  });
}

/** 일꾼 앱(C7 `ServiceAppResource` — C11 manifest)의 작업 — 외부 정의와 같은 줄 모양으로. */
export function readServiceApp(
  app: { operations?: unknown[]; groups?: unknown[] },
  counts: OperationCounts[] | null,
): DefinitionHead {
  const byName = new Map((counts ?? []).map((one) => [one.operation, one]));
  const operations = (app.operations ?? []).flatMap((item): OperationRow[] => {
    const one = record(item);
    const name = text(one?.name);
    if (!one || !name) return [];
    return [
      {
        name,
        description: text(one.description),
        group: text(one.group),
        kind: byName.get(name)?.kind ?? text(one.kind) ?? "ai", // C11 기본값
        keywords: strings(one.keywords),
        modes: strings(one.modes),
        idempotent: null,
        request: null,
        input: schemaFields(one.input_schema),
        output: schemaFields(one.output_schema),
        counts: counts === null ? null : (byName.get(name) ?? { operation: name }),
      },
    ];
  });
  return { baseUrl: null, auth: null, operations, groups: readGroups(app.groups) };
}

/**
 * 묶음마다 가른다 — `groups` 순서, 안은 정의 순서, 묶음 없는 작업은 맨 뒤 「기타」. 비는 묶음은 빼고,
 * 모르는 묶음 id(E3가 막지만 옛 정의)는 「기타」로 간다. 정의에 묶음이 없으면 null — 한 표로 그린다.
 */
export function groupOperations(rows: OperationRow[], groups: OperationGroup[]): GroupSection[] | null {
  if (groups.length === 0) return null;
  const known = new Set(groups.map((one) => one.id));
  const sections: GroupSection[] = [
    ...groups.map((one) => ({ ...one, rows: rows.filter((row) => row.group === one.id) })),
    { id: null, name: OTHER_GROUP, description: null, rows: rows.filter((row) => !row.group || !known.has(row.group)) },
  ].map((one) => {
    const sum = (pick: (c: OperationCounts) => number | undefined) =>
      one.rows.reduce((total, row) => total + (row.counts ? (pick(row.counts) ?? 0) : 0), 0);
    const finished = one.rows.map((row) => row.counts?.last_finished_at).filter((at): at is string => Boolean(at));
    return {
      ...one,
      waiting: sum((c) => c.waiting),
      working: sum((c) => c.working),
      completed: sum((c) => c.completed_recent),
      failed: sum((c) => c.failed_recent),
      // ISO 시각은 같은 꼴이면 글자 순서가 시간 순서지만, 시간대가 섞일 수 있어 시각으로 비교한다.
      lastFinished: finished.reduce<string | null>(
        (late, at) => (late === null || Date.parse(at) > Date.parse(late) ? at : late),
        null,
      ),
    };
  });
  return sections.filter((one) => one.rows.length > 0);
}

/** 「쓰는 주소」 — 일꾼이 알린 주소가 이기고, 없으면 정의 기본값 (C15 `address`, ADR-0138). */
export interface AddressView {
  url: string | null;
  /** 「정의 기본값」 / 「일꾼 설정」 */
  source: string;
  /** 툴팁 — 정의 기본값·시험 주소. */
  note: string | null;
}

export function addressView(
  definitionUrl: string | null,
  reported: { base_url?: string | null; test_base_url?: string | null } | null | undefined,
): AddressView {
  const url = reported?.base_url ?? null;
  const notes: string[] = [];
  const differs = url !== null && url.replace(/\/+$/, "") !== (definitionUrl ?? "").replace(/\/+$/, "");
  if (differs) notes.push(`정의 기본값: ${definitionUrl ?? "—"}`);
  if (reported?.test_base_url) notes.push(`시험 일감: ${reported.test_base_url}`);
  return {
    url: url ?? definitionUrl,
    source: differs ? "일꾼 설정" : "정의 기본값",
    note: notes.length > 0 ? notes.join("\n") : null,
  };
}

/** 주소를 바꾸는 곳 — 일꾼 설정 이름 (어댑터 일꾼 `ext_env`와 같은 규칙: 대문자, `-`·`.`은 `_`). */
export function addressSetting(extensionId: string): string {
  return `BPM_ADAPTER__EXT__${extensionId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}__BASE_URL`;
}

function matches(needle: string, ...texts: Array<string | null | undefined>): boolean {
  return texts.some((one) => (one ?? "").toLowerCase().includes(needle));
}

/** 「찾기」 — 작업 이름·설명·키워드에 든 글 (대소문자 무시). 빈 글이면 그대로. */
export function filterOperations(rows: OperationRow[], query: string | null | undefined): OperationRow[] {
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => matches(needle, row.name, row.description, ...row.keywords));
}

// ─────────────────────────── 앱 목록 ───────────────────────────

/** 연결 앱 한 줄 — 외부 정의든 일꾼 앱이든 같은 모양 (CON-18 목록). */
export interface ConnectedApp {
  id: string;
  name: string;
  version: string | null;
  /** 「외부 정의」(C13) / 「일꾼 앱」(C11) */
  impl: "external" | "worker";
  kinds: string[];
  appGroup: { id: string; name: string } | null;
  keywords: string[];
  operations: number;
  status: string | null;
  /** 원본 — `console`이면 콘솔(CON-18)에서 고친다 (C7 `source`, ADR-0141). 일꾼 앱은 늘 `consumer`. */
  source: "console" | "consumer";
}

export const IMPL_LABEL: Record<ConnectedApp["impl"], string> = { external: "외부 정의", worker: "일꾼 앱" };
export const IMPL_HINT: Record<ConnectedApp["impl"], string> = {
  external: "외부 정의 — 일꾼이 HTTP로 바깥 앱을 부릅니다",
  worker: "일꾼 앱 — 일꾼이 코드로 처리합니다",
};

function appGroupOf(value: unknown): ConnectedApp["appGroup"] {
  const one = record(value);
  const id = text(one?.id);
  return id ? { id, name: text(one?.name) ?? id } : null;
}

/**
 * C7 확장(외부만)과 서비스 앱을 한 목록으로 — 서비스 앱 목록은 외부 정의가 있는 토픽을 이미 뺐지만(C7),
 * 같은 id가 둘이면 외부 정의 쪽이 이긴다(정의가 더 많이 말한다). 이름 순.
 */
export function connectedApps(
  extensions: Array<{
    id: string;
    tier: string;
    name?: string | null;
    version: string;
    status?: string;
    definition?: unknown;
    source?: string | null;
  }>,
  serviceApps: Array<{
    app_id: string;
    name?: string | null;
    version?: string | null;
    status?: string;
    operations?: unknown[];
    app_group?: unknown;
    keywords?: string[];
  }>,
  /** 토픽 → 작업별 집계 (C15) — 외부 정의 앱의 실제 종류가 여기 있다. 없으면 정의의 것. */
  countsOf: Map<string, OperationCounts[]> = new Map(),
): ConnectedApp[] {
  const out = new Map<string, ConnectedApp>();
  for (const one of serviceApps) {
    const head = readServiceApp(one, []);
    out.set(one.app_id, {
      id: one.app_id,
      name: one.name ?? one.app_id,
      version: one.version ?? null,
      impl: "worker",
      kinds: head.operations.map((op) => op.kind),
      appGroup: appGroupOf(one.app_group),
      keywords: strings(one.keywords),
      operations: head.operations.length,
      status: one.status ?? null,
      source: "consumer",
    });
  }
  for (const one of extensions.filter((ext) => ext.tier === "external")) {
    const head = readDefinition(one.definition, countsOf.get(one.id) ?? []);
    const definition = record(one.definition);
    out.set(one.id, {
      id: one.id,
      name: one.name ?? one.id,
      version: one.version,
      impl: "external",
      kinds: head.operations.map((op) => op.kind),
      appGroup: appGroupOf(definition?.app_group),
      keywords: strings(definition?.keywords),
      operations: head.operations.length,
      status: one.status ?? null,
      source: one.source === "console" ? "console" : "consumer",
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 「찾기」 — 앱 이름·id·키워드. */
export function filterApps(apps: ConnectedApp[], query: string | null | undefined): ConnectedApp[] {
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return apps;
  return apps.filter((one) => matches(needle, one.name, one.id, ...one.keywords));
}

/** 앱 묶음 칸 — 묶음 이름 순, 묶음 없는 앱은 맨 뒤 「기타」. 어느 앱에도 묶음이 없으면 null(한 표). */
export function groupApps(apps: ConnectedApp[]): Array<{ id: string | null; name: string; apps: ConnectedApp[] }> | null {
  if (!apps.some((one) => one.appGroup)) return null;
  const byId = new Map<string, { id: string; name: string; apps: ConnectedApp[] }>();
  const other: ConnectedApp[] = [];
  for (const one of apps) {
    if (!one.appGroup) {
      other.push(one);
      continue;
    }
    const slot = byId.get(one.appGroup.id) ?? { id: one.appGroup.id, name: one.appGroup.name, apps: [] };
    slot.apps.push(one);
    byId.set(one.appGroup.id, slot);
  }
  const sections: Array<{ id: string | null; name: string; apps: ConnectedApp[] }> = [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ko"),
  );
  if (other.length > 0) sections.push({ id: null, name: OTHER_GROUP, apps: other });
  return sections;
}

/** 그 토픽을 맡은 일꾼 이름들 (C15 `ConsumerInfo.topics`). */
export function workersOf(consumers: Array<{ name: string; topics?: string[] }>, topic: string): string[] {
  return consumers.filter((one) => (one.topics ?? []).includes(topic)).map((one) => one.name);
}
