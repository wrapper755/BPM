"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { center, CenterError, session, signIn, signOut } from "@/lib/center";
import { parseKinds, pickTopics } from "@/lib/consumers";
import {
  appProblems,
  buildApp,
  parseHosts,
  parseInput,
  parseOperation,
  putOperation,
  removeOperation,
  violationsByTab,
  type AppFields,
  type AuthKind,
  type OperationFields,
  type OperationTab,
  type Violation,
} from "@/lib/adapter-editor";
import type { DecisionTableInfo } from "@bpm/api-types/c17-decisions-response";
import type { TrialInfo } from "@bpm/api-types/c17-test-run-info";
import type { ExtensionDependent } from "@bpm/api-types/c7-extension-dependent";
import type { ExtensionTestResult } from "@bpm/api-types/c7-extension-test-result";
import type { ExtensionVersionInfo } from "@bpm/api-types/c7-extension-version-info";
import { fromCaller } from "@/lib/inputs";
import type { OrgKind } from "@/lib/organization";
import { COOKIE_NAME, seal } from "@/lib/session";

/**
 * 쓰기 동작 — 모두 **콘솔 서버에서** 돈다 (Server Action). 브라우저는 토큰을 모른다.
 *
 * 승인·배포·외부 확장 등록도 여기서 한다 — 봉투는 **Center가 서버의 키로 서명한다** (ADR-0090).
 * 「누가」는 로그인한 계정이고 Center가 세션에서 읽는다.
 */

export interface ActionResult {
  error?: string;
}

function message(cause: unknown): string {
  return cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
}

export async function login(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "아이디와 비밀번호를 넣으세요." };

  let made;
  try {
    made = await signIn(username, password);
  } catch (cause) {
    return { error: message(cause) };
  }
  (await cookies()).set(
    COOKIE_NAME,
    seal({
      // 회사 관리자도 **제 회사 안에서는** 관리자다 — 무엇을 다룰 수 있는지는 Center가 회사로 가른다 (C16).
      mode: made.role === "admin" || made.role === "company_admin" ? "admin" : "read",
      token: made.token,
      actor: made.username,
      company: made.company ?? null,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Center 세션과 **같이 끝난다** — 끝난 세션을 들고 있으면 화면마다 「로그인이 끝났습니다」가 뜬다.
      expires: new Date(made.expires_at),
    },
  );
  // 첫 화면 — 메뉴 맨 위 「운영 현황 › 프로세스」 (ADR-0121).
  redirect("/bots");
}

export async function logout(): Promise<void> {
  const found = await session();
  if (found) await signOut(found.token).catch(() => undefined); // 닿지 못해도 쿠키는 지운다
  (await cookies()).delete(COOKIE_NAME);
  redirect("/login");
}

/**
 * 서버 실행기 일시 중지·다시 시작 (CON-12, C12).
 *
 * 멈춰도 **도는 실행은 끝까지 간다** — 막는 것은 새 작업뿐이다. 그래서 「일시 중지」에만 확인
 * 창이 붙고 「다시 시작」은 바로 된다 (U9 — 되돌릴 수 있고 해가 없는 쪽은 묻지 않는다).
 */
export async function setRunnerPaused(runnerId: string, paused: boolean): Promise<ActionResult> {
  try {
    await (paused ? center.pauseRunner(runnerId) : center.resumeRunner(runnerId));
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/server-runners", "layout");
  revalidatePath("/bots");
  return {};
}

/**
 * 서버 실행기 재시작 (CON-02 「서버」 탭, C12, ADR-0117).
 *
 * 실행기는 새 작업을 받지 않고 도는 실행이 끝나면 **스스로 끝난다** — 다시 띄우는 것은 compose다.
 */
export async function restartRunner(runnerId: string): Promise<ActionResult> {
  try {
    await center.restartRunner(runnerId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/server-runners", "layout");
  revalidatePath("/bots");
  return {};
}

/**
 * 유실 처리 (CON-12, C12 `mark-lost`) — **되돌릴 수 없다.**
 *
 * 그 실행기의 실행을 `failed`(`runner_lost`)로 닫고 결재를 회수한다 (C6 `host_lost`).
 * **온라인인 실행기는 Center가 409 `runner_online`으로 막는다** — 화면도 단추를 끄지만,
 * 그사이 돌아온 실행기를 닫지 않는 것은 Center가 지킨다 (판정이 두 곳에 있으면 갈라진다).
 */
export async function markRunnerLost(runnerId: string): Promise<ActionResult> {
  try {
    await center.markRunnerLost(runnerId);
  } catch (cause) {
    return { error: message(cause) };
  }
  // 결재함도 바뀐다 — 회수된 결재가 그 화면에 남아 보이면 안 된다 (C6 `host_lost`).
  revalidatePath("/server-runners", "layout");
  revalidatePath("/bots");
  revalidatePath("/approvals", "layout");
  revalidatePath("/runs", "layout");
  return {};
}

/**
 * 결재 답하기 (CON-04). **일반 `<form>`이 부른다** — JS 없이도 답할 수 있다.
 *
 * 폼 칸의 타입은 **Center에 저장된 것**을 다시 읽어 맞춘다 (브라우저가 보낸 글자를 믿고
 * 타입을 정하지 않는다). 틀린 답은 Center가 칸마다 돌려주고, 그 자리로 되돌아가 보인다.
 */
export async function answerApproval(form: FormData): Promise<void> {
  const requestId = String(form.get("request_id") ?? "");
  // 타입 라우트는 질의 문자열이 붙은 주소를 리터럴로 요구한다 — 한 자리에서 만든다.
  const back = (query: string): Route =>
    `/approvals/${encodeURIComponent(requestId)}?${query}` as Route;

  let answer: Record<string, unknown>;
  try {
    const found = await center.approval(requestId);
    answer = readAnswer(found.form?.fields ?? [], form);
  } catch (cause) {
    redirect(back(`error=${encodeURIComponent(message(cause))}`));
  }

  try {
    await center.answerApproval(requestId, answer);
  } catch (cause) {
    // 칸마다 오류를 그 자리에 보이려고 칸 이름을 함께 넘긴다 (C6 `detail.fields`).
    const fields =
      cause instanceof CenterError && Array.isArray(cause.body?.detail?.fields)
        ? (cause.body.detail.fields as string[]).join(",")
        : "";
    redirect(
      back(`error=${encodeURIComponent(message(cause))}&fields=${encodeURIComponent(fields)}`),
    );
  }
  revalidatePath("/approvals", "layout");
  redirect(back("answered=1"));
}

/** FormData를 폼 칸의 **타입대로** 읽는다. 폼이 없으면 「승인 / 반려」다 (C6). */
function readAnswer(
  fields: Array<{ key: string; type: string }>,
  form: FormData,
): Record<string, unknown> {
  if (fields.length === 0) {
    const decision = String(form.get("decision") ?? "");
    const comment = String(form.get("comment") ?? "").trim();
    return comment ? { decision, comment } : { decision };
  }
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = form.get(field.key);
    if (field.type === "bool") {
      // 체크 안 한 칸은 **`false`**다 (빠진 것이 아니다 — 필수 칸이 통과해야 한다).
      out[field.key] = raw === "on" || raw === "true";
      continue;
    }
    const text = String(raw ?? "").trim();
    if (text === "") continue; // 비운 칸은 보내지 않는다 — 필수면 Center가 잡는다
    out[field.key] = field.type === "number" ? Number(text) : text;
  }
  return out;
}

export async function withdrawApproval(requestId: string): Promise<ActionResult> {
  try {
    await center.withdrawApproval(requestId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/approvals", "layout");
  return {};
}

/**
 * 작업 지시 만들기 (CON-05 「새 작업」). **일반 `<form>`이 부른다** — JS 없이도 만든다.
 *
 * 입력 칸의 타입은 **Center에 올라간 매니페스트**(C1 `inputs`)를 다시 읽어 맞춘다 (브라우저가
 * 보낸 글자로 타입을 정하지 않는다). 매니페스트에 없는 입력은 「이름 = 값」 줄로 받는다.
 */
export async function createJob(form: FormData): Promise<void> {
  const bot = String(form.get("bot") ?? "");
  const version = String(form.get("version") ?? "");
  const picked = `bot=${encodeURIComponent(bot)}&version=${encodeURIComponent(version)}`;
  const back = (query: string): Route => `/jobs/new?${picked}&${query}` as Route;

  let inputs: Record<string, unknown>;
  try {
    // 입력 칸은 **그 대상에 배포된 버전**의 매니페스트로 그렸다 (`version`을 비워 보내도).
    const shown = String(form.get("inputs_from") ?? "") || version;
    const declared = shown ? fromCaller((await center.packageInfo(bot, shown)).manifest?.inputs ?? []) : [];
    inputs = readInputs(declared, form);
  } catch (cause) {
    redirect(back(`error=${encodeURIComponent(message(cause))}`));
  }

  const expires = String(form.get("expires_at") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  let made: string;
  try {
    const job = await center.createJob({
      bpm_process_id: bot,
      // 실행기를 고르지 않는다 — Center가 빈자리로 보낸다 (C5 `JobTarget`).
      target: { type: "server_runner", id: "*" },
      inputs,
      // 비우면 그 대상에 배포된 버전으로 Center가 채운다 (C5).
      version: version || null,
      // `datetime-local`은 시간대가 없다 — 콘솔 서버의 시간대로 읽어 ISO로 보낸다.
      expires_at: expires ? new Date(expires).toISOString() : null,
      note: note || null,
    });
    made = job.job_id;
  } catch (cause) {
    redirect(back(`error=${encodeURIComponent(message(cause))}`));
  }
  revalidatePath("/jobs", "layout");
  // 서버 작업은 CON-12의 「대기열」에도 보인다.
  revalidatePath("/server-runners", "layout");
  redirect(`/jobs/${encodeURIComponent(made)}?created=1` as Route);
}

/** 입력을 매니페스트의 **타입대로** 읽는다. 「그 밖의 입력」은 `이름 = 값` 줄 (글자 그대로). */
function readInputs(
  declared: Array<{ name: string; type: string }>,
  form: FormData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const one of declared) {
    const raw = form.get(`input:${one.name}`);
    if (one.type === "bool") {
      if (raw === "true" || raw === "false") out[one.name] = raw === "true";
      continue; // 「(주지 않음)」 — 빠진 것이다. 필수면 실행하는 쪽이 막는다
    }
    const text = String(raw ?? "").trim();
    if (text === "") continue;
    if (one.type === "int" || one.type === "number") {
      const value = Number(text);
      if (Number.isNaN(value)) throw new CenterError(422, null, `입력 ${one.name}은 수여야 합니다`);
      out[one.name] = value;
    } else if (one.type === "list" || one.type === "dict") {
      try {
        out[one.name] = JSON.parse(text);
      } catch {
        throw new CenterError(422, null, `입력 ${one.name}은 JSON이어야 합니다 (${one.type})`);
      }
    } else {
      out[one.name] = text;
    }
  }
  for (const line of String(form.get("extra") ?? "").split("\n")) {
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    if (name && !(name in out)) out[name] = line.slice(at + 1).trim();
  }
  return out;
}

/** 작업 취소 (CON-05). 202면 **아직 끝나지 않았다** — 화면이 「취소 요청함」으로 보인다. */
export async function cancelJob(jobId: string): Promise<ActionResult> {
  try {
    await center.cancelJob(jobId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/jobs", "layout");
  // 서버 작업은 CON-12의 「대기열」에도 같은 줄로 보인다 — 한쪽만 새로 그리면 취소한 작업이
  // 다른 화면에 남는다.
  revalidatePath("/server-runners", "layout");
  revalidatePath("/bots");
  return {};
}

/**
 * 패키지 삭제 (CON-06 「삭제...」). **되돌릴 수 없다** — 확인 창을 거쳐서만 온다.
 *
 * 409 `in_use`면 **아무것도 지워지지 않았다** — 막은 배포·패키지를 그대로 보여 준다 (C5).
 * 성공하면 그 상세 주소가 404가 되므로 목록으로 돌아간다.
 */
export async function deletePackage(packageId: string, version: string): Promise<ActionResult> {
  try {
    await center.deletePackage(packageId, version);
  } catch (cause) {
    if (cause instanceof CenterError && cause.status === 409) {
      const detail = cause.body?.detail ?? {};
      const said = [
        ...(Array.isArray(detail.deployments) ? (detail.deployments as string[]) : []),
        ...(Array.isArray(detail.dependents) ? (detail.dependents as string[]) : []),
      ].join(", ");
      return { error: said ? `${cause.message} — ${said}` : cause.message };
    }
    return { error: message(cause) };
  }
  revalidatePath("/packages", "layout");
  // CON-02도 같은 패키지 표를 읽는다 (BPM 프로세스·버전별 준비도) — 지운 줄이 그대로 남으면 안 된다.
  revalidatePath("/bots", "layout");
  return {};
}

/** 키 동작은 그 키가 가리키는 화면에 있다 (ADR-0124) — 그 화면들을 다시 그린다. */
function revalidateKeys() {
  revalidatePath("/server-runners", "layout");
}

export async function revokeCenterKey(keyId: string): Promise<ActionResult> {
  try {
    await center.revokeCenterKey(keyId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidateKeys();
  return {};
}

/**
 * 등록 요청 승인·거절 (CON-03·CON-12 「승인 대기」, C5 §등록 승인). 키는 Center가 만들어
 * 요청의 공개키로 봉해 둔다 — 여기서도 원문은 지나가지 않는다.
 */
export async function decideEnrollment(
  enrollmentId: string,
  decision: "approve" | "reject",
  text: string,
  company?: string,
): Promise<ActionResult> {
  try {
    if (decision === "approve") await center.approveEnrollment(enrollmentId, text.trim() || undefined, company);
    else await center.rejectEnrollment(enrollmentId, text.trim() || undefined);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/server-runners", "layout");
  revalidatePath("/bots");
  return {};
}

/** 키 「삭제...」 — 폐기된 키의 행을 지운다 (C7 `purge`, ADR-0095). */
export async function deleteCenterKey(keyId: string): Promise<ActionResult> {
  try {
    await center.purgeCenterKey(keyId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidateKeys();
  return {};
}

export async function unbindCenterKey(keyId: string): Promise<ActionResult> {
  try {
    await center.unbindCenterKey(keyId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidateKeys();
  return {};
}

// ─────────────────── 승인·배포 (ADR-0090 — Center가 서명한다) ───────────────────

/** 패키지 상태를 바꾸면 그것을 읽는 화면 셋을 함께 새로 그린다 (CON-02·CON-06·배포). */
function packagesChanged(): void {
  revalidatePath("/bots", "layout");
  revalidatePath("/packages", "layout");
  revalidatePath("/deployments", "layout");
}

/** 승인 (CON-02·CON-06). 지원 종료된 것을 다시 승인하면 새 배포가 다시 열린다 (C5). */
export async function approvePackage(packageId: string, version: string): Promise<ActionResult> {
  try {
    await center.approvePackage(packageId, version);
  } catch (cause) {
    return { error: message(cause) };
  }
  packagesChanged();
  return {};
}

/** 승인 철회 — 그 판의 배포가 **모두** 무효가 된다. 되살릴 수 없다. */
export async function revokePackage(packageId: string, version: string): Promise<ActionResult> {
  try {
    await center.revokePackage(packageId, version);
  } catch (cause) {
    return { error: message(cause) };
  }
  packagesChanged();
  return {};
}

/** 지원 종료 — 새 배포만 막는다. 이미 배포된 것은 그대로 돈다. */
export async function deprecatePackage(packageId: string, version: string): Promise<ActionResult> {
  try {
    await center.deprecatePackage(packageId, version);
  } catch (cause) {
    return { error: message(cause) };
  }
  packagesChanged();
  return {};
}

/**
 * 새 배포 (CON-15). **일반 `<form>`이 부른다.** PC는 여럿을 고를 수 있고 **PC마다 배포 하나**다
 * (ADR-0046 — PC 배포에 전체 대상은 없다). 하나라도 거부되면 그 까닭을 보이고, 이미 된 것은
 * 목록에 남는다.
 */
export async function createDeployment(form: FormData): Promise<void> {
  const bot = String(form.get("bot") ?? "");
  const [botId = "", version = ""] = bot.split("@");
  const back = (query: string): Route => `/deployments/new?${query}` as Route;
  const keep = `bot=${encodeURIComponent(bot)}`;
  const fail = (said: string): never => redirect(back(`${keep}&error=${encodeURIComponent(said)}`));

  const when = (name: string): string | undefined => {
    const raw = String(form.get(name) ?? "").trim();
    // `datetime-local`은 지역 시각이라 그대로 두면 Center가 시간대를 모른다 — 서버의 시각으로 읽는다.
    return raw ? new Date(raw).toISOString() : undefined;
  };
  const common = {
    bpm_process_id: botId,
    version,
    not_before: when("not_before"),
    expires_at: when("expires_at"),
  };

  if (!botId || !version) fail("배포할 프로세스와 버전을 고르세요.");
  const runner = String(form.get("runner") ?? "").trim();
  const targets: Array<{ type: string; id: string }> = [{ type: "server_runner", id: runner || "*" }];
  const raw = String(form.get("max_concurrency") ?? "").trim();
  const limit = raw ? Number(raw) : undefined;
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1)) fail("동시 실행 상한은 1 이상의 정수입니다.");

  const done: string[] = [];
  for (const target of targets) {
    try {
      const made = await center.createDeployment({ ...common, target, max_concurrency: limit });
      done.push(made.deployment_id);
    } catch (cause) {
      const said = done.length > 0 ? `${message(cause)} (먼저 만든 배포 ${done.length}건은 남았습니다)` : message(cause);
      revalidatePath("/deployments", "layout");
      fail(said);
    }
  }
  revalidatePath("/deployments", "layout");
  revalidatePath("/bots", "layout");
  redirect(`/deployments?created=${done.length}` as Route);
}

/** 배포 철회 — 확인 창을 거쳐서만 온다. **되살릴 수 없다.** */
export async function revokeDeployment(deploymentId: string): Promise<ActionResult> {
  try {
    await center.revokeDeployment(deploymentId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/deployments", "layout");
  revalidatePath("/bots", "layout");
  return {};
}

// ─────────────────── 일꾼 (CON-17, ADR-0137) ───────────────────

/** 만들기·토큰 새로 발급의 답 — `token`은 **그 창에만** 보이고 콘솔은 어디에도 남기지 않는다. */
export interface TokenResult extends ActionResult {
  token?: string;
  name?: string;
}

export async function createConsumer(_previous: TokenResult, form: FormData): Promise<TokenResult> {
  const name = String(form.get("name") ?? "").trim();
  const topics = pickTopics(form.getAll("topics"), String(form.get("topics_text") ?? ""));
  const kinds = parseKinds(form.getAll("kinds"));
  if (!name) return { error: "이름을 넣으세요." };
  if (topics.length === 0) return { error: "맡을 연결 앱을 고르거나 앱 id를 하나 이상 적으세요." };
  if (kinds.length === 0) return { error: "종류를 하나 이상 고르세요." };
  try {
    const made = await center.createConsumer({ name, topics, kinds });
    revalidatePath("/consumers");
    return { token: made.token, name: made.name };
  } catch (cause) {
    return { error: message(cause) };
  }
}

export async function updateConsumer(consumerId: string, form: FormData): Promise<ActionResult> {
  const topics = pickTopics(form.getAll("topics"), String(form.get("topics_text") ?? ""));
  const kinds = parseKinds(form.getAll("kinds"));
  if (kinds.length === 0) return { error: "종류를 하나 이상 고르세요." };
  if (topics.length === 0) return { error: "맡을 연결 앱을 고르거나 앱 id를 하나 이상 적으세요." };
  try {
    await center.updateConsumer(consumerId, { topics, kinds });
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/consumers");
  return {};
}

export async function reissueConsumerToken(consumerId: string): Promise<TokenResult> {
  try {
    const made = await center.reissueConsumerToken(consumerId);
    revalidatePath("/consumers");
    return { token: made.token, name: made.name };
  } catch (cause) {
    return { error: message(cause) };
  }
}

export async function deleteConsumer(consumerId: string): Promise<ActionResult> {
  try {
    await center.deleteConsumer(consumerId);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/consumers");
  return {};
}

// ─────────────────── 연결 앱 — 콘솔이 원본인 HTTP 어댑터 앱 (CON-18, ADR-0141) ───────────────────

const appHref = (id: string) => `/connected-apps/${encodeURIComponent(id)}` as Route;

function appFieldsFrom(form: FormData): AppFields {
  const auth = String(form.get("auth") ?? "none");
  return {
    id: String(form.get("id") ?? "").trim(),
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    appGroup: String(form.get("app_group") ?? ""),
    baseUrl: String(form.get("base_url") ?? "").trim(),
    testBaseUrl: String(form.get("test_base_url") ?? "").trim(),
    extraHosts: parseHosts(String(form.get("extra_hosts") ?? "")),
    auth: (["none", "bearer", "header"].includes(auth) ? auth : "none") as AuthKind,
    authHeader: String(form.get("auth_header") ?? ""),
  };
}

/** Center가 거절한 까닭 — 판이 엇갈렸으면 그 판을, 검사에 걸렸으면 사유 줄을 붙인다. */
function appMessage(cause: unknown): string {
  if (cause instanceof CenterError && cause.body?.code === "version_conflict") {
    const now = (cause.body.detail as { current_version?: string } | undefined)?.current_version;
    return `그 사이 다른 사람이 ${now ?? "새"} 판으로 고쳤습니다 — 쪽을 새로 고친 뒤 다시 고치세요.`;
  }
  const violations = violationsOf(cause);
  if (violations.length > 1) return [message(cause), ...violations.slice(1).map((one) => one.message)].join("\n");
  return message(cause);
}

function violationsOf(cause: unknown): Violation[] {
  const found = cause instanceof CenterError ? (cause.body?.detail as { violations?: unknown } | undefined)?.violations : null;
  return Array.isArray(found) ? (found as Violation[]) : [];
}

/**
 * 「맡을 일꾼」 — 고른 일꾼의 토픽에 앱 id를 더하고, 고르지 않은 일꾼에서는 뺀다(CON-17과 같은 요청). 토픽이 그
 * 하나뿐인 일꾼에서는 빼지 못한다(Center가 빈 토픽을 받지 않는다) — 그 까닭을 돌려준다.
 */
async function assignWorkers(appId: string, chosen: Set<string>): Promise<string[]> {
  const failures: string[] = [];
  for (const one of await center.consumers()) {
    const topics = one.topics ?? [];
    const has = topics.includes(appId);
    if (has === chosen.has(one.consumer_id)) continue;
    const next = has ? topics.filter((topic) => topic !== appId) : [...topics, appId];
    if (next.length === 0) {
      failures.push(`${one.name}: 맡은 앱이 이것뿐이라 뺄 수 없습니다 — 「일꾼」에서 지우세요`);
      continue;
    }
    try {
      await center.updateConsumer(one.consumer_id, { topics: next, kinds: one.kinds ?? [] });
    } catch (cause) {
      failures.push(`${one.name}: ${message(cause)}`);
    }
  }
  return failures;
}

export async function createConnectedApp(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const fields = appFieldsFrom(form);
  const problems = appProblems(fields, { creating: true });
  if (problems.length) return { error: problems.join("\n") };
  const found = await session();
  let made;
  try {
    made = await center.createExtension(buildApp(fields, { publisher: found?.actor ?? "Center 콘솔" }));
  } catch (cause) {
    return { error: appMessage(cause) };
  }
  const failures = await assignWorkers(made.id, new Set(form.getAll("consumers").map(String)));
  revalidatePath("/connected-apps");
  revalidatePath("/consumers");
  const notice = failures.length ? `?assign_error=${encodeURIComponent(failures.join("\n"))}` : "";
  redirect(`${appHref(made.id)}${notice}` as Route);
}

export async function updateConnectedApp(id: string, baseVersion: string, form: FormData): Promise<ActionResult> {
  const fields = appFieldsFrom(form);
  const problems = appProblems(fields, { creating: false });
  if (problems.length) return { error: problems.join("\n") };
  try {
    const now = await center.extension(id);
    await center.updateExtension(id, buildApp(fields, { previous: now.definition, publisher: "" }), baseVersion);
  } catch (cause) {
    return { error: appMessage(cause) };
  }
  const failures = await assignWorkers(id, new Set(form.getAll("consumers").map(String)));
  revalidatePath("/connected-apps", "layout");
  revalidatePath("/consumers");
  return failures.length ? { error: `저장했습니다. 다만 일꾼을 바꾸지 못했습니다:\n${failures.join("\n")}` } : {};
}

export interface OperationResult extends ActionResult {
  /** 탭(`input`·`output`·`request`·`response`) 또는 `form` → 사유. */
  errors?: Partial<Record<OperationTab | "form", string>>;
}

/** 작업 하나 저장 = 새 판 (ADR-0141). `replacing`은 고치는 작업의 옛 이름, 새 작업이면 null. */
export async function saveOperation(
  id: string,
  baseVersion: string,
  replacing: string | null,
  fields: OperationFields,
): Promise<OperationResult> {
  let now;
  try {
    now = await center.extension(id);
  } catch (cause) {
    return { error: message(cause) };
  }
  const previous = replacing === null ? undefined : (now.definition as { service?: { adapter?: { operations?: Array<{ name?: string }> } } })
    ?.service?.adapter?.operations?.find((one) => one.name === replacing);
  const parsed = parseOperation(fields, previous);
  if (!parsed.operation) return { errors: parsed.errors };
  const put = putOperation(now.definition, parsed.operation, replacing);
  if (put.error) return { errors: { form: put.error } };
  try {
    await center.updateExtension(id, put.definition, baseVersion);
  } catch (cause) {
    const violations = violationsOf(cause);
    if (violations.length === 0) return { error: appMessage(cause) };
    const operations = (put.definition as { service?: { adapter?: { operations?: Array<{ name?: string }> } } }).service?.adapter
      ?.operations ?? [];
    return { errors: violationsByTab(violations, operations.findIndex((one) => one.name === parsed.operation?.name)) };
  }
  revalidatePath("/connected-apps", "layout");
  return {};
}

export async function deleteOperation(id: string, baseVersion: string, name: string): Promise<ActionResult> {
  try {
    const now = await center.extension(id);
    await center.updateExtension(id, removeOperation(now.definition, name), baseVersion);
  } catch (cause) {
    return { error: appMessage(cause) };
  }
  revalidatePath("/connected-apps", "layout");
  return {};
}

export async function revokeConnectedApp(id: string): Promise<ActionResult> {
  try {
    await center.revokeExtension(id);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/connected-apps", "layout");
  redirect("/connected-apps");
}

/** 저장·내리기 확인 창이 열릴 때 읽는다 — 그 앱을 쓰는 살아 있는 배포 (C7 `dependents`). */
export async function loadDependents(id: string): Promise<{ items?: ExtensionDependent[]; error?: string }> {
  try {
    return { items: await center.extensionDependents(id) };
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 「판 기록」 (C7 `versions`). */
export async function loadVersions(id: string): Promise<{ items?: ExtensionVersionInfo[]; error?: string }> {
  try {
    return { items: await center.extensionVersions(id) };
  } catch (cause) {
    return { error: message(cause) };
  }
}

export interface TestCallResult extends ActionResult {
  result?: ExtensionTestResult;
}

/** 시험 호출 — 저장한 판으로 (Center가 `origin: test` 일감을 올리고 맡은 일꾼이 시험 주소로 부른다). */
export async function startTestCall(id: string, operation: string, inputText: string): Promise<TestCallResult> {
  const { input, error } = parseInput(inputText);
  if (!input) return { error };
  try {
    return { result: await center.startTestCall(id, { operation, input, wait_s: 20 }) };
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 아직 `pending`이면 다시 묻는다 (답을 읽으면 Center가 값을 지운다). */
export async function pollTestCall(id: string, taskId: string): Promise<TestCallResult> {
  try {
    return { result: await center.testCallResult(id, taskId, 20) };
  } catch (cause) {
    return { error: message(cause) };
  }
}

// ─────────────────── 관리자 계정 (CON-14) ───────────────────

export async function createAccount(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await center.createAccount({
      username: String(form.get("username") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      role: String(form.get("role") ?? "admin"),
      // 회사 관리자는 회사가 꼭 있고 Center 관리자는 없다 — 맞는지는 Center가 본다 (C16).
      company: String(form.get("company") ?? "") || null,
    });
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/accounts");
  return {};
}

/** 역할 바꾸기·멈추기·다시 쓰기·비밀번호 새로 정하기 — 한 길이다 (C5 `PUT /accounts/{id}`). */
export async function updateAccount(
  username: string,
  change: { role?: string; disabled?: boolean; password?: string },
): Promise<ActionResult> {
  try {
    await center.updateAccount(username, change);
  } catch (cause) {
    return { error: message(cause) };
  }
  // 자기 계정을 바꾸면 Center가 그 세션을 지웠다 — 다시 로그인해야 한다.
  const found = await session();
  if (found?.actor === username) {
    (await cookies()).delete(COOKIE_NAME);
    redirect("/login");
  }
  revalidatePath("/accounts");
  return {};
}

/** 자기 비밀번호 바꾸기. 바꾸면 세션이 모두 끝나므로 다시 로그인한다. */
export async function changeOwnPassword(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const next = String(form.get("new_password") ?? "");
  if (next !== String(form.get("confirm_password") ?? "")) return { error: "새 비밀번호 두 칸이 다릅니다." };
  try {
    await center.changePassword(String(form.get("current_password") ?? ""), next);
  } catch (cause) {
    return { error: message(cause) };
  }
  (await cookies()).delete(COOKIE_NAME);
  redirect("/login?changed=1" as Route);
}

// ─────────────────── 조직 (CON-13) ───────────────────

function orgHref(kind: OrgKind, id: string): Route {
  return `/organization?node=${encodeURIComponent(`${kind}:${id}`)}` as Route;
}

/**
 * 「새 회사...」·「새 부서...」·「새 직원...」 — 만들면 **그 자리를 고른다**. id 규칙·회사 안의 부서인지는
 * Center가 본다 (한 자리에서만 판정한다).
 */
export async function createOrgItem(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const kind = String(form.get("kind") ?? "") as OrgKind;
  const id = String(form.get("id") ?? "").trim();
  const body: Record<string, unknown> = { id, name: String(form.get("name") ?? "").trim() };
  if (kind !== "company") body.company = String(form.get("company") ?? "");
  if (kind === "staff") body.department = String(form.get("department") ?? "") || null;
  try {
    await center.createOrgItem(kind, body);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/organization");
  redirect(orgHref(kind, id));
}

/**
 * 멈추기·다시 쓰기·이름 바꾸기·부서 옮기기 — 한 길이다 (C16 `PUT`은 **본문 전체**). 부르는 쪽이 지금 값에
 * 바꿀 칸만 얹어 넘긴다.
 */
export async function updateOrgItem(
  kind: OrgKind,
  id: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    await center.updateOrgItem(kind, id, body);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/organization");
  return {};
}

/** 등록 해제 — 되면 그 회사를 고른다. 가리키는 것이 있으면 Center가 409 `in_use`로 막는다. */
export async function removeOrgItem(kind: "department" | "staff", id: string, company: string): Promise<ActionResult> {
  try {
    await center.removeOrgItem(kind, id);
  } catch (cause) {
    return { error: message(cause) };
  }
  revalidatePath("/organization");
  redirect(orgHref("company", company));
}

// ─────────────────────────── 작업공간 (C17·CON-20) ───────────────────────────

/** 저장의 답 — 새 `revision`을 돌려줘야 **다음 저장이 또 `If-Match`를 싣는다** (C17). */
export interface SaveResult {
  revision?: string;
  error?: string;
  /** 남이 먼저 저장했다 (409 `stale`) — 화면이 합치지 않고 묻는다. */
  stale?: boolean;
}

/**
 * 새 작업공간 (C17). 파일을 함께 주면 만든 뒤 **바로 가져온다** — 「파일에서 가져오기」가
 * 빈 작업공간을 남기고 실패하지 않게 한 걸음으로 묶는다.
 */
export async function createWorkspace(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const id = String(form.get("id") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const version = String(form.get("version") ?? "").trim() || "0.1.0";
  const description = String(form.get("description") ?? "").trim();
  if (!id) return { error: "id를 넣으세요." };
  if (!name) return { error: "이름을 넣으세요." };
  const file = form.get("file");
  const bringing = file instanceof File && file.size > 0 ? file : null;
  try {
    // `schema`는 이 계약의 번호다 (C17 schema 1) — 모델이 요구한다.
    await center.createWorkspace({ schema: 1, id, name, version, ...(description ? { description } : {}) });
    if (bringing) {
      await center.importIntoWorkspace(id, await bringing.arrayBuffer(), bringing.name);
    }
    revalidatePath("/workspaces");
    return {};
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 파일 저장 (C17 `PUT …/files/{path}`). `revision`이 낡으면 **아무것도 쓰이지 않는다**. */
export async function saveWorkspaceFile(
  workspaceId: string,
  path: string,
  revision: string,
  text: string,
): Promise<SaveResult> {
  try {
    const made = await center.writeWorkspaceFile(workspaceId, path, text, revision);
    return { revision: made.revision };
  } catch (cause) {
    const stale = cause instanceof CenterError && cause.status === 409;
    return { error: message(cause), ...(stale ? { stale: true } : {}) };
  }
}

/** 작업공간 지우기 — **배포된 패키지는 그대로다** (C17). */
export async function deleteWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    await center.deleteWorkspace(workspaceId);
    revalidatePath("/workspaces");
    return {};
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 파일 본문과 `revision` — 편집기가 고를 때마다 부른다 (C17). */
export async function loadWorkspaceFile(
  workspaceId: string,
  path: string,
): Promise<{ text?: string; revision?: string; error?: string }> {
  try {
    return await center.readWorkspaceFile(workspaceId, path);
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 결정표 격자 (C17 §결정표). 브라우저는 DMN을 해석하지 않는다 — Center가 읽고 쓴다. */
export async function loadDecisions(
  workspaceId: string,
  path: string,
): Promise<{ tables?: DecisionTableInfo[]; revision?: string; error?: string }> {
  try {
    return await center.workspaceDecisions(workspaceId, path);
  } catch (cause) {
    return { error: message(cause) };
  }
}

export interface DecisionSaveResult {
  revision?: string;
  /** 막지 않은 것 — 겹친 입력 이름·빈 규칙 줄. */
  warnings?: string[];
  error?: string;
  stale?: boolean;
}

export async function saveDecision(
  workspaceId: string,
  path: string,
  table: DecisionTableInfo,
  originalId: string,
  revision: string,
): Promise<DecisionSaveResult> {
  try {
    const made = await center.saveWorkspaceDecision(
      workspaceId,
      path,
      { schema: 1, table, original_id: originalId },
      revision,
    );
    return { revision: made.revision, warnings: made.warnings };
  } catch (cause) {
    const stale = cause instanceof CenterError && cause.status === 409;
    return { error: message(cause), ...(stale ? { stale: true } : {}) };
  }
}

// ─────────────────────────── 시험 실행 (C17 §시험 실행, CON-20) ───────────────────────────

/**
 * 돌려 본다 — **내려보내는 것은 하트비트**라 돌아온 실행은 아직 `queued`다 (ADR-0007·0146).
 * 케이스를 비우면 비교하지 않는다(판정 「비교 안 함」).
 */
export async function startTrial(
  workspaceId: string,
  caseName: string,
  mode: string,
): Promise<{ trial?: TrialInfo; error?: string }> {
  try {
    const made = await center.createTestRun(workspaceId, {
      schema: 1,
      mode,
      ...(caseName ? { case: caseName } : {}),
    });
    return { trial: made };
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 목록 — 최근 것부터 (C17). */
export async function loadTrials(workspaceId: string): Promise<{ trials?: TrialInfo[]; error?: string }> {
  try {
    return { trials: await center.testRuns(workspaceId) };
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 하나 — 도는 동안 콘솔이 이것을 되묻는다 (실행기가 콘솔로 미는 길이 없다). */
export async function loadTrial(
  workspaceId: string,
  runId: string,
): Promise<{ trial?: TrialInfo; error?: string }> {
  try {
    return { trial: await center.testRun(workspaceId, runId) };
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** 「중지」 — 내려간 것은 작업 취소로 실행기가 닫는다 (ADR-0063과 같은 길). */
export async function stopTrial(
  workspaceId: string,
  runId: string,
): Promise<{ trial?: TrialInfo; error?: string }> {
  try {
    return { trial: await center.stopTestRun(workspaceId, runId) };
  } catch (cause) {
    return { error: message(cause) };
  }
}
