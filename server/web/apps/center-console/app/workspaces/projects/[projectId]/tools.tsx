"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionMenu, Button, ConfirmDialog, Dialog, ErrorBanner, Field } from "@bpm/ui";
import type { ProjectInfo } from "@bpm/api-types/c17-project-info";
import {
  createProcess,
  deleteProject,
  importIntoProject,
  installImportedLibs,
  updateProject,
  type ActionResult,
  type ImportResult,
} from "@/app/actions";

/**
 * CON-20c 「새 프로세스」 — 회사는 묻지 않는다(프로젝트의 것이다). 만들면 편집기로 간다.
 * 「새 공통 패키지」도 **같은 창**이고 칸(`kind`)만 다르다 (ADR-0176). 목록 머리의 「새 …」라 둘 다 옅은 단추다 (ADR-0168).
 */
export function NewProcess({ projectId, shared = false }: { projectId: string; shared?: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<ActionResult, FormData>(createProcess, {});
  const title = shared ? "새 공통 패키지" : "새 프로세스";
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {title}...
      </Button>
      <Dialog open={open} title={title} onClose={() => setOpen(false)}>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="project" value={projectId} />
          <input type="hidden" name="kind" value={shared ? "process_lib" : "bpm_process"} />
          {result.error ? <ErrorBanner message={result.error} /> : null}
          <Field
            label="id"
            name="id"
            required
            autoComplete="off"
            autoCapitalize="none"
            help="영문 소문자·숫자·.·_·- 로 시작하는 64자까지. 배포 후보를 지을 때 그대로 패키지 id가 됩니다."
          />
          <Field label="이름" name="name" required autoComplete="off" />
          <Field label="판" name="version" defaultValue="0.1.0" help="다음에 지을 판입니다." />
          <Field label="설명" name="description" autoComplete="off" />
          <label className="flex flex-col gap-1 text-body-sm">
            그림 (선택)
            <input type="file" name="file" accept=".bpmn" className="text-body-sm" />
            <span className="text-text-muted">밖에서 그린 .bpmn 하나를 넣어 시작합니다. 비우면 빈 {shared ? "공통 패키지" : "프로세스"}입니다.</span>
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={pending}>
              만들기
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * CON-20c 「파일에서 가져오기」 — 옛 작업 폴더 zip. **여럿을 담았으면 프로세스 여럿**이다 (ADR-0175 §5).
 *
 * 하나라도 걸리면 아무것도 만들지 않고 걸린 줄을 창 안에 그대로 보인다. 받아 둔 공유 프로세스 사본(`libs/`)은
 * Center가 버리고 돌려주므로, 다 들어온 뒤 「설치」 단추 하나로 잇는다.
 */
export function ImportProcesses({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState<ImportResult, FormData>(importIntoProject, {});
  const [installed, setInstalled] = useState<{ failed: string[] } | null>(null);
  const [installing, start] = useTransition();
  const done = result.made !== undefined;
  const libs = result.libs ?? [];

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        파일에서 가져오기...
      </Button>
      <Dialog open={open} title="파일에서 가져오기" onClose={() => setOpen(false)}>
        {done ? (
          <div className="flex flex-col gap-3 text-body-sm">
            <p>{result.made?.length ?? 0}개를 들였습니다.</p>
            {libs.length > 0 && installed === null ? (
              <div className="flex flex-col gap-2 rounded-md bg-bg-subtle p-3">
                <p>공유 프로세스 {libs.length}개를 설치해야 합니다.</p>
                <ul className="text-text-secondary">
                  {libs.map((one) => (
                    <li key={`${one.workspace_id}:${one.package_id}`}>
                      {one.workspace_id} ← {one.package_id} {one.version}
                    </li>
                  ))}
                </ul>
                <div>
                  <Button
                    variant="primary"
                    disabled={installing}
                    onClick={() => start(async () => setInstalled(await installImportedLibs(projectId, libs)))}
                  >
                    설치
                  </Button>
                </div>
              </div>
            ) : null}
            {installed && installed.failed.length === 0 ? <p>공유 프로세스를 모두 설치했습니다.</p> : null}
            {installed && installed.failed.length > 0 ? (
              <ErrorBanner message={`설치하지 못한 것: ${installed.failed.join(" / ")}`} />
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="project" value={projectId} />
            {result.error ? <ErrorBanner message={result.error} /> : null}
            {result.reasons && result.reasons.length > 0 ? (
              <ul className="list-disc pl-5 text-body-sm text-text-secondary">
                {result.reasons.map((one) => (
                  <li key={one}>{one}</li>
                ))}
              </ul>
            ) : null}
            <label className="flex flex-col gap-1 text-body-sm">
              어디로
              <select
                name="kind"
                defaultValue="bpm_process"
                className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
              >
                <option value="bpm_process">프로세스</option>
                <option value="process_lib">공통 패키지</option>
              </select>
              <span className="text-text-muted">든 것 모두가 이 칸으로 갑니다. 섞인 zip은 두 번 나눠 들이세요.</span>
            </label>
            <label className="flex flex-col gap-1 text-body-sm">
              파일
              <input type="file" name="file" accept=".zip" required className="text-body-sm" />
              <span className="text-text-muted">
                옛 작업 폴더 zip입니다. `process.json`이 있는 폴더마다 프로세스 하나가 됩니다 — 여럿을 한 zip에
                담아도 됩니다. 하나라도 들일 수 없으면 아무것도 만들지 않고 그 까닭을 말합니다.
              </span>
            </label>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={pending}>
                가져오기
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

/** 머리 띠의 「⋯」 — 이름·설명 고치기와 삭제(비어 있을 때만, C17 409 `not_empty`). */
export function ProjectMenu({ project }: { project: ProjectInfo }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [result, action, saving] = useActionState<ActionResult, FormData>(async (previous, form) => {
    const made = await updateProject(previous, form);
    if (!made.error) setEditing(false);
    return made;
  }, {});

  return (
    <>
      <ActionMenu
        label={`${project.name} 동작`}
        items={[
          { label: "이름·설명 고치기...", onSelect: () => setEditing(true) },
          ...(project.processes === 0 ? [{ label: "삭제...", danger: true, onSelect: () => setDeleting(true) }] : []),
        ]}
      />
      <Dialog open={editing} title="이름·설명 고치기" onClose={() => setEditing(false)}>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="project" value={project.id} />
          {result.error ? <ErrorBanner message={result.error} /> : null}
          <Field label="이름" name="name" required defaultValue={project.name} autoComplete="off" />
          <Field label="설명" name="description" defaultValue={project.description ?? ""} autoComplete="off" />
          <p className="text-body-sm text-text-muted">회사는 바꿀 수 없습니다 — 안의 프로세스가 물려받았습니다.</p>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={saving}>
              저장
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        title={`「${project.name}」 프로젝트를 지울까요?`}
        description="빈 프로젝트만 지울 수 있습니다."
        confirmLabel="삭제"
        danger
        onConfirm={() =>
          start(async () => {
            const made = await deleteProject(project.id);
            setError(made?.error ?? null);
            setDeleting(false);
          })
        }
        onCancel={() => setDeleting(false)}
      />
      {error ? <ErrorBanner message={error} /> : null}
    </>
  );
}
