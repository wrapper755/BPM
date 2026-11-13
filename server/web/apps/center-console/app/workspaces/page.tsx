import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, ErrorBanner } from "@bpm/ui";
import type { WorkspaceInfo } from "@bpm/api-types/c17-workspace-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { fullTime } from "@/lib/time";
import { NewWorkspace } from "./tools";

/**
 * CON-20a 작업공간 홈 — **설계자의 첫 화면**이다 ([ADR-0143](../../../../docs/decisions/0143-design-happens-in-the-console.md)).
 *
 * 카드에 **배포 상태를 적지 않는다** — 작업공간과 배포된 패키지는 다른 것이라(C17: 작업공간을
 * 지워도 패키지는 그대로다) 「배포됨」이라 말하면 **작업공간을 고치면 현장이 바뀌는 것처럼** 읽힌다.
 * 지은 뒤의 일은 CON-06·CON-15가 말한다.
 */
export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const found = await session();
  if (!found) redirect("/login");
  const { q } = await searchParams;

  let rows: WorkspaceInfo[] = [];
  let failure: string | null = null;
  try {
    rows = await center.workspaces(q ? { q } : {});
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  return (
    <Shell mode={found.mode} actor={found.actor} current="/workspaces">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 font-bold">작업공간</h1>
        {found.mode === "admin" ? <NewWorkspace /> : null}
      </header>

      <form className="filter-card flex flex-wrap items-end gap-3" action="/workspaces">
        <label className="flex flex-col gap-1 text-body-sm">
          이름으로 찾기
          <input
            name="q"
            defaultValue={q ?? ""}
            className="h-9 border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Link href="/workspaces" className="self-end text-body-sm text-text-muted hover:underline">
            초기화
          </Link>
          <button type="submit" className="h-9 bg-primary px-3 text-body-sm font-semibold text-primary-fg">
            좁히기
          </button>
        </div>
      </form>

      {failure ? <ErrorBanner message={failure} /> : null}
      {!failure && rows.length === 0 ? (
        <EmptyState
          title={q ? "조건에 맞는 작업공간이 없습니다." : "작업공간이 없습니다."}
          hint={
            found.mode === "admin"
              ? "「새 작업공간」으로 만들거나, 밖에서 그린 그림을 「파일에서 가져오기」로 들이세요."
              : "설계는 관리자 계정이 합니다."
          }
        />
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((one) => (
          <li key={one.id}>
            <Link
              href={`/workspaces/${encodeURIComponent(one.id)}`}
              className="flex h-full flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 hover:border-primary"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-body-lg font-semibold">{one.name}</span>
                <span className="text-body-sm text-text-muted">v{one.version}</span>
              </span>
              {one.description ? <span className="text-body-sm text-text-secondary">{one.description}</span> : null}
              {one.place ? (
                <span className="text-caption text-text-muted">
                  {[one.place.company, one.place.department, one.place.staff].filter(Boolean).join(" › ")}
                </span>
              ) : null}
              <span className="mt-auto text-caption text-text-muted" title={one.id}>
                {fullTime(one.updated_at)} · {one.updated_by}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
