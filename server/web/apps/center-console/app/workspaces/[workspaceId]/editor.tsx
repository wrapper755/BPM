"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorBanner } from "@bpm/ui";
import type { BpmnCanvasHandle, NodeProperties } from "@bpm/bpmn-canvas";
import type { FileInfo } from "@bpm/api-types/c17-file-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { loadWorkspaceFile, saveWorkspaceFile } from "@/app/actions";
import { fileLabel, groupFiles, isEditable, opensWith } from "@/lib/workspaces";
import "@bpm/bpmn-canvas/canvas.css";

/**
 * CON-20b 「설계」 탭 — 탐색기 + 가운데 + 상세 패널 + 아래 탭.
 *
 * **가운데에 무엇이 뜰지는 고른 파일이 정한다** ([ADR-0147](../../../../../../docs/decisions/0147-workspace-has-three-tabs.md)).
 * 지금 있는 것은 그림(캔버스)과 받아 둔 것(뷰어)이고, 결정표·케이스 편집기는 조각 4d다 —
 * **끄고 까닭을 그 자리에 적는다** (U3).
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

export function Workspace({
  info,
  files,
  opened,
  text,
  revision,
  canWrite,
  crumb,
}: {
  info: WorkspaceInfo;
  files: FileInfo[];
  opened: string | null;
  text: string;
  revision: string;
  canWrite: boolean;
  crumb: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("설계");
  const [file, setFile] = useState<Opened | null>(opened ? { path: opened, text, revision } : null);
  const [dirty, setDirty] = useState(false);
  const [picked, setPicked] = useState<NodeProperties | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const groups = groupFiles(files);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* [H] 머리 띠 — 지금 자리와 탭, 그리고 그 화면에서만 쓰는 것 (CON-00 [H]와 같은 결). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-default bg-bg-surface px-5 py-3">
        <nav aria-label="지금 자리" className="text-body-sm text-text-secondary">
          {crumb} › <span className="font-semibold text-text-primary">{info.name}</span>
          {dirty ? <span title="저장하지 않은 변경이 있습니다"> *</span> : null}
          <span className="text-text-muted"> · v{info.version}</span>
        </nav>
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
          {editing ? (
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>
              저장
            </Button>
          ) : null}
        </div>
      </header>

      {failure ? (
        <div className="px-5 pt-3">
          <ErrorBanner message={failure} />
        </div>
      ) : null}

      {tab === "설계" ? (
        <div className="flex min-h-0 flex-1">
          {/* [E] 탐색기 */}
          <aside
            aria-label="파일"
            className="w-64 shrink-0 overflow-y-auto border-r border-border-default bg-bg-surface p-3"
          >
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
                onFailed={(cause) => setFailure(`다이어그램을 읽지 못했습니다 — ${cause.message}`)}
              />
            ) : (
              <p className="p-6 text-body-sm text-text-muted">
                {!file
                  ? "열린 정의가 없습니다. 왼쪽에서 정의를 고르거나 「파일에서 가져오기」로 그림을 들이세요."
                  : shows === "table"
                    ? "결정표 편집기는 아직입니다 (M11 조각 4d) — 지금은 그림만 고칩니다."
                    : shows === "cases"
                      ? "케이스 편집기는 아직입니다 (M11 조각 4d)."
                      : "이 파일은 편집기에서 열지 않습니다."}
              </p>
            )}
          </div>

          {/* [P] 상세 패널 — 고른 것 하나만 (STU-04). 고치는 폼은 조각 4c다. */}
          <aside
            aria-label="속성"
            className="w-72 shrink-0 overflow-y-auto border-l border-border-default bg-bg-surface p-3"
          >
            {picked ? (
              <>
                <dl className="flex flex-col gap-2 text-body-sm">
                  <Row label="종류" value={picked.type} />
                  <Row label="이름" value={picked.name || "—"} />
                  <Row label="id" value={picked.id} mono />
                  {picked.calledElement ? <Row label="부르는 것" value={picked.calledElement} mono /> : null}
                  {picked.multiInstance ? <Row label="반복" value={picked.multiInstance} /> : null}
                  {Object.entries(picked.bpm).map(([name, body]) => (
                    <div key={name}>
                      <dt className="text-caption text-text-muted">bpm:{name}</dt>
                      <dd>
                        <pre className="overflow-x-auto bg-bg-subtle p-2 text-caption">{body}</pre>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-caption text-text-muted">고치는 칸은 아직입니다 (M11 조각 4c).</p>
              </>
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
      ) : (
        <div className="p-6 text-body-sm text-text-muted">
          {tab === "시험 실행"
            ? "시험 실행 화면은 아직입니다 (M11 조각 4e) — 전송은 돕니다 (C17)."
            : "작업공간 정보 화면은 아직입니다 (M11 조각 4f)."}
        </div>
      )}
    </div>
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
