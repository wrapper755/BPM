import { notFound, redirect } from "next/navigation";
import { ErrorBanner } from "@bpm/ui";
import type { ProjectInfo } from "@bpm/api-types/c17-project-info";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { ProcessRows } from "./table";
import { ProjectMenu } from "./tools";

/**
 * CON-20c 프로젝트 — 그 안의 「프로세스」와 「공통 패키지」 두 탭 (ADR-0176) ([ADR-0175](../../../../../../../docs/decisions/0175-projects-hold-processes.md)).
 *
 * 표는 프로세스마다 배포·마지막 시험·검사를 말한다 (ADR-0185) — 호출은 **둘**이다(C17 요약, C5 살아 있는 배포).
 * 작업공간마다 묻지 않는다. 거르기는 브라우저에서 돈다 — 한 프로젝트의 프로세스는 수십 개다 (ADR-0160과 같은 결).
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const { projectId } = await params;
  const { q, tab } = await searchParams;

  let project: ProjectInfo;
  let rows: WorkspaceInfo[] = [];
  try {
    [project, rows] = await Promise.all([center.project(projectId), center.projectWorkspaces(projectId)]);
  } catch (cause) {
    // 남의 회사 것도 404다 — **있다는 것조차 알리지 않는다** (C16·C17).
    if (cause instanceof CenterError && cause.status === 404) notFound();
    return (
      <Shell mode={found.mode} actor={found.actor} current="/workspaces" here={projectId}>
        <ErrorBanner message={cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다"} />
      </Shell>
    );
  }
  // 요약을 못 읽어도 표는 선다 — 그 세 열이 「—」가 된다.
  const [companies, all, status, deployments] = await Promise.all([
    center.companies().catch(() => []),
    center.projects().catch(() => []),
    center.projectStatus(projectId).catch(() => null),
    center.deployments({ active: true }).catch(() => null),
  ]);
  const company = companies.find((one) => one.id === project.company)?.name ?? project.company;
  // 옮길 곳은 **같은 회사의 다른 프로젝트**뿐이다 (C17 422 `company_mismatch`).
  const targets = all
    .filter((one) => one.company === project.company && one.id !== project.id)
    .map((one) => ({ id: one.id, name: one.name }));
  const admin = found.mode === "admin";

  return (
    <Shell mode={found.mode} actor={found.actor} current="/workspaces" here={project.name}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold">{project.name}</h1>
        {admin ? (
          <div className="flex flex-wrap items-center gap-2">
            <ProjectMenu project={project} />
          </div>
        ) : null}
      </header>

      {/* [I] 정보 — 한 줄 카드. 회사는 바뀌지 않는다 (ADR-0175 §2). 수는 탭 이름에 있다. */}
      <section className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border-default bg-bg-surface px-4 py-3 text-body-sm">
        <span>
          <span className="text-text-muted">회사 </span>
          {company}
        </span>
        <span className="font-mono text-text-muted">{project.id}</span>
        {project.description ? <span className="text-text-secondary">{project.description}</span> : null}
      </section>

      <ProcessRows
        rows={rows}
        status={status}
        deployments={deployments}
        projectId={project.id}
        targets={targets}
        admin={admin}
        query={q ?? ""}
        initialTab={tab === "shared" ? "shared" : "processes"}
      />
    </Shell>
  );
}
