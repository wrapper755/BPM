import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Button, DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { TopicStatus } from "@bpm/api-types/c15-topic-status";
import { CenterError, center, session } from "@/lib/center";
import {
  IMPL_HINT,
  IMPL_LABEL,
  connectedApps,
  filterApps,
  groupApps,
  kindsLabel,
  statusLabel,
  statusWhy,
  workersOf,
  type ConnectedApp,
} from "@/lib/connected-apps";
import { Shell } from "@/components/Shell";

/**
 * CON-17 연결 앱 (목록) — 앱 하나 = 토픽 하나 (ADR-0137, Camunda 커넥터 목록과 같은 결).
 *
 * 외부 정의(C13)와 일꾼 앱(C11)을 한 목록에 두고 앱 묶음(`app_group`)으로 묶는다. **보기만 한다.**
 * 맡은 일꾼·토픽 상태를 못 받아도 앱 목록은 그린다 — 그 칸만 「—」다.
 */

/** 정의 고치기·내리기는 일꾼 쪽이다 (ADR-0122) — 제목 옆 툴팁에만 둔다. */
export const SOURCE_NOTE =
  "연결 앱은 그것을 맡은 일꾼이 뜰 때 올립니다(외부 정의는 Center가 서명합니다). 고치거나 내리려면 일꾼 쪽 정의·설정을 바꿉니다.";

/** 연도까지 적는다 (CON-03과 같은 규칙). */
export function time(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at.toLocaleString("ko-KR");
}

export function connectedAppHref(id: string): Route {
  return `/connected-apps/${encodeURIComponent(id)}` as Route;
}

/** 제목 옆 「?」 — 긴 설명은 툴팁으로. */
export function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex size-5 cursor-help items-center justify-center rounded-full border border-border-strong text-caption text-text-secondary"
    >
      ?
    </span>
  );
}

interface Row {
  app: ConnectedApp;
  workers: string[] | null;
  topic: TopicStatus | null;
  topicsRead: boolean;
}

export default async function ConnectedAppsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const found = await session();
  if (!found) redirect("/login");
  const query = (await searchParams).q ?? "";

  let all: Row[] = [];
  let failure: string | null = null;
  try {
    const [extensions, serviceApps, consumers, topics] = await Promise.all([
      center.extensions(),
      center.serviceApps(),
      center.consumers().catch(() => null),
      center.externalTopics().catch(() => null),
    ]);
    // 외부 정의 앱의 실제 종류는 일꾼 manifest에 있다 — 그 토픽의 집계 줄이 실어 온다 (C15).
    const external = extensions.filter((one) => one.tier === "external");
    const counted = await Promise.all(
      external.map(async (one) => [one.id, await center.topicOperations(one.id).catch(() => [])] as const),
    );
    all = connectedApps(extensions, serviceApps, new Map(counted)).map((app) => ({
      app,
      workers: consumers ? workersOf(consumers, app.id) : null,
      topic: topics?.find((one) => one.topic === app.id) ?? null,
      topicsRead: topics !== null,
    }));
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }
  const shown = new Set(filterApps(all.map((row) => row.app), query).map((one) => one.id));
  const rows = all.filter((row) => shown.has(row.app.id));
  const sections = groupApps(rows.map((row) => row.app));
  const rowOf = new Map(rows.map((row) => [row.app.id, row]));

  const columns: Array<Column<Row>> = [
    {
      key: "name",
      header: "이름",
      cell: (row) => (
        <Link className="flex flex-col py-1" href={connectedAppHref(row.app.id)}>
          <span className="underline">{row.app.name}</span>
          <span className="font-mono text-caption text-text-muted">{row.app.id}</span>
        </Link>
      ),
    },
    {
      key: "impl",
      header: "구현",
      width: "10ch",
      cell: (row) => <span title={IMPL_HINT[row.app.impl]}>{IMPL_LABEL[row.app.impl]}</span>,
    },
    { key: "kinds", header: "종류", width: "10ch", cell: (row) => kindsLabel(row.app.kinds) },
    { key: "version", header: "버전", width: "10ch", mono: true, cell: (row) => row.app.version ?? "—" },
    {
      key: "workers",
      header: "맡은 일꾼",
      width: "14ch",
      cell: (row) => (row.workers === null || row.workers.length === 0 ? "—" : row.workers.join(", ")),
    },
    { key: "operations", header: "작업", width: "7ch", align: "right", cell: (row) => String(row.app.operations) },
    {
      key: "status",
      header: "상태",
      width: "11ch",
      cell: (row) => (
        <span title={statusWhy(row.app.status)}>
          <StatusBadge group="서비스 앱" label={statusLabel(row.app.status)} />
        </span>
      ),
    },
    {
      key: "waiting",
      header: "기다리는 일감",
      width: "11ch",
      align: "right",
      cell: (row) => (row.topicsRead ? String(row.topic?.waiting ?? 0) : "—"),
    },
    {
      key: "last_fetch_at",
      header: "마지막으로 가져간 때",
      width: "20ch",
      cell: (row) => time(row.topic?.last_fetch_at),
    },
  ];

  const table = (list: Row[], caption: string, className?: string) => (
    <DataTable columns={columns} rows={list} rowKey={(row) => row.app.id} caption={caption} className={className} />
  );

  return (
    <Shell mode={found.mode} actor={found.actor} current="/connected-apps">
      <header className="mb-4 flex items-center gap-2">
        <h1 className="text-h1 font-bold">연결 앱</h1>
        <Hint text={SOURCE_NOTE} />
      </header>

      <form className="filter-card flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-body-sm">
          찾기
          <input
            name="q"
            defaultValue={query}
            placeholder="앱 이름·id·키워드"
            className="h-9 w-72 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
        <Link
          href="/connected-apps"
          className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-body text-text-secondary hover:bg-bg-subtle"
        >
          초기화
        </Link>
        <Button type="submit" variant="secondary">
          좁히기
        </Button>
      </form>

      <div className="mt-4">
        {failure ? (
          <ErrorBanner message={failure} />
        ) : all.length === 0 ? (
          <EmptyState title="연결된 앱이 없습니다." hint="앱은 그것을 맡은 일꾼이 뜰 때 올립니다." />
        ) : rows.length === 0 ? (
          <EmptyState title={`「${query}」에 맞는 앱이 없습니다.`} />
        ) : sections === null ? (
          table(rows, "연결 앱 목록")
        ) : (
          <div className="flex flex-col gap-2">
            {sections.map((one) => (
              <details key={one.id ?? "-"} open className="rounded-lg border border-border-default bg-bg-surface">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-2">
                  <span className="font-semibold">{one.name}</span>
                  <span className="text-body-sm text-text-secondary">앱 {one.apps.length}</span>
                </summary>
                {table(
                  one.apps.flatMap((app) => rowOf.get(app.id) ?? []),
                  `${one.name} 앱`,
                  "rounded-none border-x-0 border-b-0 shadow-none",
                )}
              </details>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
