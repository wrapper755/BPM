"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorBanner } from "@bpm/ui";
import type { BpmnCanvasHandle, NodeProperties, NodeState, PropertyPatch } from "@bpm/bpmn-canvas";
import type { FileInfo } from "@bpm/api-types/c17-file-info";
import type { BuildInfo } from "@bpm/api-types/c17-build-info";
import type { CheckResponse } from "@bpm/api-types/c17-check-response";
import type { TrialInfo } from "@bpm/api-types/c17-test-run-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import {
  loadBuild,
  loadCheck,
  loadTrial,
  loadTrials,
  loadWorkspaceFile,
  saveWorkspaceFile,
  startCheck,
  stopTrial,
} from "@/app/actions";
import { fileLabel, groupFiles, isEditable, opensWith } from "@/lib/workspaces";
import { isLive } from "@/lib/trials";
import { building, checking } from "@/lib/checks";
import { BuildButton, BuildLine } from "./build";
import { CaseEditor } from "./cases";
import { Checks } from "./checks";
import { DecisionGrid } from "./decisions";
import { Info } from "./info";
import { StartTrial, TrialLog, TrialRuns } from "./trials";
import { Variables } from "./variables";
import { Properties } from "./properties";
import "@bpm/bpmn-canvas/canvas.css";

/**
 * CON-20b 작업공간 — 탭 셋과 그 안의 자리들 ([ADR-0147](../../../../../../docs/decisions/0147-workspace-has-three-tabs.md)).
 *
 * 「설계」는 탐색기 + 가운데 + 상세 패널 + 아래 탭이고, **가운데에 무엇이 뜰지는 고른 파일이
 * 정한다**(그림·결정표·케이스). 「시험 실행」은 돌려 본 것들이다. 「정보」는 아직 비어 있다 —
 * **끄고 까닭을 그 자리에 적는다** (U3).
 *
 * **시험 실행의 결과는 탭에 갇히지 않는다** — 로그는 아래 탭 「로그」, 노드 색은 캔버스에 그대로
 * 간다. 돌려 본 사람이 곧바로 그 자리를 고치기 때문이다. 그래서 그 상태를 여기서 쥔다.
 *
 * 캔버스는 **브라우저에서만** 산다. bpmn-js는 DOM 위의 것이라 서버 그리기로는 뜨지 않는다.
 */
const BpmnCanvas = dynamic(() => import("@bpm/bpmn-canvas").then((made) => made.BpmnCanvas), {
  ssr: false,
  loading: () => <p className="p-6 text-body-sm text-text-muted">캔버스를 여는 중입니다…</p>,
});

/** 지금 열어 둔 파일 — 본문과 `revision`은 짝이다 (C17: 저장할 때 그 `revision`을 싣는다). */
interface Opened {
  path: string;
  text: string;
  revision: string;
}

const TABS = ["설계", "시험 실행", "정보"] as const;
type Tab = (typeof TABS)[number];

/** 아래 탭 (STU-01 [L]) — 「검사」는 조각 4f에서 찬다. */
const BOTTOM = ["변수", "검사", "로그"] as const;
type Bottom = (typeof BOTTOM)[number];

/**
 * 도는 시험 실행을 되묻는 주기. **미는 길이 없다** — 실행기는 Center에만 올리고(C17
 * `PUT …/test-runs/{id}`) 콘솔까지 오는 길은 없다. 너무 자주 물으면 Center를 때리고, 너무
 * 뜸하면 로그가 뭉텅이로 나타난다.
 */
const ASK_EVERY_MS = 1500;

/** 캔버스가 아는 노드 색만 넘긴다 — 계약은 더 많은 값을 허용한다 (C17 KNOWN_NODE_STATES). */
const CANVAS_STATES = new Set<NodeState>(["running", "done", "failed", "waiting"]);

function canvasMarks(states: Record<string, string> | undefined): Record<string, NodeState> {
  const made: Record<string, NodeState> = {};
  for (const [id, state] of Object.entries(states ?? {})) {
    if (CANVAS_STATES.has(state as NodeState)) made[id] = state as NodeState;
  }
  return made;
}

export function Workspace({
  info: given,
  files,
  opened,
  text,
  revision,
  canWrite,
  departments,
  staff,
}: {
  info: WorkspaceInfo;
  files: FileInfo[];
  opened: string | null;
  text: string;
  revision: string;
  canWrite: boolean;
  /** 업무 자리를 고르는 거리 (C16) — 서버 쪽이 읽어 준다. */
  departments: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<Tab>("설계");
  // 「정보」 탭이 고치면 그 자리에서 바뀐다 — 머리 띠의 이름·판과 진입 정의가 함께 따라간다.
  const [info, setInfo] = useState(given);
  const [file, setFile] = useState<Opened | null>(opened ? { path: opened, text, revision } : null);
  const [dirty, setDirty] = useState(false);
  const [picked, setPicked] = useState<NodeProperties | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bottom, setBottom] = useState<Bottom | null>(null);
  const [trials, setTrials] = useState<TrialInfo[]>([]);
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [noCheck, setNoCheck] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  // 접는 것은 **보는 자리를 넓히는 일**이라 기억하지 않는다 — 탭을 옮겨도 그대로 있고 새로
  // 열면 펴진 채다 (CON-20 [E]·[P]).
  const [showFiles, setShowFiles] = useState(true);
  const [showDetail, setShowDetail] = useState(true);
  const canvas = useRef<BpmnCanvasHandle>(null);

  const editing = file !== null && canWrite && isEditable(file.path);
  const shows = file ? opensWith(file.path) : null;

  /** 저장 안 한 것을 들고 떠나지 않게 브라우저에 묻게 한다 (U11 — 창을 닫는 길은 우리가 못 막는다). */
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);

  const open = useCallback(
    async (path: string) => {
      if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 버리고 다른 파일을 열까요?")) return;
      setBusy(true);
      setFailure(null);
      const found = await loadWorkspaceFile(info.id, path);
      setBusy(false);
      if (found.error || found.text === undefined) {
        setFailure(found.error ?? "파일을 읽지 못했습니다");
        return;
      }
      setFile({ path, text: found.text, revision: found.revision ?? "" });
      setDirty(false);
      setPicked(null);
    },
    [dirty, info.id],
  );

  const save = useCallback(async () => {
    const editor = canvas.current?.editor;
    if (!file || !editor) return;
    setBusy(true);
    setFailure(null);
    const xml = await editor.saveXML();
    const made = await saveWorkspaceFile(info.id, file.path, file.revision, xml);
    setBusy(false);
    if (made.error || !made.revision) {
      setFailure(
        made.stale
          ? "다른 사람이 먼저 저장했습니다. 「새로 읽기」를 하면 지금 편집이 사라집니다."
          : (made.error ?? "저장하지 못했습니다"),
      );
      return;
    }
    setFile({ ...file, text: xml, revision: made.revision });
    setDirty(false);
  }, [file, info.id]);

  // Ctrl+S — 저장은 **사람이 누르는 것**이다 (자동 저장이 아니다, CON-20).
  useEffect(() => {
    if (!editing) return;
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [editing, save]);

  const refreshTrials = useCallback(async () => {
    const found = await loadTrials(info.id);
    if (found.trials) setTrials(found.trials);
    if (found.error) setFailure(found.error);
  }, [info.id]);

  // 탭을 열 때 목록을 읽는다 — 늘 읽으면 설계만 하는 동안에도 Center를 두드린다.
  useEffect(() => {
    if (tab === "시험 실행") void refreshTrials();
  }, [tab, refreshTrials]);

  /**
   * 도는 동안 되묻는다 — **미는 길이 없다** (C17: 실행기는 Center에만 올린다).
   * 끝나면 멈추고 목록도 한 번 더 읽는다(판정·소요가 그때 자리를 잡는다).
   */
  useEffect(() => {
    if (!trial || !isLive(trial.state)) return;
    let alive = true;
    const timer = setInterval(() => {
      void (async () => {
        const found = await loadTrial(info.id, trial.run_id);
        if (!alive || !found.trial) return;
        setTrial(found.trial);
        setTrials((before) => before.map((one) => (one.run_id === found.trial!.run_id ? found.trial! : one)));
        if (!isLive(found.trial.state)) void refreshTrials();
      })();
    }, ASK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [trial, info.id, refreshTrials]);

  /**
   * 노드 색을 캔버스에 입힌다 — **「설계」 탭에서도 보인다** (돌려 보고 그 자리에서 고친다).
   * 그림을 **다시 들이면 표식이 지워지므로** `onImported`에서도 같은 것을 입힌다.
   */
  const marks = useRef<Record<string, NodeState>>({});
  marks.current = canvasMarks(trial?.node_states);
  useEffect(() => {
    canvas.current?.editor?.mark(marks.current);
  }, [trial]);

  /** 탭을 옮겼다 돌아오면 캔버스가 제 자리를 다시 재야 한다 (숨어 있는 동안은 0×0이다). */
  useEffect(() => {
    if (tab === "설계") canvas.current?.editor?.resized();
  }, [tab]);

  const stop = useCallback(async () => {
    if (!trial) return;
    setTrialBusy(true);
    const made = await stopTrial(info.id, trial.run_id);
    setTrialBusy(false);
    if (made.error) {
      setFailure(made.error);
      return;
    }
    if (made.trial) {
      setTrial(made.trial);
      void refreshTrials();
    }
  }, [trial, info.id, refreshTrials]);

  /**
   * 「실행 전 검사」 — 담아 둔 결과가 있으면 그대로 온다(`cached`). 지시는 하트비트로 내려가므로
   * **끝났는지는 되물어야** 안다.
   */
  const ask = useCallback(
    async (again: boolean) => {
      setCheckBusy(true);
      setFailure(null);
      const made = await startCheck(info.id, again);
      setCheckBusy(false);
      if (made.error) {
        setFailure(made.error);
        return;
      }
      setNoCheck(false);
      if (made.check) setCheck(made.check);
      setBottom("검사");
    },
    [info.id],
  );

  // 아래 탭 「검사」를 열 때 담아 둔 것을 읽는다 — **저장할 때마다 묻지 않는다** (ADR-0146).
  useEffect(() => {
    if (bottom !== "검사" || check) return;
    void (async () => {
      const found = await loadCheck(info.id);
      if (found.none) setNoCheck(true);
      if (found.check) setCheck(found.check);
    })();
  }, [bottom, check, info.id]);

  // 검사가 도는 동안 되묻는다.
  useEffect(() => {
    if (!checking(check)) return;
    const timer = setInterval(() => {
      void (async () => {
        const found = await loadCheck(info.id);
        if (found.check) setCheck(found.check);
      })();
    }, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [check, info.id]);

  // 짓는 동안 되묻는다 — 끝나면 패키지 id와 판이 들어온다.
  useEffect(() => {
    if (!build || !building(build.state)) return;
    const timer = setInterval(() => {
      void (async () => {
        const found = await loadBuild(info.id, build.build_id);
        if (found.build) setBuild(found.build);
      })();
    }, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [build, info.id]);

  // 파일을 고치면 담아 둔 검사 결과는 **그 그림의 것이 아니다** — 버린다 (C17: 낡은 것을 주지 않는다).
  useEffect(() => {
    if (dirty) setCheck(null);
  }, [dirty]);

  /** 「적용」 — 캔버스의 `modeling`으로 고친다. 한 번이 **실행 취소 한 걸음**이다. */
  const applyProperties = useCallback(
    (patch: PropertyPatch) => {
      const editor = canvas.current?.editor;
      if (!editor || !picked) return;
      editor.setProperties(picked.id, patch);
      // 고친 뒤의 모습을 다시 읽는다 — 캔버스가 다듬은 값(정의 수준 요소 등)이 그대로 보이게.
      setPicked(editor.properties(picked.id));
    },
    [picked],
  );

  const groups = groupFiles(files);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* [H] 머리 띠 — 지금 자리와 탭, 그리고 그 화면에서만 쓰는 것 (CON-00 [H]와 같은 결). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-default bg-bg-surface px-5 py-3">
        {/* 지금 자리는 **위 막대가 쥔다** (ADR-0145 §1) — 여기는 그 작업공간의 지금 상태만 말한다. */}
        <p className="text-body-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{info.name}</span>
          {dirty ? <span title="저장하지 않은 변경이 있습니다"> *</span> : null}
          <span className="text-text-muted"> · v{info.version}</span>
        </p>
        <div role="tablist" aria-label="작업공간" className="flex gap-1">
          {TABS.map((one) => (
            <button
              key={one}
              role="tab"
              aria-selected={tab === one}
              onClick={() => setTab(one)}
              className={
                tab === one
                  ? "border-b-2 border-primary px-3 py-1 text-body-sm font-semibold"
                  : "border-b-2 border-transparent px-3 py-1 text-body-sm text-text-muted hover:text-text-primary"
              }
            >
              {one}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canWrite ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void ask(Boolean(check?.cached))}
              disabled={checkBusy}
            >
              실행 전 검사
            </Button>
          ) : null}
          {canWrite ? <BuildButton workspaceId={info.id} onStarted={setBuild} /> : null}
          {/* 돌리는 중에는 「시험 실행...」 자리가 「중지」가 된다 (U5) — 단추를 둘 두지 않는다. */}
          {canWrite ? (
            trial && isLive(trial.state) ? (
              <Button variant="secondary" size="sm" onClick={() => void stop()} disabled={trialBusy}>
                중지
              </Button>
            ) : (
              <StartTrial
                workspaceId={info.id}
                entry={info.entry}
                onStarted={(made) => {
                  setTrial(made);
                  setTrials((before) => [made, ...before]);
                  setTab("시험 실행");
                  setBottom("로그");
                }}
              />
            )
          ) : null}
          {editing && shows === "canvas" ? (
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>
              저장
            </Button>
          ) : null}
        </div>
      </header>

      {build ? <BuildLine build={build} /> : null}

      {failure ? (
        <div className="px-5 pt-3">
          <ErrorBanner message={failure} />
        </div>
      ) : null}

      {/*
        탭을 옮겨도 **「설계」는 지우지 않고 숨긴다** — 지우면 캔버스가 함께 사라져 **저장하지 않은
        그림을 잃는다**. 「시험 실행」을 보고 와서 고치는 것이 이 화면의 쓰임이라 더욱 그렇다.
      */}
      <div className={tab === "설계" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <div className="flex min-h-0 flex-1">
        {/* [E] 탐색기 — 접힌다 (CON-20). 접어도 **여는 길이 남는다**. */}
        {showFiles ? null : (
          <Spine label="파일" onOpen={() => setShowFiles(true)} side="left" />
        )}
        <aside
          aria-label="파일"
          hidden={!showFiles}
          className="w-64 shrink-0 overflow-y-auto border-r border-border-default bg-bg-surface p-3"
        >
          <div className="mb-2 flex items-center">
            <h2 className="text-caption font-semibold text-text-muted">파일</h2>
            <Fold label="파일 패널 접기" onClick={() => setShowFiles(false)} />
          </div>
          {groups.map((group) => (
            <section key={group.label} className="mb-4">
              <h2 className="mb-1 text-caption font-semibold text-text-muted">{group.label}</h2>
              {group.files.length === 0 ? (
                <p className="text-caption text-text-muted">없습니다.</p>
              ) : (
                <ul>
                  {group.files.map((one) => (
                    <li key={one.path}>
                      <button
                        onClick={() => void open(one.path)}
                        title={one.path}
                        aria-current={file?.path === one.path ? "true" : undefined}
                        className={
                          file?.path === one.path
                            ? "w-full rounded-md bg-primary-subtle px-2 py-1 text-left text-body-sm font-semibold"
                            : "w-full rounded-md px-2 py-1 text-left text-body-sm hover:bg-bg-subtle"
                        }
                      >
                        {fileLabel(one.path)}
                        {one.path === info.entry ? <span className="text-text-muted"> · 진입</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </aside>

        {/* [C] 가운데 — 고른 파일이 정한다 (ADR-0147 §2) */}
        <div className="min-w-0 flex-1 bg-bg-canvas">
          {file && (shows === "canvas" || shows === "viewer") ? (
            <BpmnCanvas
              key={file.path}
              ref={canvas}
              mode={shows === "canvas" && canWrite ? "edit" : "view"}
              xml={file.text}
              className="bpm-canvas"
              // 인자를 그대로 쓴다 — 캔버스는 **들인 뒤에 「아니다」라고도 말한다**(연 적밖에 없는
              // 그림이 「저장 안 한 변경」이 되지 않게). 늘 `true`로 적으면 그 말을 못 듣는다.
              onChanged={setDirty}
              onPicked={(id) => setPicked(id ? (canvas.current?.editor?.properties(id) ?? null) : null)}
              onImported={() => canvas.current?.editor?.mark(marks.current)}
              onFailed={(cause) => setFailure(`다이어그램을 읽지 못했습니다 — ${cause.message}`)}
            />
          ) : file && shows === "table" ? (
            <DecisionGrid
              key={file.path}
              workspaceId={info.id}
              path={file.path}
              canWrite={editing}
              onDirty={setDirty}
            />
          ) : file && shows === "cases" ? (
            <CaseEditor
              key={file.path}
              workspaceId={info.id}
              path={file.path}
              canWrite={editing}
              onDirty={setDirty}
            />
          ) : (
            <p className="p-6 text-body-sm text-text-muted">
              {!file
                ? "열린 정의가 없습니다. 왼쪽에서 정의를 고르거나 「파일에서 가져오기」로 그림을 들이세요."
                : "이 파일은 편집기에서 열지 않습니다."}
            </p>
          )}
        </div>

        {/* [P] 상세 패널 — 고른 것 하나만 (STU-04). 접힌다. */}
        {showDetail ? null : (
          <Spine label="속성" onOpen={() => setShowDetail(true)} side="right" />
        )}
        <aside
          aria-label="속성"
          hidden={!showDetail}
          className="w-72 shrink-0 overflow-y-auto border-l border-border-default bg-bg-surface p-3"
        >
          <div className="mb-2 flex items-center">
            <h2 className="text-caption font-semibold text-text-muted">속성</h2>
            <Fold label="속성 패널 접기" onClick={() => setShowDetail(false)} />
          </div>
          {picked ? (
            <Properties
              key={picked.id}
              node={picked}
              canWrite={editing}
              flows={(picked.gateway?.outgoing ?? []).map((one) => ({
                id: one.id,
                label: one.name || one.to || one.id,
              }))}
              onApply={applyProperties}
            />
          ) : (
            <>
              <dl className="flex flex-col gap-2 text-body-sm">
                <Row label="이름" value={info.name} />
                <Row label="판" value={info.version} />
                <Row label="진입 정의" value={info.entry ?? "—"} mono />
                {info.description ? <Row label="설명" value={info.description} /> : null}
              </dl>
              <p className="mt-3 text-caption text-text-muted">요소를 고르면 그 속성이 여기 보입니다.</p>
            </>
          )}
        </aside>
        </div>

        {/* [L] 아래 탭 — 접힌다. 「변수」는 그림의 `bpm:process`라 캔버스 쪽에 있다 (STU-01 [L]). */}
        <div className="shrink-0 border-t border-border-default bg-bg-surface">
          <div role="tablist" aria-label="아래 탭" className="flex gap-1 px-3">
            {BOTTOM.map((one) => (
              <button
                key={one}
                role="tab"
                aria-selected={bottom === one}
                onClick={() => setBottom(bottom === one ? null : one)}
                className={
                  bottom === one
                    ? "border-b-2 border-primary px-3 py-1 text-body-sm font-semibold"
                    : "border-b-2 border-transparent px-3 py-1 text-body-sm text-text-muted hover:text-text-primary"
                }
              >
                {one}
              </button>
            ))}
          </div>
          {bottom === "변수" ? (
            shows === "canvas" ? (
              <div className="max-h-72 overflow-y-auto border-t border-border-default">
                <Variables
                  key={file?.path}
                  canvas={canvas}
                  canWrite={editing}
                  onApplied={() => setDirty(true)}
                />
              </div>
            ) : (
              <p className="border-t border-border-default p-3 text-body-sm text-text-muted">
                정의(`.bpmn`)를 열면 그 BPM 프로세스의 입력·출력이 여기 보입니다.
              </p>
            )
          ) : null}
          {bottom === "검사" ? (
            <Checks
              check={check}
              none={noCheck}
              busy={checkBusy}
              onCheck={(again) => void ask(again)}
              onPick={(id) => {
                const found = canvas.current?.editor?.select(id) ?? false;
                if (found) setPicked(canvas.current?.editor?.properties(id) ?? null);
                return found;
              }}
            />
          ) : null}
          {bottom === "로그" ? (
            <div className="border-t border-border-default p-3">
              {trial ? (
                <TrialLog lines={trial.log ?? []} />
              ) : (
                <p className="text-body-sm text-text-muted">
                  「시험 실행...」으로 돌려 보면 그 줄이 여기 쌓입니다.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {tab === "시험 실행" ? <TrialRuns trials={trials} picked={trial} onPick={setTrial} /> : null}
      {tab === "정보" ? (
        <Info
          info={info}
          files={files}
          canWrite={canWrite}
          departments={departments}
          staff={staff}
          onSaved={setInfo}
        />
      ) : null}
    </div>
  );
}

/** 패널을 접는 단추 — 글자는 툴팁으로만 둔다 (띠가 좁다). */
function Fold({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="ml-auto rounded-md px-1 text-caption text-text-muted hover:bg-bg-subtle hover:text-text-primary"
    >
      ⟨⟩
    </button>
  );
}

/** 접힌 패널이 남기는 띠 — **여는 길이 사라지면 안 된다**. */
function Spine({ label, onOpen, side }: { label: string; onOpen: () => void; side: "left" | "right" }) {
  return (
    <button
      onClick={onOpen}
      title={`${label} 패널 펼치기`}
      aria-label={`${label} 패널 펼치기`}
      className={`w-7 shrink-0 bg-bg-surface text-caption text-text-muted hover:text-text-primary ${
        side === "left" ? "border-r" : "border-l"
      } border-border-default`}
    >
      <span className="[writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className={mono ? "font-mono break-all" : "break-words"}>{value}</dd>
    </div>
  );
}
