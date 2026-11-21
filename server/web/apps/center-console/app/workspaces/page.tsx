import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, ErrorBanner } from "@bpm/ui";
import type { ProjectInfo } from "@bpm/api-types/c17-project-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { time } from "@/lib/time";
import { AutoFilter } from "@/components/AutoFilter";
import { FilterReset } from "@/components/FilterReset";
import { NewProject } from "./tools";
import { ART } from "@/components/empty-art";

/**
 * CON-20a 프로젝트 홈 — **저작하는 사람이 들어오는 자리**다 ([ADR-0175](../../../../docs/decisions/0175-projects-hold-processes.md)).
 *
 * 프로젝트가 프로세스(작업공간)를 묶고 회사를 정한다 — 한 회사가 프로젝트를 여럿 한다.
 * 카드에 **배포 상태를 적지 않는다** — 프로세스와 배포된 패키지는 다른 것이다(C17). 지은 뒤의 일은
 * CON-06·CON-15가 말한다.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const found = await session();
  if (!found) redirect("/login");
  const { q } = await searchParams;

  let rows: ProjectInfo[] = [];
  let failure: string | null = null;
  try {
    rows = await center.projects(q ? { q } : {});
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }
  // 회사 이름 — 회사가 정해진 계정은 고를 것이 없다(제 회사다, C16). 못 읽어도 카드는 id로 선다.
  const companies = await center.companies().catch(() => []);
  const companyName = new Map(companies.map((one) => [one.id, one.name]));

  return (
    <Shell mode={found.mode} actor={found.actor} current="/workspaces">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold">프로젝트</h1>
        {found.mode === "admin" ? (
          <NewProject companies={found.company ? [] : companies.map((one) => ({ id: one.id, name: one.name }))} />
        ) : null}
      </header>

      {/* 치는 대로 든다(ADR-0165), ↺는 칸 바로 옆 (ADR-0171 — CON-02와 같은 결). */}
      <AutoFilter clear="inline">
        <div className="filter-field">
          <label htmlFor="projects-q">이름</label>
          <span className="flex items-center gap-1">
            <input
              id="projects-q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="(전체)"
              className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
            />
            <FilterReset href="/workspaces" />
          </span>
        </div>
      </AutoFilter>

      {failure ? <ErrorBanner message={failure} /> : null}
      {!failure && rows.length === 0 ? (
        <EmptyState
          art={q ? ART.search : ART.projects}
          title={q ? "조건에 맞는 프로젝트가 없습니다." : "프로젝트가 없습니다."}
          hint={q ? "거르기를 초기화하세요." : found.mode === "admin" ? "「새 프로젝트」로 만드세요." : "저작은 관리자 계정이 합니다."}
        />
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((one) => (
          <li key={one.id}>
            <Link
              href={`/workspaces/projects/${encodeURIComponent(one.id)}`}
              className="flex h-full flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 hover:border-primary"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-body-lg font-semibold">{one.name}</span>
                <span className="whitespace-nowrap text-body-sm text-text-muted">프로세스 {one.processes}
                  {one.shared ? ` · 공통 ${one.shared}` : ""}
                </span>
              </span>
              {one.description ? <span className="text-body-sm text-text-secondary">{one.description}</span> : null}
              {/* 회사의 기본 프로젝트는 회사 이름을 그대로 쓴다(`projects.default_for`) — 같은 글자를 두 번 세우지 않는다. */}
              {(companyName.get(one.company) ?? one.company) === one.name ? null : (
                <span className="text-caption text-text-muted">{companyName.get(one.company) ?? one.company}</span>
              )}
              <span className="mt-auto text-caption text-text-muted" title={one.id}>
                최근 수정 {time(one.updated_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
