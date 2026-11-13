"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmDialog, Dialog, ErrorBanner, Field } from "@bpm/ui";
import type { FileInfo } from "@bpm/api-types/c17-file-info";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { installLib, loadSharedPackages, removeLib, saveWorkspaceInfo } from "@/app/actions";
import { fileKind } from "@/lib/workspaces";
import { workPlaceLabel } from "@/lib/organization";

/**
 * CON-20 「정보」 탭 — 이름·판·설명·업무 자리·진입 정의 (C17 `PATCH`, STU-06이 하던 일).
 *
 * **그림을 고치는 칸은 없다** — 입력·출력은 아래 탭 「변수」(그림의 `bpm:process`)이고 여기는
 * 작업 폴더 기록(`process.json`)이다. 실행 위치 칸도 없다 ([ADR-0144](../../../../../../docs/decisions/0144-remove-the-pc-runner.md)).
 *
 * **보내지 않은 칸은 Center가 그대로 둔다** — 담당자·태그처럼 매니페스트에 칸이 없는 값도
 * `process.json`에 남는다. 그래서 이 폼은 **고친 칸만** 보낸다.
 */
export function Info({
  info,
  files,
  canWrite,
  departments,
  staff,
  onSaved,
}: {
  info: WorkspaceInfo;
  files: FileInfo[];
  canWrite: boolean;
  departments: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  onSaved: (info: WorkspaceInfo) => void;
}) {
  const [name, setName] = useState(info.name);
  const [version, setVersion] = useState(info.version);
  const [description, setDescription] = useState(info.description ?? "");
  const [entry, setEntry] = useState(info.entry ?? "");
  const [scope, setScope] = useState(info.place?.scope ?? "company");
  const [department, setDepartment] = useState(info.place?.department ?? "");
  const [staffId, setStaffId] = useState(info.place?.staff ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const definitions = files.filter((one) => fileKind(one.path) === "process");

  const save = async () => {
    setBusy(true);
    setFailure(null);
    setSaid(null);
    const made = await saveWorkspaceInfo(info.id, {
      schema: 1,
      name,
      version,
      description,
      entry: entry || null,
      // 자리가 요구하는 칸만 싣는다 — 계약이 「부서 자리에만 department를 적는다」로 막는다 (C16).
      place: {
        scope,
        department: scope === "department" ? department || null : null,
        staff: scope === "staff" ? staffId || null : null,
      },
    });
    setBusy(false);
    if (made.error || !made.info) {
      setFailure(made.error ?? "저장하지 못했습니다");
      return;
    }
    setSaid("저장했습니다.");
    onSaved(made.info);
  };

  return (
    <div className="max-w-2xl overflow-y-auto p-6">
      <h2 className="mb-3 text-body font-semibold">작업공간</h2>
      {failure ? <ErrorBanner message={failure} /> : null}

      <div className="flex flex-col gap-3">
        <dl className="text-body-sm">
          <dt className="text-caption text-text-muted">id</dt>
          <dd className="font-mono">
            {info.id}
            <span className="ml-2 font-sans text-caption text-text-muted">
              배포 후보를 지으면 그대로 패키지 id가 됩니다 — 바꿀 수 없습니다.
            </span>
          </dd>
        </dl>
        <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
        <Field
          label="판"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={!canWrite}
          help="다음에 지을 판입니다."
        />
        <Field
          label="설명"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canWrite}
          help="패키지로 함께 갑니다 (C1)."
        />

        <label className="flex flex-col gap-1 text-body-sm">
          진입 정의
          <select
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            disabled={!canWrite}
            className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
          >
            <option value="">(고르지 않음)</option>
            {definitions.map((one) => (
              <option key={one.path} value={one.path}>
                {one.path}
              </option>
            ))}
          </select>
          <span className="text-caption text-text-muted">
            돌려 보기와 배포 후보 짓기가 여기서 시작합니다. 고르지 않으면 둘 다 막힙니다.
          </span>
        </label>

        <fieldset className="flex flex-col gap-1 text-body-sm">
          <legend className="text-body-sm">업무 자리</legend>
          <span className="text-caption text-text-muted">
            회사는 {info.company}입니다 — 만들 때 정해지고 바뀌지 않습니다 (C16).
          </span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            disabled={!canWrite}
            className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
          >
            <option value="company">회사 공통</option>
            <option value="department">부서</option>
            <option value="staff">직원</option>
          </select>
          {scope === "department" ? (
            <Pick value={department} onChange={setDepartment} rows={departments} disabled={!canWrite} what="부서" />
          ) : null}
          {scope === "staff" ? (
            <Pick value={staffId} onChange={setStaffId} rows={staff} disabled={!canWrite} what="직원" />
          ) : null}
          <span className="text-caption text-text-muted">
            지금 자리: {workPlaceLabel(info.place, { departments: byId(departments), staff: byId(staff) })}
          </span>
        </fieldset>

        {canWrite ? (
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={busy}>
              저장
            </Button>
            {said ? <span className="text-body-sm text-text-muted">{said}</span> : null}
          </div>
        ) : null}
      </div>

      <Libs info={info} canWrite={canWrite} onChanged={onSaved} />
    </div>
  );
}

/**
 * 받아 둔 공유 BPM 프로세스 (C17 §공유 BPM 프로세스 설치, STU-11이 하던 일).
 *
 * **판은 기록이 안다** — `libs/`는 평평하고 이름이 `<id>__<이름>`이라 파일 목록에 판이 없다.
 * 그래서 `WorkspaceInfo.libs`를 보인다.
 */
function Libs({
  info,
  canWrite,
  onChanged,
}: {
  info: WorkspaceInfo;
  canWrite: boolean;
  onChanged: (info: WorkspaceInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PackageInfo[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);

  // 창을 열 때 고를 거리를 읽는다 — **`process_lib`만**이다 (C7에 그 갈래가 없어 C5 패키지 표를 본다).
  useEffect(() => {
    if (!open || rows) return;
    void (async () => {
      const found = await loadSharedPackages();
      if (found.error) setFailure(found.error);
      setRows(found.items ?? []);
    })();
  }, [open, rows]);

  const put = useCallback(async () => {
    const [packageId, version] = chosen.split("@");
    if (!packageId || !version) return;
    setBusy(true);
    setFailure(null);
    const made = await installLib(info.id, packageId, version);
    setBusy(false);
    if (made.error || !made.info) {
      setFailure(made.error ?? "설치하지 못했습니다");
      return;
    }
    setOpen(false);
    onChanged(made.info);
  }, [chosen, info.id, onChanged]);

  const drop = useCallback(
    async (packageId: string) => {
      setBusy(true);
      setFailure(null);
      const made = await removeLib(info.id, packageId);
      setBusy(false);
      setDropping(null);
      if (made.error || !made.info) {
        setFailure(made.error ?? "제거하지 못했습니다");
        return;
      }
      onChanged(made.info);
    },
    [info.id, onChanged],
  );

  const libs = info.libs ?? [];

  return (
    <>
      <div className="mt-8 mb-2 flex items-center gap-2">
        <h2 className="text-body font-semibold">받아 둔 공유 프로세스</h2>
        {canWrite ? (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
            설치...
          </Button>
        ) : null}
      </div>
      {failure ? <ErrorBanner message={failure} /> : null}
      {libs.length === 0 ? (
        <p className="text-body-sm text-text-muted">
          없습니다. 다른 프로세스를 불러 쓰려면 그 공유 프로세스를 먼저 설치하세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-body-sm">
          {libs.map((one) => (
            <li key={one.id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono">
                {one.id}@{one.version}
              </span>
              <span className="text-caption text-text-muted">
                {one.processes?.length
                  ? `부를 수 있는 정의 ${one.processes.length}개 — ${one.processes.join(", ")}`
                  : "부를 수 있는 정의가 없습니다 (읽지 못한 정의일 수 있습니다)."}
              </span>
              {canWrite ? (
                <button
                  onClick={() => setDropping(one.id)}
                  className="ml-auto text-caption text-text-muted hover:text-text-primary hover:underline"
                >
                  제거...
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-caption text-text-muted">
        받아 둔 것은 편집 대상이 아닙니다. 판은 배포 후보를 지을 때 매니페스트로 함께 갑니다.
      </p>

      <Dialog
        open={open}
        title="공유 프로세스를 설치합니다"
        description="정의와 결정표를 함께 받습니다. 같은 id가 이미 있으면 갈아 치웁니다."
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              그만두기
            </Button>
            <Button variant="primary" onClick={() => void put()} disabled={busy || !chosen}>
              설치
            </Button>
          </div>
        }
      >
        {rows === null ? (
          <p className="text-body-sm text-text-muted">목록을 읽는 중입니다…</p>
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            받을 수 있는 공유 프로세스가 없습니다 — 먼저 공유 프로세스를 배포 후보로 올리세요.
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-body-sm">
            공유 프로세스
            <select
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
            >
              <option value="">(고르세요)</option>
              {rows.map((one) => (
                <option key={`${one.id}@${one.version}`} value={`${one.id}@${one.version}`}>
                  {one.name} · {one.id}@{one.version}
                </option>
              ))}
            </select>
          </label>
        )}
      </Dialog>

      <ConfirmDialog
        open={dropping !== null}
        title="받아 둔 것을 제거할까요?"
        description={`${dropping}이(가) 넣은 파일만 지웁니다. 그 정의를 부르는 호출이 있으면 실행 전 검사가 막습니다.`}
        confirmLabel="제거"
        onConfirm={() => void drop(dropping ?? "")}
        onCancel={() => setDropping(null)}
      />
    </>
  );
}

function Pick({
  value,
  onChange,
  rows,
  disabled,
  what,
}: {
  value: string;
  onChange: (value: string) => void;
  rows: { id: string; name: string }[];
  disabled: boolean;
  what: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={what}
      className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
    >
      <option value="">({what}를 고르세요)</option>
      {rows.map((one) => (
        <option key={one.id} value={one.id}>
          {one.name}
        </option>
      ))}
    </select>
  );
}

const byId = (rows: { id: string; name: string }[]) => Object.fromEntries(rows.map((one) => [one.id, one.name]));
