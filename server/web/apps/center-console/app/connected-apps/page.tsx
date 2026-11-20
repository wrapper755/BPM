import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { DataTable, EmptyState, ErrorBanner, InfoTip, StatusBadge, type Column } from "@bpm/ui";
import type { TopicStatus } from "@bpm/api-types/c15-topic-status";
import { CenterError, center, session } from "@/lib/center";
import { time } from "@/lib/time";
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
import type { ExtensionResource } from "@bpm/api-types/c7-extension-resource";
import { SOURCE_HINT, SOURCE_LABEL, appGroupsOf, untestableReason } from "@/lib/adapter-editor";
import { AppActions, NewAppButton, type AppContext, type WorkerChoice } from "./editor";
import { AutoFilter } from "@/components/AutoFilter";

/**
 * CON-18 앱 (목록) — 앱 하나 = 토픽 하나 (ADR-0138, Camunda 커넥터 목록과 같은 결).
 *
 * 외부 정의(C13)와 일꾼 앱(C11)을 한 목록에 두고 앱 묶음(`app_group`)으로 묶는다. 원본이 콘솔인 HTTP 어댑터 앱만
 * Center 관리자가 만들고 고친다(ADR-0141 — 「새 앱...」·줄의 「...」). 나머지는 보기만 한다.
 * 맡은 일꾼·토픽 상태를 못 받아도 앱 목록은 그린다 — 그 칸만 「—」다.
 */

/** 원본이 둘이다 (ADR-0122·0141) — 제목 옆 툴팁에만 둔다. */
export const SOURCE_NOTE =
  "원본이 「콘솔」인 앱은 여기서 만들고 고칩니다(Center가 서명합니다). 원본이 「일꾼」인 앱은 맡은 일꾼이 뜰 때 올립니다 — 고치거나 내리려면 일꾼 쪽 정의·설정을 바꿉니다.";


export function connectedAppHref(id: string): Route {
  return `/connected-apps/${encodeURIComponent(id)}` as Route;
}

/** 제목 옆 「?」 — 긴 설명은 눌러 펴는 「?」로 (U20, ADR-0162 — 말풍선은 휴대폰에서 안 뜬다). */
export function Hint({ text, label = "설명" }: { text: string; label?: string }) {
  return <InfoTip label={label}>{text}</InfoTip>;
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
  const manage = found.mode === "admin" && !found.company;

  let all: Row[] = [];
  let failure: string | null = null;
  let workers: WorkerChoice[] | null = null;
  let groups: AppContext["groups"] = [];
  const definitionOf = new Map<string, ExtensionResource>();
  try {
    const [extensions, serviceApps, consumers, topics] = await Promise.all([
      center.extensions(),
      center.serviceApps(),
      center.consumers().catch(() => null),
      center.externalTopics().catch(() => null),
    ]);
    // 외부 정의 앱의 실제 종류는 일꾼 manifest에 있다 — 그 토픽의 집계 줄이 실어 온다 (C15).
    const external = extensions.filter((one) => one.tier === "external");
    for (const one of external) definitionOf.set(one.id, one);
    groups = appGroupsOf(external.map((one) => one.definition));
    workers = consumers?.map((one) => ({ consumer_id: one.consumer_id, name: one.name, topics: one.topics ?? [] })) ?? null;
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
          <span className="font-medium text-text-primary hover:text-primary">{row.app.name}</span>
          <span className="font-mono text-caption text-text-muted">{row.app.id}</span>
        </Link>
      ),
    },
    {
      key: "impl",
      header: "구현",
      width: "10ch",
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          {IMPL_LABEL[row.app.impl]}
          <InfoTip label="구현 설명">{IMPL_HINT[row.app.impl]}</InfoTip>
        </span>
      ),
    },
    {
      key: "source",
      header: "원본",
      width: "7ch",
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          {SOURCE_LABEL[row.app.source]}
          <InfoTip label="원본 설명">{SOURCE_HINT[row.app.source]}</InfoTip>
        </span>
      ),
    },
    { key: "kinds", header: "종류", width: "10ch", cell: (row) => kindsLabel(row.app.kinds) },
    { key: "version", header: "버전", width: "10ch", cell: (row) => row.app.version ?? "—" },
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
      cell: (row) => {
        // 상태의 까닭은 눌러 펴는 「?」에 (U20, ADR-0162).
        const why = statusWhy(row.app.status);
        return (
          <span className="inline-flex items-center gap-1">
            <StatusBadge group="서비스 앱" label={statusLabel(row.app.status)} />
            {why ? <InfoTip label="상태 설명">{why}</InfoTip> : null}
          </span>
        );
      },
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
    // 원본이 콘솔인 줄만 — 편집·시험 호출·내리기 (Center 관리자만, ADR-0141).
    ...(manage
      ? [
          {
            key: "actions",
            header: "",
            width: "6ch",
            cell: (row: Row) => {
              const resource = definitionOf.get(row.app.id);
              if (row.app.source !== "console" || !resource) return null;
              const context: AppContext = {
                id: row.app.id,
                version: resource.version,
                definition: resource.definition,
                groups,
                workers,
                untestable: untestableReason(row.workers, row.app.status),
              };
              return <AppActions app={context} variant="row" />;
            },
          },
        ]
      : []),
  ];

  const table = (list: Row[], caption: string, className?: string) => (
    <DataTable columns={columns} rows={list} rowKey={(row) => row.app.id} caption={caption} numbered className={className} />
  );

  return (
    <Shell mode={found.mode} actor={found.actor} current="/connected-apps">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-h2 font-bold">앱</h1>
        <Hint text={SOURCE_NOTE} />
        {manage ? (
          <span className="ml-auto">
            <NewAppButton groups={groups} workers={workers} />
          </span>
        ) : null}
      </header>

      {/* 고르는 대로 든다 — 「좁히기」가 없다 (ADR-0165). */}
      <AutoFilter>
        <label className="filter-field">
          찾기
          <input
            name="q"
            defaultValue={query}
            placeholder="앱 이름·id·키워드"
            className="h-9 w-72 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
      </AutoFilter>

      <div className="mt-4">
        {failure ? (
          <ErrorBanner message={failure} />
        ) : all.length === 0 ? (
          <EmptyState
            title="연결된 앱이 없습니다."
            hint={
              manage
                ? "「새 앱...」으로 HTTP 어댑터 앱을 만들거나, 앱을 맡은 일꾼이 뜰 때 올립니다."
                : "앱은 그것을 맡은 일꾼이 뜰 때 올립니다."
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title={`「${query}」에 맞는 앱이 없습니다.`} />
        ) : sections === null ? (
          table(rows, "앱 목록")
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
