"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button, Dialog, ErrorBanner, StatusBadge } from "@bpm/ui";
import type { BuildInfo } from "@bpm/api-types/c17-build-info";
import { startBuild } from "@/app/actions";
import { buildLabel, building } from "@/lib/checks";

/**
 * CON-20 「배포 후보로 만들기」 — STU-12(내보내기·올리기)가 하던 일 (C17).
 *
 * **짓는 것은 서버 실행기다** — 누르면 202로 받고 「짓는 중」이 머리 띠에 뜬다. 다 지은 zip은
 * 실행기가 Center에 올리고 **Center가 제 이름으로 등록한다**(ADR-0146) — 콘솔은 그 끝을 본다.
 *
 * **올린 것은 후보다.** 승인·배포는 바뀌지 않는다 — 콘솔에서 설계한 것이 저절로 현장에 가지
 * 않는다 (C2·CON-06·CON-15). 그 말을 창과 끝난 줄에 **둘 다** 적는다.
 *
 * **「내 PC로 내려받기」는 없다** — 짓는 것도 받는 것도 서버 안이라 내려받을 까닭이 없다.
 */
export function BuildButton({
  workspaceId,
  onStarted,
}: {
  workspaceId: string;
  onStarted: (build: BuildInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("bpm_process");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    const made = await startBuild(workspaceId, kind);
    setBusy(false);
    if (made.error || !made.build) {
      setFailure(made.error ?? "짓지 못했습니다");
      return;
    }
    setOpen(false);
    onStarted(made.build);
  }, [kind, onStarted, workspaceId]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        배포 후보로 만들기...
      </Button>
      <Dialog
        open={open}
        title="배포 후보로 만듭니다"
        description="서버 실행기가 짓고 Center가 후보로 등록합니다. 승인·배포는 바뀌지 않습니다."
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              그만두기
            </Button>
            <Button variant="primary" onClick={() => void run()} disabled={busy}>
              짓기
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {failure ? <ErrorBanner message={failure} /> : null}
          <label className="flex flex-col gap-1 text-body-sm">
            무엇을 짓습니까
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
            >
              <option value="bpm_process">프로세스</option>
              <option value="process_lib">공유 프로세스</option>
            </select>
            <span className="text-caption text-text-muted">
              공유 프로세스는 진입이 없습니다 — 다른 프로세스가 불러 쓰는 묶음입니다 (C1).
            </span>
          </label>
        </div>
      </Dialog>
    </>
  );
}

/** 머리 띠 아래 한 줄 — 짓는 중이거나 막 끝났을 때만 보인다. */
export function BuildLine({ build }: { build: BuildInfo }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-bg-subtle px-5 py-2 text-body-sm">
      <StatusBadge group="배포 후보 짓기" label={buildLabel(build.state)} />
      {building(build.state) ? (
        <span className="text-text-muted">서버 실행기가 짓고 있습니다…</span>
      ) : build.state === "done" ? (
        <>
          <span>
            <span className="font-mono">{build.package_id}</span> v{build.version}을 후보로 올렸습니다.
          </span>
          {/* 갈래마다 보는 자리가 다르다 — CON-06은 **BPM 프로세스 아닌 종류만** 보인다. */}
          {build.kind === "process_lib" ? (
            <Link href="/packages" className="text-primary hover:underline">
              공통 패키지에서 보기
            </Link>
          ) : (
            <Link href="/bots" className="text-primary hover:underline">
              프로세스 목록에서 보기
            </Link>
          )}
          <span className="text-caption text-text-muted">
            승인·배포는 바뀌지 않았습니다 — 콘솔에서 설계한 것이 저절로 현장에 가지 않습니다.
          </span>
        </>
      ) : (
        // 사유 한 줄 먼저, 상세는 그 아래 (U13).
        <span className="text-status-failed-fg">{build.reason || "짓지 못했습니다"}</span>
      )}
    </div>
  );
}
