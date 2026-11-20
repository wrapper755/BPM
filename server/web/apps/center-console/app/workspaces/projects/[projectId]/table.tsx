"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ActionMenu, Button, ConfirmDialog, DataTable, Dialog, ErrorBanner, type Column } from "@bpm/ui";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { FilterReset } from "@/components/FilterReset";
import { deleteWorkspace, moveProcess } from "@/app/actions";
import { fullTime } from "@/lib/time";
import { filterProcesses } from "@/lib/projects";

/**
 * CON-20c [F]+[T] — 거르기와 표. **거르는 일이 브라우저에서 일어난다** (CON-02와 같은 결, ADR-0160) —
 * 줄은 서버가 다 보냈고 주소는 `history.replaceState`로만 맞춘다.
 */
export function ProcessRows({
  rows,
  projectId,
  targets,
  admin,
  query,
}: {
  rows: WorkspaceInfo[];
  projectId: string;
  targets: { id: string; name: string }[];
  admin: boolean;
  query: string;
}) {
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
    const search = typed.trim() ? `?q=${encodeURIComponent(typed.trim())}` : "";
    window.history.replaceState(null, "", search || window.location.pathname);
  }, [typed]);

  const shown = filterProcesses(rows, text);
  const here = `/workspaces/projects/${encodeURIComponent(projectId)}`;

  const columns: Column<WorkspaceInfo>[] = [
    {
      key: "name",
      header: "이름",
      minWidth: "12rem",
      cell: (row) => (
        <Link href={`/workspaces/${encodeURIComponent(row.id)}`} className="font-semibold hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: "id", header: "id", mono: true },
    { key: "version", header: "판", cell: (row) => `v${row.version}` },
    {
      key: "place",
      header: "업무 자리",
      cell: (row) =>
        row.place ? [row.place.company, row.place.department, row.place.staff].filter(Boolean).join(" › ") : "—",
    },
    { key: "updated_at", header: "마지막 손댄 때", cell: (row) => <span className="whitespace-nowrap">{fullTime(row.updated_at)}</span> },
    { key: "updated_by", header: "누가" },
    ...(admin
      ? [{ key: "menu", header: "", width: "3rem", cell: (row: WorkspaceInfo) => <RowMenu row={row} projectId={projectId} targets={targets} /> }]
      : []),
  ];

  return (
    <>
      <form className="filter-card mb-4 flex flex-wrap items-end gap-3" method="get" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-col gap-1 text-body-sm">
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
            <FilterReset href={here} onClick={() => setText("")} />
          </span>
        </div>
      </form>
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(row) => row.id}
        caption="프로세스"
        numbered
        empty={
          rows.length === 0
            ? {
                title: "프로세스가 없습니다.",
                hint: admin ? "「새 프로세스」로 만들거나 「파일에서 가져오기」로 들이세요." : undefined,
              }
            : { title: "조건에 맞는 프로세스가 없습니다.", hint: "거르기를 초기화하세요." }
        }
      />
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
