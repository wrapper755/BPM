import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ErrorBanner } from "@bpm/ui";
import type { FileInfo } from "@bpm/api-types/c17-file-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { firstOpen } from "@/lib/workspaces";
import { Workspace } from "./editor";

/**
 * CON-20b 작업공간 — **본문을 가득 쓴다** (ADR-0145 §3).
 *
 * 서버 쪽은 **재료만 모은다**: 작업공간 하나, 파일 목록, 처음 열 파일의 본문. 고르고 고치는 일은
 * 브라우저에서 돌고(캔버스가 거기 산다), 그 뒤의 읽기·쓰기는 서버 액션이 한다 — **브라우저는
 * Center를 직접 부르지 않는다** (ADR-0017 §1).
 */
export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const found = await session();
  if (!found) redirect("/login");
  const { workspaceId } = await params;

  let info: WorkspaceInfo;
  let files: FileInfo[] = [];
  try {
    info = await center.workspace(workspaceId);
    files = await center.workspaceFiles(workspaceId);
  } catch (cause) {
    // 남의 회사 것도 404다 — **있다는 것조차 알리지 않는다** (C16·C17).
    if (cause instanceof CenterError && cause.status === 404) notFound();
    return (
      <Shell mode={found.mode} actor={found.actor} current="/workspaces">
        <ErrorBanner message={cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다"} />
      </Shell>
    );
  }

  // 업무 자리를 고르는 거리 (C16) — **없어도 화면은 뜬다**(조직이 비어 있을 수 있다).
  const [departments, staff] = await Promise.all([
    center.departments().catch(() => []),
    center.staffList().catch(() => []),
  ]);

  const opened = firstOpen(files, info.entry);
  let text = "";
  let revision = "";
  if (opened) {
    const file = await center.readWorkspaceFile(workspaceId, opened);
    text = file.text;
    revision = file.revision;
  }

  return (
    <Shell
      mode={found.mode}
      actor={found.actor}
      current="/workspaces"
      full
      crumb={
        <>
          <Link href="/workspaces" className="hover:underline">
            작업공간
          </Link>
          <span className="text-text-muted"> › </span>
          {info.name}
        </>
      }
    >
      <Workspace
        info={info}
        files={files}
        opened={opened}
        text={text}
        revision={revision}
        canWrite={found.mode === "admin"}
        departments={departments.map((one) => ({ id: one.id, name: one.name }))}
        staff={staff.map((one) => ({ id: one.id, name: one.name }))}
      />
    </Shell>
  );
}
