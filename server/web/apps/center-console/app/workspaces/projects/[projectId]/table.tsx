"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ActionMenu, Button, ConfirmDialog, DataTable, Dialog, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { ProcessStatus } from "@bpm/api-types/c17-process-status";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { FilterReset } from "@/components/FilterReset";
import { deleteWorkspace, moveProcess, setProcessKind } from "@/app/actions";
import { time } from "@/lib/time";
import { filterProcesses } from "@/lib/projects";
import { checkText, deployStand, deployText, trialStand } from "@/lib/authoring";
import { ImportProcesses, NewProcess } from "./tools";
import { ART } from "@/components/empty-art";

/** CON-20c [B] 탭 — 주소에는 `?tab=shared`만 남는다 (기본은 프로세스). */
export type ProjectTab = "processes" | "shared";

/**
 * CON-20c [B]+[F]+[T] — **두 칸을 탭으로**: 업무 「프로세스」와 「공통 패키지」 (ADR-0176). 칸은 작업공간의 `kind`로
 * 가르고 한 번에 하나만 보인다 — 아래로 내려 찾지 않는다. 거르기는 고른 탭의 표를 거른다. **거르는 일이 브라우저에서
 * 일어난다** (CON-02와 같은 결, ADR-0160) — 줄은 서버가 다 보냈고 주소는 `history.replaceState`로만 맞춘다.
 */
export function ProcessRows({
  rows,
  status,
  deployments,
  projectId,
  targets,
  admin,
  query,
  initialTab,
}: {
  rows: WorkspaceInfo[];
  /** C17 요약과 C5 배포 — 못 읽었으면 `null`이고 그 열들이 「—」다. */
  status: ProcessStatus[] | null;
  deployments: DeploymentInfo[] | null;
  projectId: string;
  targets: { id: string; name: string }[];
  admin: boolean;
  query: string;
  initialTab: ProjectTab;
}) {
  const [tab, setTab] = useState<ProjectTab>(initialTab);
  const [text, setText] = useState(query);
  const [typed, setTyped] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setTyped(text), 200);
    return () => clearTimeout(timer);
  }, [text]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (tab === "shared") params.set("tab", "shared");
    if (typed.trim()) params.set("q", typed.trim());
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [typed, tab]);

  const shown = filterProcesses(rows, text);
  const here = `/workspaces/projects/${encodeURIComponent(projectId)}`;
  const processes = rows.filter((row) => row.kind !== "process_lib");
  const shared = rows.filter((row) => row.kind === "process_lib");

  const statusOf = new Map((status ?? []).map((one) => [one.workspace_id, one]));
  const columns: Column<WorkspaceInfo>[] = [
    {
      key: "name",
      header: "이름",
      minWidth: "12rem",
      cell: (row) => (
        <>
          <Link href={`/workspaces/${encodeURIComponent(row.id)}`} className="font-semibold hover:underline">
            {row.name}
          </Link>
          <div className="font-mono text-caption text-text-muted">{row.id}</div>
        </>
      ),
    },
    { key: "version", header: "판", cell: (row) => `v${row.version}` },
    // 저작 상태 셋 (ADR-0185) — 셈은 `lib/authoring.ts`. 요약을 못 읽었으면 「—」다.
    {
      key: "deploy",
      header: "배포",
      note: "가장 최근에 서명한 살아 있는 배포의 판. 그 판을 지은 그림이 지금 그림과 같은지를 함께 말합니다.",
      cell: (row) => {
        if (!status || !deployments) return "—";
        const stand = deployStand(row.id, statusOf.get(row.id), deployments);
        return (
          <span className={stand.kind === "none" ? "whitespace-nowrap text-text-muted" : "whitespace-nowrap"}>
            {deployText(stand)}
          </span>
        );
      },
    },
    {
      key: "trial",
      header: "마지막 시험",
      cell: (row) => {
        if (!status) return "—";
        const stand = trialStand(statusOf.get(row.id));
        if (!stand) return <span className="text-text-muted">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-x-2 whitespace-nowrap">
            <StatusBadge group={stand.group} label={stand.label} />
            <span className="text-caption text-text-muted">
              {time(stand.at)}
              {stand.stale ? " · 고치기 전" : ""}
            </span>
          </span>
        );
      },
    },
    {
      key: "check",
      header: "검사",
      note: "지금 그림의 실행 전 검사 결과만 셉니다 — 고치면 「검사 안 함」으로 돌아갑니다.",
      cell: (row) => {
        if (!status) return "—";
        const text = checkText(statusOf.get(row.id));
        const muted = text === "검사 안 함" || text === "—";
        return <span className={muted ? "whitespace-nowrap text-text-muted" : "whitespace-nowrap"}>{text}</span>;
      },
    },
    // 「누가」는 두지 않는다 — 열린 모드에서는 모두 「열린 모드」라 아무것도 말하지 않는다.
    { key: "updated_at", header: "최근 수정", cell: (row) => <span className="whitespace-nowrap">{time(row.updated_at)}</span> },
    ...(admin
      ? [{ key: "menu", header: "", width: "3rem", cell: (row: WorkspaceInfo) => <RowMenu row={row} projectId={projectId} targets={targets} /> }]
      : []),
  ];

  // 탭의 뜻은 화면 글이 아니라 말풍선으로 둔다.
  const tabs: Array<{ id: ProjectTab; label: string; count: number; tip: string }> = [
    { id: "processes", label: "프로세스", count: processes.length, tip: "배포해서 돌리는 업무 BPM 프로세스" },
    { id: "shared", label: "공통 패키지", count: shared.length, tip: "이 프로젝트의 프로세스가 설치해서 부르는 공유 프로세스" },
  ];
  const onShared = tab === "shared";

  return (
    <>
      {/* [B] 탭 — 오른쪽 「가져오기」·「새 …」는 고른 탭의 것이다. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border-default">
        <div role="tablist" aria-label="프로젝트" className="flex gap-1">
          {tabs.map((one) => (
            <button
              key={one.id}
              role="tab"
              aria-selected={tab === one.id}
              title={one.tip}
              onClick={() => setTab(one.id)}
              className={
                tab === one.id
                  ? "-mb-px border-b-2 border-primary px-3 pt-1 pb-2 text-body font-semibold"
                  : "-mb-px border-b-2 border-transparent px-3 pt-1 pb-2 text-body text-text-muted hover:text-text-primary"
              }
            >
              {one.label} <span className="tabular-nums text-text-muted">{one.count}</span>
            </button>
          ))}
        </div>
        {admin ? (
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <ImportProcesses key={`import-${tab}`} projectId={projectId} shared={onShared} />
            <NewProcess key={`new-${tab}`} projectId={projectId} shared={onShared} />
          </div>
        ) : null}
      </div>

      <form className="filter-bar" method="get" onSubmit={(event) => event.preventDefault()}>
        <div className="filter-field">
          <label htmlFor="processes-q">이름</label>
          <span className="flex items-center gap-1">
            <input
              id="processes-q"
              name="q"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="(전체)"
              className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
            />
            <FilterReset href={onShared ? `${here}?tab=shared` : here} onClick={() => setText("")} />
          </span>
        </div>
      </form>

      {onShared ? (
        // 공통 패키지도 같은 열이다 — 지어 올리고 시험한다 (ADR-0185).
        <DataTable
          columns={columns}
          rows={shown.filter((row) => row.kind === "process_lib")}
          rowKey={(row) => row.id}
          caption="공통 패키지"
          numbered
          empty={
            shared.length === 0
              ? {
                  title: "공통 패키지가 없습니다.",
                  art: ART.projects,
                  hint: admin ? "여러 프로세스가 함께 부르는 단계는 여기서 만들어 지은 뒤 설치하세요." : undefined,
                }
              : { title: "조건에 맞는 공통 패키지가 없습니다.", hint: "거르기를 초기화하세요.", art: ART.search }
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={shown.filter((row) => row.kind !== "process_lib")}
          rowKey={(row) => row.id}
          caption="프로세스"
          numbered
          empty={
            processes.length === 0
              ? {
                  title: "프로세스가 없습니다.",
                  art: ART.projects,
                  hint: admin ? "「새 프로세스」로 만들거나 「파일에서 가져오기」로 들이세요." : undefined,
                }
              : { title: "조건에 맞는 프로세스가 없습니다.", hint: "거르기를 초기화하세요.", art: ART.search }
          }
        />
      )}
    </>
  );
}

/** 줄의 「⋯」 — 옮기기(같은 회사만)와 삭제. 삭제는 **배포된 패키지를 그대로 둔다** (C17). */
function RowMenu({
  row,
  projectId,
  targets,
}: {
  row: WorkspaceInfo;
  projectId: string;
  targets: { id: string; name: string }[];
}) {
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <ActionMenu
        label={`${row.name} 동작`}
        disabled={pending}
        items={[
          // 칸 사이를 옮긴다 — 다음에 지을 종류만 바뀐다. 되돌리기가 같은 메뉴에 있어 묻지 않는다 (ADR-0176).
          {
            label: row.kind === "process_lib" ? "프로세스로 옮기기" : "공통 패키지로 옮기기",
            onSelect: () =>
              start(async () => {
                const made = await setProcessKind(row.id, projectId, row.kind === "process_lib" ? "bpm_process" : "process_lib");
                setError(made.error ?? null);
              }),
          },
          ...(targets.length > 0 ? [{ label: "다른 프로젝트로 옮기기...", onSelect: () => setMoving(true) }] : []),
          { label: "삭제...", danger: true, onSelect: () => setDeleting(true) },
        ]}
      />
      <Dialog
        open={moving}
        title="다른 프로젝트로 옮기기"
        onClose={() => setMoving(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoving(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              disabled={pending || !to}
              onClick={() =>
                start(async () => {
                  const made = await moveProcess(row.id, projectId, to);
                  setError(made.error ?? null);
                  setMoving(false);
                })
              }
            >
              옮기기
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-body-sm">
          옮길 프로젝트
          <select
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {targets.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
          <span className="text-text-muted">같은 회사의 프로젝트만 보입니다.</span>
        </label>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        title={`「${row.name}」을 지울까요?`}
        description="그림·케이스·시험 기록이 지워집니다. 이미 배포한 패키지는 그대로 남습니다."
        confirmLabel="삭제"
        danger
        onConfirm={() =>
          start(async () => {
            const made = await deleteWorkspace(row.id);
            setError(made.error ?? null);
            setDeleting(false);
          })
        }
        onCancel={() => setDeleting(false)}
      />
      <Dialog
        open={error !== null}
        title="하지 못했습니다"
        onClose={() => setError(null)}
        footer={
          <Button variant="secondary" onClick={() => setError(null)}>
            닫기
          </Button>
        }
      >
        <ErrorBanner message={error ?? ""} />
      </Dialog>
    </>
  );
}
