import "server-only";

import { cookies } from "next/headers";
import type { CompanyInfo } from "@bpm/api-types/c16-company-info";
import type { DepartmentInfo } from "@bpm/api-types/c16-department-info";
import type { StaffInfo } from "@bpm/api-types/c16-staff-info";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import type { ApprovalInfo } from "@bpm/api-types/c6-approval-info";
import type { ServerRunnerInfo } from "@bpm/api-types/c12-server-runner-info";
import type { JobInfo } from "@bpm/api-types/c5-job-info";
import type { JobCreateRequest } from "@bpm/api-types/c5-job-create-request";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { DependentInfo } from "@bpm/api-types/c5-dependent-info";
import type { NodeLabel } from "@bpm/api-types/c5-node-label";
import type { CenterKeyInfo } from "@bpm/api-types/c7-center-key-info";
import type { EnrollmentInfo } from "@bpm/api-types/c5-enrollment-info";
import type { EnrollmentDecision } from "@bpm/api-types/c5-enrollment-decision";
import type { ExternalTaskInfo } from "@bpm/api-types/c15-external-task-info";
import type { ConsumerInfo } from "@bpm/api-types/c15-consumer-info";
import type { TopicStatus } from "@bpm/api-types/c15-topic-status";
import type { TopicOperationStatus } from "@bpm/api-types/c15-topic-operation-status";
import type { ExtensionResource } from "@bpm/api-types/c7-extension-resource";
import type { ServiceAppResource } from "@bpm/api-types/c7-service-app-resource";
import type { ExtensionDependent } from "@bpm/api-types/c7-extension-dependent";
import type { ExtensionRevoked } from "@bpm/api-types/c7-extension-revoked";
import type { ExtensionTestResult } from "@bpm/api-types/c7-extension-test-result";
import type { ExtensionVersionInfo } from "@bpm/api-types/c7-extension-version-info";
import type { ConsumerCreated } from "@bpm/api-types/c15-consumer-created";
import type { ScheduleInfo } from "@bpm/api-types/c5-schedule-info";
import type { ErrorBody } from "@bpm/api-types/c5-error-body";
import type { RunListing } from "@bpm/api-types/c3-run-listing";
import type { RunInfo } from "@bpm/api-types/c3-run-info";
import type { RunEventsResponse } from "@bpm/api-types/c3-run-events-response";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import type { WorkspaceCreateRequest } from "@bpm/api-types/c17-workspace-create-request";
import type { TrialInfo } from "@bpm/api-types/c17-test-run-info";
import type { TrialCreateRequest } from "@bpm/api-types/c17-test-run-create-request";
import type { WorkspaceUpdateRequest } from "@bpm/api-types/c17-workspace-update-request";
import type { FileInfo } from "@bpm/api-types/c17-file-info";
import type { DecisionsResponse } from "@bpm/api-types/c17-decisions-response";
import type { DecisionSaveRequest } from "@bpm/api-types/c17-decision-save-request";
import type { DecisionSaveResponse } from "@bpm/api-types/c17-decision-save-response";
import type { AccountInfo } from "@bpm/api-types/c5-account-info";
import type { DeploymentRequest } from "@bpm/api-types/c5-deployment-request";
import type { SessionInfo } from "@bpm/api-types/c5-session-info";
import { COOKIE_NAME, open, type Session } from "./session";
import type { OrgKind } from "./organization";

/**
 * BFF — **브라우저는 Center API를 직접 부르지 않는다** (ADR-0017 §1).
 *
 * 콘솔 서버가 세션 쿠키에서 토큰을 꺼내 들고 부른다. 토큰은 응답에 섞여 나가지 않는다.
 * 타입은 계약 JSON Schema에서 생성한 것만 쓴다 (손으로 쓰지 않는다).
 */

export const CENTER_URL = process.env.BPM_CONSOLE__CENTER_URL ?? "http://localhost:8800";

/** 위 막대에 보일 주소 — 사람이 Studio·서버 실행기에 적는 바깥 주소다. 콘솔이 부르는 주소는 컨테이너 이름일 수 있다. */
export const CENTER_PUBLIC_URL = process.env.BPM_CONSOLE__CENTER_PUBLIC_URL || CENTER_URL;

export class CenterError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody | null,
    message: string,
  ) {
    super(message);
  }
}

export async function session(): Promise<Session | null> {
  const store = await cookies();
  return open(store.get(COOKIE_NAME)?.value);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const found = await session();
  if (!found) throw new CenterError(401, null, "로그인이 필요합니다");
  return send<T>(path, init, found.token);
}

/**
 * Center 한 번. 행위자는 **세션이 정한다** (ADR-0090) — Center가 세션 토큰에서 계정 아이디를
 * 읽으므로 `X-BPM-Actor`를 싣지 않는다.
 */
async function reach(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
  const response = await fetch(`${CENTER_URL}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    // 콘솔은 늘 지금 상태를 보여 준다 (「새로 고침」이 그 뜻이다).
    cache: "no-store",
  }).catch(() => {
    // 「무엇이 + 왜 + 무엇을 하면 되는지」 (스타일 가이드 §5).
    throw new CenterError(0, null, `Center에 닿지 못했습니다 (${CENTER_URL}) — 주소와 포트를 확인하세요`);
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new CenterError(response.status, body, body?.message ?? `Center가 ${response.status}를 돌려줬습니다`);
  }
  return response;
}

async function send<T>(path: string, init: RequestInit | undefined, token: string | null): Promise<T> {
  const response = await reach(path, init, token);
  if (response.status === 204) return undefined as T;
  // JSON이 아닌 답(C5 `diagram`의 BPMN XML)은 글자 그대로 돌려준다.
  if (!(response.headers.get("content-type") ?? "").includes("json")) return (await response.text()) as T;
  return (await response.json()) as T;
}

/** 로그인 (C5 `POST /auth/login`). 세션 토큰은 이 응답에만 실린다 — 받은 쪽이 쿠키에 담는다. */
/**
 * Center가 **열린 모드**인가 (ADR-0142) — 위 막대 배지(CON-00)가 쓴다.
 *
 * 인증 없이 `/healthz`를 읽는다(비밀이 아니다). 닿지 못하면 배지를 띄우지 않는다 — 「Center에 닿지
 * 못했습니다」는 각 화면이 제 자리에서 말한다.
 */
export async function openMode(): Promise<boolean> {
  try {
    const found = await send<{ open_mode?: boolean }>("/healthz", undefined, null);
    return found.open_mode === true;
  } catch {
    return false;
  }
}

export function signIn(username: string, password: string): Promise<SessionInfo> {
  return send<SessionInfo>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }, null);
}

/** 로그아웃 — Center의 세션을 지운다. 닿지 못해도 쿠키는 부르는 쪽이 지운다. */
export function signOut(token: string): Promise<void> {
  return send<void>("/api/v1/auth/logout", { method: "POST" }, token);
}

/** 조직 경로 (C16). */
const ORG_PATH: Record<OrgKind, string> = {
  company: "/api/v1/companies",
  department: "/api/v1/departments",
  staff: "/api/v1/staff",
};

const pkg = (packageId: string, version: string) =>
  `/api/v1/packages/${encodeURIComponent(packageId)}/${encodeURIComponent(version)}`;

/**
 * 작업공간 파일 하나 — **본문과 `revision`을 함께** 준다 (C17: `ETag`가 `revision`이다).
 * 고칠 때 그것을 `If-Match`에 되돌려 보내 **남의 저장을 덮어쓰지 않는다**.
 */
async function workspaceFile(path: string): Promise<{ text: string; revision: string }> {
  const found = await session();
  if (!found) throw new CenterError(401, null, "로그인이 필요합니다");
  const response = await reach(path, undefined, found.token);
  return { text: await response.text(), revision: response.headers.get("etag") ?? "" };
}

const ws = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

/** 파일 경로는 조각마다 감싼다 — `/`는 그대로 두어야 Center가 자리를 읽는다 (C17 경로 규칙). */
const filePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export const center = {
  /**
   * 작업공간 (C17·CON-20). 회사가 정해진 계정은 **제 회사 것만** 본다 — 콘솔이 거르지 않는다 (C16).
   */
  workspaces: (query: { q?: string } = {}) =>
    call<WorkspaceInfo[]>(`/api/v1/workspaces${query.q ? `?q=${encodeURIComponent(query.q)}` : ""}`),
  workspace: (workspaceId: string) => call<WorkspaceInfo>(ws(workspaceId)),
  createWorkspace: (body: WorkspaceCreateRequest) =>
    call<WorkspaceInfo>("/api/v1/workspaces", { method: "POST", body: JSON.stringify(body) }),
  /** 이름·판·설명·업무 자리·진입 정의 (C17 — STU-06이 하던 일). */
  updateWorkspace: (workspaceId: string, body: WorkspaceUpdateRequest) =>
    call<WorkspaceInfo>(ws(workspaceId), { method: "PATCH", body: JSON.stringify(body) }),
  /** 지운다. **배포된 패키지는 그대로다** — 패키지가 원본이고 작업공간은 그것을 짓는 자리다 (C17). */
  deleteWorkspace: (workspaceId: string) => call<void>(ws(workspaceId), { method: "DELETE" }),

  workspaceFiles: (workspaceId: string) => call<FileInfo[]>(`${ws(workspaceId)}/files`),
  readWorkspaceFile: (workspaceId: string, path: string) =>
    workspaceFile(`${ws(workspaceId)}/files/${filePath(path)}`),
  /**
   * 쓰기 — `revision`을 `If-Match`에 싣는다. 다르면 409 `stale`이고 **아무것도 쓰지 않는다** (C17).
   * 새 파일이면 `revision`을 비운다.
   */
  writeWorkspaceFile: (workspaceId: string, path: string, text: string, revision: string) =>
    call<FileInfo>(`${ws(workspaceId)}/files/${filePath(path)}`, {
      method: "PUT",
      body: text,
      headers: {
        "Content-Type": path.endsWith(".json") ? "application/json" : "text/plain; charset=utf-8",
        ...(revision ? { "If-Match": revision } : {}),
      },
    }),
  /**
   * 결정표를 **격자로** 읽고 쓴다 (C17 §결정표, ADR-0148) — 브라우저는 DMN을 해석하지 않는다.
   * 칸 문법이 두 벌이 되면 편집기가 받아 준 칸을 엔진이 거부한다.
   */
  workspaceDecisions: (workspaceId: string, path: string) =>
    call<DecisionsResponse>(`${ws(workspaceId)}/decisions/${filePath(path)}`),
  saveWorkspaceDecision: (workspaceId: string, path: string, body: DecisionSaveRequest, revision: string) =>
    call<DecisionSaveResponse>(`${ws(workspaceId)}/decisions/${filePath(path)}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: revision ? { "If-Match": revision } : {},
    }),
  /**
   * 시험 실행 (C17 §시험 실행) — **돌리는 것은 서버 실행기다**. 여기서는 줄에 세우고 묻는다.
   * 진행은 실행기가 `PUT …/test-runs/{run_id}`로 올리므로 **콘솔은 되묻는다** (미는 길이 없다).
   */
  testRuns: (workspaceId: string) => call<TrialInfo[]>(`${ws(workspaceId)}/test-runs`),
  testRun: (workspaceId: string, runId: string) =>
    call<TrialInfo>(`${ws(workspaceId)}/test-runs/${encodeURIComponent(runId)}`),
  createTestRun: (workspaceId: string, body: TrialCreateRequest) =>
    call<TrialInfo>(`${ws(workspaceId)}/test-runs`, { method: "POST", body: JSON.stringify(body) }),
  /** 「중지」 — **판정하지 않는다** (판정이 「중지」다, C17). */
  stopTestRun: (workspaceId: string, runId: string) =>
    call<TrialInfo>(`${ws(workspaceId)}/test-runs/${encodeURIComponent(runId)}`, { method: "DELETE" }),

  deleteWorkspaceFile: (workspaceId: string, path: string) =>
    call<void>(`${ws(workspaceId)}/files/${filePath(path)}`, { method: "DELETE" }),
  /**
   * `.bpmn` 하나 또는 옛 작업 폴더 zip (C17 — 밖에서 그린 그림이 들어오는 자리).
   * 이름은 헤더로 가는데 **헤더는 ASCII다** (CLAUDE.md §5) — 퍼센트 인코딩해 싣는다.
   */
  importIntoWorkspace: (workspaceId: string, raw: ArrayBuffer, fileName: string) =>
    call<FileInfo[]>(`${ws(workspaceId)}/import`, {
      method: "POST",
      body: raw,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-BPM-File-Name": encodeURIComponent(fileName),
      },
    }),

  /**
   * 서버 실행기 목록 (C12·CON-12). **목록 하나가 상세의 재료까지 들고 온다** — 실행 중·기다리는
   * 실행·준비 상태·확장·최근 배치 결정이 모두 한 줄에 있어 상세가 따로 부를 길이 없다.
   *
   * `queued`는 **Center가 센 것**이다 (실행기가 보내는 값이 아니다 — 대기열은 Center가 가진다).
   */
  serverRunners: () => call<ServerRunnerInfo[]>("/api/v1/server-runners"),
  /** 일시 중지·다시 시작 (C12). 다음 하트비트 응답의 `paused`로 전달된다. */
  pauseRunner: (runnerId: string) =>
    call<unknown>(`/api/v1/server-runners/${encodeURIComponent(runnerId)}/pause`, { method: "POST" }),
  resumeRunner: (runnerId: string) =>
    call<unknown>(`/api/v1/server-runners/${encodeURIComponent(runnerId)}/resume`, { method: "POST" }),
  /** 재시작 (C12, ADR-0117). 다음 하트비트 응답의 `restart`로 전달된다. */
  restartRunner: (runnerId: string) =>
    call<unknown>(`/api/v1/server-runners/${encodeURIComponent(runnerId)}/restart`, { method: "POST" }),
  /** 유실 처리 (C12). **오프라인인 실행기만** — 온라인이면 409 `runner_online`이다. */
  markRunnerLost: (runnerId: string) =>
    call<unknown>(`/api/v1/server-runners/${encodeURIComponent(runnerId)}/mark-lost`, {
      method: "POST",
    }),

  /** 패키지 목록 (C5). `missing_resources`는 Center가 **읽을 때** 세어 준다 (C7). */
  packages: (query: { kind?: string } = {}) =>
    call<PackageInfo[]>(`/api/v1/packages${query.kind ? `?kind=${encodeURIComponent(query.kind)}` : ""}`),

  /** 이 패키지를 쓰는 패키지 (C5·CON-06). Center가 **읽을 때** 센다. */
  dependents: (packageId: string, version: string) =>
    call<DependentInfo[]>(
      `/api/v1/packages/${encodeURIComponent(packageId)}/${encodeURIComponent(version)}/dependents`,
    ),
  /** 정의 안 노드의 이름 (C5 `nodes`, CON-01) — 실행 기록은 노드를 id로만 가리킨다. */
  packageNodes: (packageId: string, version: string) => call<NodeLabel[]>(`${pkg(packageId, version)}/nodes`),
  /** 진입 정의의 BPMN XML 그대로 (C5 `diagram`, CON-01 「다이어그램」 — ADR-0136). */
  packageDiagram: (packageId: string, version: string) => call<string>(`${pkg(packageId, version)}/diagram`),
  /** 삭제 (C5). 배포나 다른 패키지가 참조하면 409 `in_use`다 — 아무것도 지워지지 않는다. */
  deletePackage: (packageId: string, version: string) =>
    call<void>(
      `/api/v1/packages/${encodeURIComponent(packageId)}/${encodeURIComponent(version)}`,
      { method: "DELETE" },
    ),

  /** 그 실행이 올린 일감 (C15, CON-01 「외부 작업」) — 값 없이 자리·상태·일꾼만. */
  externalTasks: (runId: string) =>
    call<ExternalTaskInfo[]>(`/api/v1/external-tasks?run_id=${encodeURIComponent(runId)}`),
  /** 등록된 확장 (C7) — CON-18은 `tier: external`(외부 정의)만 쓴다. */
  extensions: () =>
    call<{ items: ExtensionResource[] }>("/api/v1/resources?type=extension").then((found) => found.items),
  /** 확장 하나 — 외부면 정의와 봉투가 함께 온다 (C7·C13). */
  extension: (extensionId: string) =>
    call<ExtensionResource>(`/api/v1/resources/extensions/${encodeURIComponent(extensionId)}`),
  /** 일꾼이 올린 앱 (C7 — C11 manifest, 외부 정의가 있는 토픽은 C7이 뺀다). CON-18 「일꾼 앱」. */
  // 콘솔이 원본인 HTTP 어댑터 앱 (C7 §콘솔에서 고치는 외부 확장, ADR-0141) — 쓰기는 Center 관리자만.
  createExtension: (definition: Record<string, unknown>) =>
    call<ExtensionResource>("/api/v1/resources/extensions", { method: "POST", body: JSON.stringify({ definition }) }),
  updateExtension: (extensionId: string, definition: Record<string, unknown>, baseVersion: string) =>
    call<ExtensionResource>(`/api/v1/resources/extensions/${encodeURIComponent(extensionId)}`, {
      method: "PUT",
      body: JSON.stringify({ definition, base_version: baseVersion }),
    }),
  revokeExtension: (extensionId: string) =>
    call<ExtensionRevoked>(`/api/v1/resources/extensions/${encodeURIComponent(extensionId)}`, { method: "DELETE" }),
  extensionVersions: (extensionId: string) =>
    call<ExtensionVersionInfo[]>(`/api/v1/resources/extensions/${encodeURIComponent(extensionId)}/versions`),
  extensionDependents: (extensionId: string) =>
    call<ExtensionDependent[]>(`/api/v1/resources/extensions/${encodeURIComponent(extensionId)}/dependents`),
  startTestCall: (extensionId: string, body: { operation: string; input: Record<string, unknown>; wait_s: number }) =>
    call<ExtensionTestResult>(`/api/v1/resources/extensions/${encodeURIComponent(extensionId)}/test-calls`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testCallResult: (extensionId: string, taskId: string, waitS: number) =>
    call<ExtensionTestResult>(
      `/api/v1/resources/extensions/${encodeURIComponent(extensionId)}/test-calls/${encodeURIComponent(taskId)}?wait_s=${waitS}`,
    ),
  serviceApps: () =>
    call<{ items: ServiceAppResource[] }>("/api/v1/resources?type=service_app").then((found) => found.items),
  serviceApp: (appId: string) =>
    call<ServiceAppResource>(`/api/v1/resources/service-apps/${encodeURIComponent(appId)}`),
  /** 토픽 상태 (C15) — 일꾼 수·마지막으로 가져간 때·기다리는 일감. */
  externalTopics: () => call<TopicStatus[]>("/api/v1/external-topics"),
  /** 그 토픽의 작업별 일감 집계 (C15, CON-18). 일감이 없었던 작업은 줄이 없다. */
  topicOperations: (topic: string) =>
    call<TopicOperationStatus[]>(`/api/v1/external-topics/${encodeURIComponent(topic)}/operations`),
  /** 타이머 시작의 일정 (C5 §일정, CON-02 「일정」). */
  schedules: () => call<ScheduleInfo[]>("/api/v1/schedules"),

  /** 결재함 (C6·CON-04). */
  /** 결재함 (C6). `assignee`는 그 이름이 담당자에 있는 것만 (ADR-0080) — 콘솔은 거르기만 한다. */
  approvals: (query: { state?: string; bpm_process_id?: string; host?: string; assignee?: string } = {}) => {
    const search = new URLSearchParams(
      Object.entries(query).filter(([, value]) => Boolean(value)) as [string, string][],
    );
    const suffix = search.size > 0 ? `?${search}` : "";
    return call<ApprovalInfo[]>(`/api/v1/approvals${suffix}`);
  },
  approval: (requestId: string) =>
    call<ApprovalInfo>(`/api/v1/approvals/${encodeURIComponent(requestId)}`),
  /** 답하기. 답한 사람은 **로그인한 계정**이다 (ADR-0090) — 본문에 없다. */
  answerApproval: (requestId: string, answer: Record<string, unknown>) =>
    call<ApprovalInfo>(`/api/v1/approvals/${encodeURIComponent(requestId)}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    }),
  withdrawApproval: (requestId: string) =>
    call<ApprovalInfo>(`/api/v1/approvals/${encodeURIComponent(requestId)}`, { method: "DELETE" }),

  /** 배포 목록 (C5). `runner`를 주면 그 실행기에 걸린 것만 — `*` 배포도 함께 온다. */
  deployments: (query: { runner?: string; active?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (query.runner) search.set("runner", query.runner);
    if (query.active !== undefined) search.set("active", String(query.active));
    const suffix = search.size > 0 ? `?${search}` : "";
    return call<DeploymentInfo[]>(`/api/v1/deployments${suffix}`);
  },
  /** 배포 (C5). Center가 봉투를 지어 서명한다 — 배포 id·해시도 Center가 채운다 (ADR-0090). */
  createDeployment: (body: DeploymentRequest) =>
    call<DeploymentInfo>("/api/v1/deployments", { method: "POST", body: JSON.stringify(body) }),
  /** 배포 철회. **되살릴 수 없다.** */
  revokeDeployment: (deploymentId: string) =>
    call<DeploymentInfo>("/api/v1/deployments", {
      method: "DELETE",
      body: JSON.stringify({ deployment_id: deploymentId }),
    }),

  /** 승인 (C5 `PUT …/signature`). 본문 없음 — Center가 서명한다. */
  approvePackage: (packageId: string, version: string) =>
    call<unknown>(`${pkg(packageId, version)}/signature`, { method: "PUT" }),
  /** 승인 철회. 그 패키지의 배포가 모두 무효가 된다. **되살릴 수 없다.** */
  revokePackage: (packageId: string, version: string) =>
    call<unknown>(`${pkg(packageId, version)}/revoke`, { method: "POST", body: JSON.stringify({}) }),
  /** 지원 종료 — 새 배포만 막는다. 되돌리는 길은 승인이다 (C5). */
  deprecatePackage: (packageId: string, version: string) =>
    call<PackageInfo>(`${pkg(packageId, version)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "deprecated" }),
    }),

  /**
   * 일꾼 (C15 §일꾼 관리·CON-17, ADR-0137). 목록은 콘솔 계정 모두(CON-18도 맡은 일꾼을 찾는다), 바꾸기는 Center 관리자만.
   * **토큰 원문은 `ConsumerCreated`에만** 실린다 — 받은 쪽(서버 액션)이 그 창에 넘기고 남기지 않는다.
   */
  consumers: () => call<ConsumerInfo[]>("/api/v1/consumers"),
  createConsumer: (body: { name: string; topics: string[]; kinds: string[] }) =>
    call<ConsumerCreated>("/api/v1/consumers", { method: "POST", body: JSON.stringify(body) }),
  updateConsumer: (consumerId: string, body: { topics: string[]; kinds: string[] }) =>
    call<ConsumerInfo>(`/api/v1/consumers/${encodeURIComponent(consumerId)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  reissueConsumerToken: (consumerId: string) =>
    call<ConsumerCreated>(`/api/v1/consumers/${encodeURIComponent(consumerId)}/token`, { method: "POST" }),
  deleteConsumer: (consumerId: string) =>
    call<void>(`/api/v1/consumers/${encodeURIComponent(consumerId)}`, { method: "DELETE" }),

  /** 관리자 계정 (C5 §관리자 계정·CON-14). 관리자만. */
  accounts: () => call<AccountInfo[]>("/api/v1/accounts"),
  createAccount: (body: { username: string; password: string; role: string; company?: string | null }) =>
    call<AccountInfo>("/api/v1/accounts", { method: "POST", body: JSON.stringify(body) }),
  updateAccount: (
    username: string,
    body: { role?: string; company?: string | null; disabled?: boolean; password?: string },
  ) =>
    call<AccountInfo>(`/api/v1/accounts/${encodeURIComponent(username)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  /** 자기 비밀번호 — 지금 비밀번호가 맞아야 한다. 바꾸면 그 계정의 세션이 모두 끝난다. */
  changePassword: (current: string, next: string) =>
    call<AccountInfo>("/api/v1/auth/password", {
      method: "PUT",
      body: JSON.stringify({ current_password: current, new_password: next }),
    }),

  /**
   * 작업 지시 (C5·CON-05). `state`는 쉼표로 여럿.
   *
   * `target_type`은 CON-12의 「대기열」이 쓴다 — 서버 대기열은 **아직 어느 실행기에도 묶이지
   * 않아**(C12) `target_id`로는 좁힐 수 없고, 종류로 걸러야 PC 작업이 섞이지 않는다.
   */
  jobs: (
    query: { state?: string; target_type?: string; target_id?: string; limit?: number } = {},
  ) => {
    const search = new URLSearchParams(
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, String(value)]),
    );
    const suffix = search.size > 0 ? `?${search}` : "";
    return call<JobInfo[]>(`/api/v1/jobs${suffix}`);
  },
  job: (jobId: string) => call<JobInfo>(`/api/v1/jobs/${encodeURIComponent(jobId)}`),
  /** 만들기. 요청자는 BFF가 `X-BPM-Actor`로 싣는다 (C5 — 본문에 없다). */
  createJob: (body: JobCreateRequest) =>
    call<JobInfo>("/api/v1/jobs", { method: "POST", body: JSON.stringify(body) }),
  /** 취소. 200이면 끝, 202면 `cancel_requested` — 현장의 다음 하트비트를 기다린다 (C5). */
  cancelJob: (jobId: string) =>
    call<JobInfo>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }),
  /** 패키지 정보 — 매니페스트의 `inputs`로 「새 작업」의 입력 칸을 그린다 (C1). */
  packageInfo: (packageId: string, version: string) =>
    call<PackageInfo>(
      `/api/v1/packages/${encodeURIComponent(packageId)}/${encodeURIComponent(version)}/info`,
    ),

  centerKeys: (query: { type?: string; state?: string } = {}) => {
    const search = new URLSearchParams(
      Object.entries(query).filter(([, value]) => Boolean(value)) as [string, string][],
    );
    const suffix = search.size > 0 ? `?${search}` : "";
    return call<CenterKeyInfo[]>(`/api/v1/center-keys${suffix}`);
  },
  revokeCenterKey: (keyId: string) => call<CenterKeyInfo>(`/api/v1/center-keys/${keyId}`, { method: "DELETE" }),

  unbindCenterKey: (keyId: string) =>
    call<CenterKeyInfo>(`/api/v1/center-keys/${keyId}/unbind`, { method: "POST" }),
  /** 삭제 (C7 `purge`, ADR-0095) — **폐기된 키만**. 아니면 409 `not_revoked`. */
  purgeCenterKey: (keyId: string) => call<void>(`/api/v1/center-keys/${keyId}/purge`, { method: "POST" }),

  /**
   * 등록 요청 (C5 §등록 승인, ADR-0092) — CON-03·CON-12 「승인 대기」, CON-11. 기본은 대기 중인 것만.
   * 사람은 키를 보지 않는다 — 승인 응답에도 원문이 없다.
   */
  enrollments: (type: "server_runner" | "studio") =>
    call<EnrollmentInfo[]>(`/api/v1/enrollments?type=${type}`),
  /** 모든 상태의 등록 요청 — CON-16 「앱 로그」가 이력으로 읽는다 (C5 `state`는 쉼표로 여럿). */
  enrollmentHistory: () =>
    call<EnrollmentInfo[]>("/api/v1/enrollments?state=pending,approved,rejected,expired"),
  /** 승인 — Studio는 **회사를 정해** 들인다 (C16). 서버 실행기는 회사를 보내지 않는다. */
  approveEnrollment: (id: string, name?: string, company?: string) =>
    call<EnrollmentDecision>(`/api/v1/enrollments/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: JSON.stringify({ ...(name ? { name } : {}), ...(company ? { company } : {}) }),
    }),
  /** 조직 (C16) — 회사가 정해진 계정에게는 Center가 제 회사 것만 준다. */
  companies: () => call<CompanyInfo[]>("/api/v1/companies"),
  departments: () => call<DepartmentInfo[]>("/api/v1/departments"),
  staffList: () => call<StaffInfo[]>("/api/v1/staff"),
  /** 하나 읽기 — 그 자리 업무(`work`)와 최근 실행(`recent_runs`)이 찬다 (CON-13 [W]·[R]). */
  orgItem: <T = CompanyInfo | DepartmentInfo | StaffInfo>(kind: OrgKind, id: string) =>
    call<T>(`${ORG_PATH[kind]}/${encodeURIComponent(id)}`),
  /** 만들기 (`POST`) — 같은 id가 있으면 409 `exists`. */
  createOrgItem: (kind: OrgKind, body: Record<string, unknown>) =>
    call<unknown>(ORG_PATH[kind], { method: "POST", body: JSON.stringify(body) }),
  /** 바꾸기 (`PUT`) — **본문 전체**로 바꾼다 (C16). */
  updateOrgItem: (kind: OrgKind, id: string, body: Record<string, unknown>) =>
    call<unknown>(`${ORG_PATH[kind]}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  /** 등록 해제 — 가리키는 것이 있으면 409 `in_use`. 회사에는 없다. */
  removeOrgItem: (kind: "department" | "staff", id: string) =>
    call<void>(`${ORG_PATH[kind]}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  rejectEnrollment: (id: string, reason?: string) =>
    call<EnrollmentInfo>(`/api/v1/enrollments/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),

  runs: (
    query: {
      status?: string;
      bpm_process_id?: string;
      /** 어느 실행기가 보낸 기록인가 (C3 — Center가 보낸 키로 푼다). */
      runner_id?: string;
      limit?: number;
    } = {},
  ) => {
    const search = new URLSearchParams(
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, String(value)]),
    );
    const suffix = search.size > 0 ? `?${search}` : "";
    return call<RunListing>(`/api/v1/runs${suffix}`);
  },
  run: (runId: string) => call<RunInfo>(`/api/v1/runs/${encodeURIComponent(runId)}`),
  runEvents: (runId: string) =>
    call<RunEventsResponse>(`/api/v1/runs/${encodeURIComponent(runId)}/events`),
};
