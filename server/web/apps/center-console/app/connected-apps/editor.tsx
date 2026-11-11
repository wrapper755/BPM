"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, Dialog, ErrorBanner, Field } from "@bpm/ui";
import type { ExtensionTestResult } from "@bpm/api-types/c7-extension-test-result";
import type { ExtensionVersionInfo } from "@bpm/api-types/c7-extension-version-info";
import {
  createConnectedApp,
  deleteOperation,
  loadDependents,
  loadVersions,
  pollTestCall,
  revokeConnectedApp,
  saveOperation,
  startTestCall,
  updateConnectedApp,
  type ActionResult,
} from "@/app/actions";
import {
  AUTH_LABEL,
  METHODS,
  OPERATION_TABS,
  TAB_LABEL,
  appFieldsOf,
  cloneOperation,
  dependentLine,
  operationFieldsOf,
  operationGroupsOf,
  operationNames,
  operationOf,
  sampleInput,
  saveConfirmText,
  type AuthKind,
  type DependentLine,
  type OperationFields,
  type OperationTab,
} from "@/lib/adapter-editor";

/**
 * CON-18 만들기·고치기 — 콘솔이 원본인 HTTP 어댑터 앱 (ADR-0141). 정의를 짓는 일은 서버 액션이 하고
 * (`lib/adapter-editor`), 검사는 Center가 한다. **저장 = 새 판**이라 저장마다 확인 창을 거친다.
 * 키 값은 받지 않는다 — 일꾼 설정에만 있다.
 */

const INPUT = "h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body";
const TEXTAREA = "rounded-md border border-border-strong bg-bg-surface p-2 font-mono text-body-sm";
const KEY_HINT = (id: string) =>
  `키는 맡은 일꾼의 설정 BPM_ADAPTER__EXT__${(id || "<id>").toUpperCase().replace(/[^A-Z0-9]/g, "_")}__KEY에 넣습니다`;

/** 일꾼 하나 — 「맡을 일꾼」 체크 목록 (C15 `ConsumerInfo`에서 쓰는 칸만). */
export interface WorkerChoice {
  consumer_id: string;
  name: string;
  topics: string[];
}

/** 앱 하나를 고치는 데 드는 것 — 목록 줄과 상세 머리가 같이 쓴다. */
export interface AppContext {
  id: string;
  version: string;
  definition: unknown;
  groups: Array<{ id: string; name: string }>;
  workers: WorkerChoice[] | null;
  /** 시험 호출을 못 하는 까닭 — 없으면 된다. */
  untestable: string | null;
}

// ─────────────────────────── 메뉴 ───────────────────────────

interface MenuItem {
  label: string;
  tip?: string;
  onSelect: () => void;
}

/** 「...」 — 화면에 고정해 띄운다 (표 상자가 넘치는 것을 자르므로, CON-17과 같다). */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const shut = () => setMenu(null);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    document.addEventListener("click", shut);
    return () => {
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
      document.removeEventListener("click", shut);
    };
  }, [menu]);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          setMenu(menu ? null : { top: box.bottom, right: window.innerWidth - box.right });
        }}
      >
        ...
      </Button>
      {menu ? (
        <ul
          className="fixed z-20 flex min-w-[180px] flex-col border border-border-default bg-bg-surface py-1 shadow-md"
          style={{ top: menu.top, right: menu.right }}
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                title={item.tip}
                className="w-full px-3 py-2 text-left text-body hover:bg-bg-subtle"
                onClick={() => {
                  setMenu(null);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

// ─────────────────────────── 앱 칸 ───────────────────────────

function AppFieldsForm({
  definition,
  groups,
  workers,
  appId,
}: {
  definition: unknown;
  groups: Array<{ id: string; name: string }>;
  workers: WorkerChoice[] | null;
  /** 고칠 때 — 앱 id는 바꿀 수 없다. */
  appId: string | null;
}) {
  const fields = appFieldsOf(definition);
  const [auth, setAuth] = useState<AuthKind>(fields.auth);
  const [id, setId] = useState(appId ?? "");
  const listId = `app-groups-${appId ?? "new"}`;
  return (
    <div className="flex flex-col gap-3">
      <Field
        label="앱 id"
        name="id"
        required
        autoComplete="off"
        defaultValue={appId ?? ""}
        readOnly={appId !== null}
        onChange={(event) => setId(event.currentTarget.value)}
        help={
          appId
            ? "앱 id는 토픽이라 바꿀 수 없습니다 — BPM 그림이 이 이름으로 부릅니다."
            : "영문 소문자로 시작, 소문자·숫자·- (2~50자). 토픽이 되고 만든 뒤 바꿀 수 없습니다."
        }
      />
      <Field label="이름" name="name" required defaultValue={fields.name} />
      <Field label="설명" name="description" defaultValue={fields.description} />
      <Field
        label="앱 묶음"
        name="app_group"
        list={listId}
        defaultValue={fields.appGroup}
        help="있는 묶음에서 고르거나 새로 적습니다. 비우면 「기타」에 놓입니다."
      />
      <datalist id={listId}>
        {groups.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </datalist>
      <Field
        label="주소"
        name="base_url"
        required
        type="url"
        placeholder="https://"
        defaultValue={fields.baseUrl}
        help="맡은 일꾼의 설정이 있으면 그것이 이깁니다."
      />
      <Field
        label="시험 주소"
        name="test_base_url"
        type="url"
        placeholder="https:// (비우면 주소)"
        defaultValue={fields.testBaseUrl}
        help="시험 호출·시험 실행의 일감이 이 주소로 갑니다."
      />
      <details className="text-body-sm">
        <summary className="cursor-pointer text-text-secondary">더 보기 — 허용 호스트</summary>
        <label className="mt-2 flex flex-col gap-1">
          주소 밖에서 더 부를 호스트 (한 줄에 하나)
          <textarea name="extra_hosts" rows={2} defaultValue={fields.extraHosts.join("\n")} className={TEXTAREA} />
          <span className="text-text-muted">주소·시험 주소의 호스트는 저절로 들어갑니다.</span>
        </label>
      </details>
      <fieldset className="flex flex-col gap-1 text-body-sm" title={KEY_HINT(id)}>
        <legend>인증</legend>
        <div className="flex flex-wrap gap-4 py-1">
          {(Object.keys(AUTH_LABEL) as AuthKind[]).map((kind) => (
            <label key={kind} className="flex items-center gap-1">
              <input type="radio" name="auth" value={kind} checked={auth === kind} onChange={() => setAuth(kind)} />
              {AUTH_LABEL[kind]}
            </label>
          ))}
        </div>
        {auth === "header" ? (
          <input name="auth_header" placeholder="헤더 이름 (예: X-API-Key)" defaultValue={fields.authHeader} className={INPUT} />
        ) : null}
        <span className="text-text-muted">{auth === "none" ? "키를 받지 않는 앱입니다." : `${KEY_HINT(id)}.`}</span>
      </fieldset>
      <fieldset className="flex flex-col gap-2 text-body-sm">
        <legend>맡을 일꾼</legend>
        {workers === null ? (
          <span className="text-text-muted">일꾼 목록을 읽지 못했습니다 — 「일꾼」에서 토픽에 이 앱 id를 더하세요.</span>
        ) : workers.length === 0 ? (
          <span className="text-text-muted">일꾼이 없습니다 — 「일꾼」에서 만든 뒤 이 앱을 맡기세요.</span>
        ) : (
          <ul className="flex max-h-40 flex-col overflow-y-auto rounded-md border border-border-default">
            {workers.map((one) => (
              <li key={one.consumer_id} className="border-b border-border-default last:border-b-0">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-subtle">
                  <input
                    type="checkbox"
                    name="consumers"
                    value={one.consumer_id}
                    defaultChecked={appId !== null && one.topics.includes(appId)}
                  />
                  <span className="flex flex-col">
                    <span>{one.name}</span>
                    <span className="font-mono text-caption text-text-muted">{one.topics.join(", ") || "—"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <span className="text-text-muted">고른 일꾼의 토픽에 이 앱 id가 더해집니다 (다음 가져가기부터).</span>
      </fieldset>
    </div>
  );
}

export function NewAppButton({ groups, workers }: { groups: AppContext["groups"]; workers: WorkerChoice[] | null }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<ActionResult, FormData>(createConnectedApp, {});
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        새 연결 앱...
      </Button>
      <Dialog open={open} title="새 연결 앱" width={560} onClose={() => setOpen(false)}>
        <form action={action} className="flex flex-col gap-3">
          {result.error ? <ErrorBanner message={result.error} /> : null}
          <AppFieldsForm definition={null} groups={groups} workers={workers} appId={null} />
          <p className="text-body-sm text-text-secondary">판 0.1.0, 작업 없이 만들고 상세로 갑니다. 작업은 상세에서 더합니다.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              만들기
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// ─────────────────────────── 저장 확인 ───────────────────────────

/** 저장 = 새 판 — 확인 창이 열릴 때 쓰는 배포를 읽어 고정한 배포가 옛 판으로 도는 것을 말한다. */
function SaveConfirm({
  open,
  id,
  version,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  id: string;
  version: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dependents = useDependents(open, id);
  const lines = saveConfirmText(id, version, dependents === undefined ? [] : dependents);
  const pinned = (dependents ?? []).filter((one) => one.pinned_hash);
  return (
    <ConfirmDialog
      open={open}
      title="새 판으로 저장할까요?"
      confirmLabel="저장"
      danger={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-2 text-body-sm">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {pinned.length ? (
          <ul className="list-disc pl-5 font-mono text-caption">
            {pinned.map((one) => (
              <li key={`${one.package_id}@${one.package_version}`}>{dependentLine(one)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}

/** 열릴 때 쓰는 배포를 읽는다. 읽는 중이면 `undefined`, 못 읽으면 `null`. */
function useDependents(open: boolean, id: string): DependentLine[] | null | undefined {
  const [found, setFound] = useState<DependentLine[] | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFound(undefined);
    void loadDependents(id).then((answer) => {
      if (live) setFound(answer.items ?? null);
    });
    return () => {
      live = false;
    };
  }, [open, id]);
  return found;
}

// ─────────────────────────── 앱 동작 ───────────────────────────

type AppAsk = "edit" | "test" | "versions" | "revoke";

/**
 * 앱 하나의 동작 — 목록 줄의 「...」(편집·시험 호출·내리기)와 상세 머리(「편집...」 + 「...」: 시험 호출·판 기록·
 * 내리기)가 같은 창을 쓴다.
 */
export function AppActions({ app, variant }: { app: AppContext; variant: "row" | "header" }) {
  const [asking, setAsking] = useState<AppAsk | null>(null);
  const testTip = app.untestable ?? "저장한 판의 작업 하나를 시험 주소로 부릅니다.";
  const items: MenuItem[] = [
    ...(variant === "row" ? [{ label: "편집...", onSelect: () => setAsking("edit") }] : []),
    { label: "시험 호출...", tip: testTip, onSelect: () => setAsking("test") },
    ...(variant === "header" ? [{ label: "판 기록", onSelect: () => setAsking("versions") }] : []),
    { label: "내리기...", tip: "이 앱의 판을 모두 철회합니다.", onSelect: () => setAsking("revoke") },
  ];
  return (
    <div className="flex items-center gap-1">
      {variant === "header" ? (
        <Button variant="secondary" onClick={() => setAsking("edit")}>
          편집...
        </Button>
      ) : null}
      <RowMenu label={`${app.id} 동작`} items={items} />
      <EditApp open={asking === "edit"} app={app} onClose={() => setAsking(null)} />
      <TestCall open={asking === "test"} app={app} operation={null} onClose={() => setAsking(null)} />
      <Versions open={asking === "versions"} id={app.id} onClose={() => setAsking(null)} />
      <Revoke open={asking === "revoke"} id={app.id} onClose={() => setAsking(null)} />
    </div>
  );
}

function EditApp({ open, app, onClose }: { open: boolean; app: AppContext; onClose: () => void }) {
  const [form, setForm] = useState<FormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      {/* 확인 창은 이 창 위에 겹쳐 뜬다 — 이 창을 숨기면 `<dialog>`의 close가 onClose를 불러 창이 아주 닫힌다. */}
      <Dialog open={open} title={`${app.id} 편집`} width={560} onClose={onClose}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setForm(new FormData(event.currentTarget));
          }}
        >
          {error ? <ErrorBanner message={error} /> : null}
          <AppFieldsForm definition={app.definition} groups={app.groups} workers={app.workers} appId={app.id} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              저장
            </Button>
          </div>
        </form>
      </Dialog>
      <SaveConfirm
        open={form !== null}
        id={app.id}
        version={app.version}
        onCancel={() => setForm(null)}
        onConfirm={() => {
          const sent = form;
          setForm(null);
          if (!sent) return;
          start(async () => {
            const result = await updateConnectedApp(app.id, app.version, sent);
            setError(result.error ?? null);
            if (!result.error) {
              onClose();
              router.refresh();
            }
          });
        }}
      />
    </>
  );
}

function Revoke({ open, id, onClose }: { open: boolean; id: string; onClose: () => void }) {
  const dependents = useDependents(open, id);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      title={`${id} 앱을 내릴까요?`}
      description="이 앱의 판을 모두 철회합니다. 되살리지 않습니다 — 같은 id로 다시 만들 수 없습니다."
      confirmLabel={pending ? "내리는 중..." : "내리기"}
      onConfirm={() =>
        start(async () => {
          const result = await revokeConnectedApp(id);
          setError(result.error ?? null);
        })
      }
      onCancel={onClose}
    >
      <div className="flex flex-col gap-2 text-body-sm">
        {error ? <ErrorBanner message={error} /> : null}
        {dependents === undefined ? (
          <span className="text-text-muted">쓰는 배포를 읽는 중...</span>
        ) : dependents === null ? (
          <span className="text-text-muted">이 앱을 쓰는 배포를 읽지 못했습니다.</span>
        ) : dependents.length ? (
          <>
            <p>이 앱을 쓰는 배포가 있습니다 — 그 BPM 프로세스는 시작하지 못합니다.</p>
            <ul className="list-disc pl-5 font-mono text-caption">
              {dependents.map((one) => (
                <li key={`${one.package_id}@${one.package_version}`}>{dependentLine(one)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>이 앱을 쓰는 배포는 없습니다.</p>
        )}
      </div>
    </ConfirmDialog>
  );
}

function Versions({ open, id, onClose }: { open: boolean; id: string; onClose: () => void }) {
  const [found, setFound] = useState<{ items?: ExtensionVersionInfo[]; error?: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFound(null);
    void loadVersions(id).then((answer) => {
      if (live) setFound(answer);
    });
    return () => {
      live = false;
    };
  }, [open, id]);
  return (
    <Dialog open={open} title={`${id} 판 기록`} width={640} onClose={onClose}>
      {found === null ? (
        <span className="text-body-sm text-text-muted">읽는 중...</span>
      ) : found.error ? (
        <ErrorBanner message={found.error} />
      ) : (
        <table className="w-full text-body-sm">
          <thead>
            <tr className="text-left text-text-secondary">
              <th className="pr-3">판</th>
              <th className="pr-3">올린 때</th>
              <th className="pr-3">올린 사람</th>
              <th>철회</th>
            </tr>
          </thead>
          <tbody>
            {(found.items ?? []).map((one) => (
              <tr key={one.version} className="align-top">
                <td className="pr-3 font-mono" title={one.definition_hash}>
                  {one.version}
                </td>
                <td className="pr-3">{new Date(one.registered_at).toLocaleString("ko-KR")}</td>
                <td className="pr-3">{one.registered_by ?? "—"}</td>
                <td>
                  {one.revoked_at
                    ? `${new Date(one.revoked_at).toLocaleString("ko-KR")}${one.revoked_by ? ` · ${one.revoked_by}` : ""}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          닫기
        </Button>
      </div>
    </Dialog>
  );
}

// ─────────────────────────── 시험 호출 ───────────────────────────

function Outcome({ result }: { result: ExtensionTestResult }) {
  if (result.state === "completed") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-body-sm font-semibold">출력 ({result.version}판)</span>
        <pre className="max-h-64 overflow-auto rounded-md bg-bg-subtle p-2 font-mono text-caption">
          {JSON.stringify(result.output ?? {}, null, 2)}
        </pre>
      </div>
    );
  }
  if (result.state === "pending" || result.state === "locked") {
    return <span className="text-body-sm text-text-muted">아직 답이 없습니다 — 일꾼이 가져가길 기다립니다.</span>;
  }
  const error = result.error ?? {};
  return (
    <div className="flex flex-col gap-1 text-body-sm">
      <span className="font-semibold text-status-failed-fg">
        실패 · {String(error.code ?? result.state)} ({result.version}판)
      </span>
      {error.message ? <span>{String(error.message)}</span> : null}
    </div>
  );
}

/** 시험 호출 — **저장한 판으로만** (일꾼은 서명된 정의만 받는다). `operation`이 있으면 그 작업으로 연다. */
function TestCall({
  open,
  app,
  operation,
  onClose,
}: {
  open: boolean;
  app: AppContext;
  operation: string | null;
  onClose: () => void;
}) {
  const names = operationNames(app.definition);
  const [picked, setPicked] = useState(operation ?? names[0] ?? "");
  const [input, setInput] = useState(sampleInput(operationOf(app.definition, picked)));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtensionTestResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const first = operation ?? names[0] ?? "";
    setPicked(first);
    setInput(sampleInput(operationOf(app.definition, first)));
    setResult(null);
    setError(null);
    // 열 때마다 처음부터 — 정의가 바뀌었을 수 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const call = () =>
    start(async () => {
      setError(null);
      let answer = await startTestCall(app.id, picked, input);
      // 기다리는 동안이면 몇 번 더 묻는다 (한 번에 20초) — 일꾼이 붙어 있지 않으면 끝내 pending이다.
      for (let i = 0; i < 2 && answer.result && ["pending", "locked"].includes(answer.result.state); i += 1) {
        setResult(answer.result);
        answer = await pollTestCall(app.id, answer.result.task_id);
      }
      setError(answer.error ?? null);
      setResult(answer.result ?? null);
    });

  return (
    <Dialog open={open} title={`${app.id} 시험 호출`} width={640} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {app.untestable ? <ErrorBanner message={app.untestable} /> : null}
        {names.length === 0 ? (
          <span className="text-body-sm text-text-muted">작업이 없습니다 — 상세에서 「작업 더하기...」로 더하세요.</span>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-body-sm">
              작업
              <select
                className={INPUT}
                value={picked}
                onChange={(event) => {
                  setPicked(event.currentTarget.value);
                  setInput(sampleInput(operationOf(app.definition, event.currentTarget.value)));
                  setResult(null);
                }}
              >
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-body-sm">
              입력 (JSON)
              <textarea
                rows={8}
                className={TEXTAREA}
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
              />
              <span className="text-text-muted">
                저장한 {app.version}판으로, 맡은 일꾼이 시험 주소로 부릅니다. 받은 값은 이 창에만 보이고 Center는 지웁니다.
              </span>
            </label>
          </>
        )}
        {error ? <ErrorBanner message={error} /> : null}
        {result ? <Outcome result={result} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="primary"
            disabled={pending || names.length === 0 || app.untestable !== null}
            title={app.untestable ?? undefined}
            onClick={call}
          >
            {pending ? "부르는 중..." : "부르기"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ─────────────────────────── 작업 ───────────────────────────

export function AddOperationButton({ app }: { app: AppContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        작업 더하기...
      </Button>
      <OperationEditor open={open} app={app} operation={null} replacing={null} onClose={() => setOpen(false)} />
    </>
  );
}

type OperationAsk = "edit" | "clone" | "test" | "delete";

/** 작업 줄의 「...」 — 편집·복제·시험 호출·지우기. */
export function OperationMenu({ app, name }: { app: AppContext; name: string }) {
  const [asking, setAsking] = useState<OperationAsk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const operation = operationOf(app.definition, name);
  return (
    <>
      <RowMenu
        label={`${name} 작업 동작`}
        items={[
          { label: "편집...", onSelect: () => setAsking("edit") },
          { label: "복제...", tip: "같은 작업을 새 이름으로 더합니다.", onSelect: () => setAsking("clone") },
          { label: "시험 호출...", tip: app.untestable ?? undefined, onSelect: () => setAsking("test") },
          { label: "지우기...", onSelect: () => setAsking("delete") },
        ]}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <OperationEditor
        open={asking === "edit"}
        app={app}
        operation={operation}
        replacing={name}
        onClose={() => setAsking(null)}
      />
      <OperationEditor
        open={asking === "clone"}
        app={app}
        operation={operation ? cloneOperation(operation, operationNames(app.definition)) : null}
        replacing={null}
        onClose={() => setAsking(null)}
      />
      <TestCall open={asking === "test"} app={app} operation={name} onClose={() => setAsking(null)} />
      <ConfirmDialog
        open={asking === "delete"}
        title={`${name} 작업을 지울까요?`}
        description={`${saveConfirmText(app.id, app.version, []).join(" ")} 이 작업을 부르는 그림은 새 판에서 실패합니다.`}
        confirmLabel={pending ? "지우는 중..." : "지우기"}
        onConfirm={() =>
          start(async () => {
            const result = await deleteOperation(app.id, app.version, name);
            setError(result.error ?? null);
            setAsking(null);
            if (!result.error) router.refresh();
          })
        }
        onCancel={() => setAsking(null)}
      />
    </>
  );
}

/** 작업 창 — 칸 넷은 폼, 넷은 JSON 탭 (화면 문서 CON-18). 저장하면 Center가 E3로 보고 사유를 그 탭 아래 보인다. */
function OperationEditor({
  open,
  app,
  operation,
  replacing,
  onClose,
}: {
  open: boolean;
  app: AppContext;
  operation: unknown;
  /** 고치는 작업의 옛 이름 — 새 작업·복제면 null. */
  replacing: string | null;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<OperationFields>(() => operationFieldsOf(operation));
  const [tab, setTab] = useState<OperationTab>("input");
  const [errors, setErrors] = useState<Partial<Record<OperationTab | "form", string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const groups = operationGroupsOf(app.definition);
  const saved = operationFieldsOf(operation);
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved);

  useEffect(() => {
    if (!open) return;
    setFields(operationFieldsOf(operation));
    setErrors({});
    setTab("input");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof OperationFields>(key: K, value: OperationFields[K]) =>
    setFields((now) => ({ ...now, [key]: value }));
  const renamed = replacing !== null && fields.name.trim() !== replacing;
  const testTip = replacing === null ? "저장한 뒤 시험합니다" : dirty ? "저장한 뒤 시험합니다" : app.untestable;
  const title = replacing ? `작업 ${replacing} 편집` : "작업 더하기";

  return (
    <>
      {/* 확인·시험 창은 이 창 위에 겹쳐 뜬다 (숨기면 close가 onClose를 불러 고친 것을 잃는다). */}
      <Dialog open={open} title={title} width={760} onClose={onClose}>
        <div className="flex flex-col gap-3">
          {errors.form ? <ErrorBanner message={errors.form} /> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr] [&>*]:min-w-0 [&_input]:w-full [&_select]:w-full">
            <Field label="이름" required value={fields.name} onChange={(e) => set("name", e.currentTarget.value)} />
            <label className="flex flex-col gap-1 text-body-sm font-medium">
              묶음
              <input
                className={INPUT}
                list={`op-groups-${app.id}`}
                value={fields.group}
                onChange={(e) => set("group", e.currentTarget.value)}
              />
              <datalist id={`op-groups-${app.id}`}>
                {groups.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-body-sm font-medium">
              메서드
              <select className={INPUT} value={fields.method} onChange={(e) => set("method", e.currentTarget.value)}>
                {METHODS.map((one) => (
                  <option key={one}>{one}</option>
                ))}
              </select>
            </label>
            <Field label="경로" required value={fields.path} onChange={(e) => set("path", e.currentTarget.value)} />
          </div>
          {renamed ? (
            <p className="text-body-sm text-status-warning-fg">
              이름을 바꾸면 「{replacing}」을 부르던 BPM 그림이 새 판에서 실패합니다.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-4">
            <Field
              className="min-w-[280px] flex-1"
              label="설명"
              value={fields.description}
              onChange={(e) => set("description", e.currentTarget.value)}
            />
            <label
              className="flex items-center gap-1 pb-2 text-body-sm"
              title="아니오면 결과를 모르는 실패를 자동으로 다시 부르지 않습니다"
            >
              <input type="checkbox" checked={fields.idempotent} onChange={(e) => set("idempotent", e.currentTarget.checked)} />
              다시 불러도 됨
            </label>
          </div>
          <div role="tablist" className="flex gap-1 border-b border-border-default">
            {OPERATION_TABS.map((one) => (
              <button
                key={one}
                type="button"
                role="tab"
                aria-selected={tab === one}
                onClick={() => setTab(one)}
                className={`px-3 py-1.5 text-body-sm ${tab === one ? "border-b-2 border-primary font-semibold" : "text-text-secondary"}`}
              >
                {TAB_LABEL[one]}
                {errors[one] ? <span className="text-status-failed-fg"> ●</span> : null}
              </button>
            ))}
          </div>
          <textarea
            aria-label={TAB_LABEL[tab]}
            rows={12}
            spellCheck={false}
            className={TEXTAREA}
            value={fields.tabs[tab]}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setFields((now) => ({ ...now, tabs: { ...now.tabs, [tab]: value } }));
            }}
          />
          <TabHelp tab={tab} />
          {errors[tab] ? <p className="whitespace-pre-line text-body-sm text-status-failed-fg">{errors[tab]}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(testTip)}
              title={testTip ?? undefined}
              onClick={() => setTesting(true)}
            >
              시험...
            </Button>
            <Button variant="primary" disabled={pending || !dirty} onClick={() => setConfirming(true)}>
              {pending ? "저장하는 중..." : "저장"}
            </Button>
          </div>
        </div>
      </Dialog>
      <SaveConfirm
        open={confirming}
        id={app.id}
        version={app.version}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          start(async () => {
            const result = await saveOperation(app.id, app.version, replacing, fields);
            const found = { ...(result.errors ?? {}), ...(result.error ? { form: result.error } : {}) };
            setErrors(found);
            const first = OPERATION_TABS.find((one) => found[one]);
            if (first) setTab(first);
            if (Object.keys(found).length === 0) {
              onClose();
              router.refresh();
            }
          });
        }}
      />
      <TestCall open={testing} app={app} operation={replacing} onClose={() => setTesting(false)} />
    </>
  );
}

const TAB_HELP: Record<OperationTab, ReactNode> = {
  input: "JSON Schema — 그림이 넘기는 입력 칸 (`properties`·`required`).",
  output: "JSON Schema — 그림이 받는 출력 칸. 비워도 됩니다.",
  request: (
    <>
      <code>{'{"body": …, "query": {…}, "headers": {…}}'}</code> — 값 자리에 <code>{"{{input.<칸>}}"}</code>·
      <code>{"{{run_id}}"}</code>를 씁니다.
    </>
  ),
  response: (
    <>
      <code>{'{"output": {"<칸>": "$.경로"}, "error_when": {"path": "$.status", "not_equals": "ok"}}'}</code> — 제한
      JSONPath.
    </>
  ),
};

function TabHelp({ tab }: { tab: OperationTab }) {
  return <p className="text-caption text-text-muted">{TAB_HELP[tab]}</p>;
}
