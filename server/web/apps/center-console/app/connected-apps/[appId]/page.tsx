import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Button, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { ExtensionResource } from "@bpm/api-types/c7-extension-resource";
import type { ServiceAppResource } from "@bpm/api-types/c7-service-app-resource";
import { CenterError, center, session } from "@/lib/center";
import {
  IMPL_HINT,
  IMPL_LABEL,
  addressSetting,
  addressView,
  filterOperations,
  groupOperations,
  kindLabel,
  modesLabel,
  readDefinition,
  readServiceApp,
  statusLabel,
  statusWhy,
  workersOf,
  type OperationRow,
  type SchemaField,
} from "@/lib/connected-apps";
import { Shell } from "@/components/Shell";
import { OperationTree } from "./tree";
import { Hint, SOURCE_NOTE, connectedAppHref, time } from "../page";

/**
 * CON-17 연결 앱 (상세) — 앱 하나의 작업 표와 작업별 일감 집계 (C15 `TopicOperationStatus`, ADR-0137).
 *
 * 외부 정의(C13)면 정의에서, 일꾼 앱(C11)이면 manifest에서 작업을 읽는다. 「찾기」는 주소 `?q=`에 남고
 * JS 없이 돈다. 집계를 못 읽으면 작업만 그린다 (일감 열은 「—」).
 */

const NONE = <span className="text-text-muted">—</span>;

/** 입력·출력 칸 표 — 칸이 없으면 「칸 없음」. */
function Fields({ title, fields }: { title: string; fields: SchemaField[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm font-semibold text-text-secondary">{title}</span>
      {fields.length === 0 ? (
        <span className="text-body-sm text-text-muted">칸 없음</span>
      ) : (
        <table className="text-body-sm">
          <tbody>
            {fields.map((one) => (
              <tr key={one.name} className="align-top">
                <td className="pr-3 font-mono">
                  {one.name}
                  {one.required ? <span className="text-status-failed-fg"> *</span> : null}
                </td>
                <td className="pr-3 font-mono text-text-muted">{one.type}</td>
                <td className="text-text-secondary">{one.description ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * 「작업」 칸 — **이름 먼저**, 설명은 아래에 작게. 작업은 API라 부르는 이름(그림의 `operation`)이 곧 식별자다.
 * 누르면 그 자리에서 입출력이 펼쳐진다.
 */
function OperationCell({ row }: { row: OperationRow }) {
  return (
    <details className="py-1">
      <summary className="flex cursor-pointer flex-col">
        <span className="font-mono">{row.name}</span>
        {row.description ? <span className="text-body-sm text-text-muted">{row.description}</span> : null}
      </summary>
      <div className="mt-2 flex flex-col gap-3 border-l-2 border-border-default pl-3">
        <Fields title="입력" fields={row.input} />
        <Fields title="출력" fields={row.output} />
        {row.keywords.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-body-sm font-semibold text-text-secondary">키워드</span>
            <span className="text-body-sm">{row.keywords.join(", ")}</span>
          </div>
        ) : null}
        {row.request ? (
          <div className="flex flex-col gap-1">
            <span className="text-body-sm font-semibold text-text-secondary">요청</span>
            <span className="font-mono text-body-sm">{row.request}</span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function count(row: OperationRow, pick: (c: NonNullable<OperationRow["counts"]>) => number | undefined): ReactNode {
  return row.counts === null ? NONE : String(pick(row.counts) ?? 0);
}

/** 앱 하나 — 외부 정의가 있으면 그것, 없으면 일꾼 앱. 둘 다 없으면 null. */
async function findApp(id: string): Promise<{ external: ExtensionResource | null; worker: ServiceAppResource | null }> {
  const external = await center.extension(id).catch((cause: unknown) => {
    if (cause instanceof CenterError && cause.status === 404) return null;
    throw cause;
  });
  if (external && external.tier === "external") return { external, worker: null };
  const worker = await center.serviceApp(id).catch((cause: unknown) => {
    if (cause instanceof CenterError && cause.status === 404) return null;
    throw cause;
  });
  return { external: null, worker };
}

export default async function ConnectedAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const { appId } = await params;
  const id = decodeURIComponent(appId);
  const query = (await searchParams).q ?? "";

  let app: Awaited<ReturnType<typeof findApp>> = { external: null, worker: null };
  let failure: string | null = null;
  let workers: string[] | null = null;
  let reported: { base_url?: string | null; test_base_url?: string | null } | null = null;
  let counts: Awaited<ReturnType<typeof center.topicOperations>> | null = null;
  try {
    const [one, consumers, ops] = await Promise.all([
      findApp(id),
      center.consumers().catch(() => null),
      center.topicOperations(id).catch(() => null),
    ]);
    app = one;
    workers = consumers ? workersOf(consumers, id) : null;
    // 그 토픽을 맡은 일꾼이 알린 주소 (C15 `address`) — 여럿이면 처음 것.
    reported = consumers?.map((c) => c.addresses?.[id]).find((c) => c !== undefined) ?? null;
    counts = ops;
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const shell = (children: ReactNode) => (
    <Shell mode={found.mode} actor={found.actor} current="/connected-apps">
      {children}
    </Shell>
  );

  if (failure) return shell(<ErrorBanner message={failure} />);
  const { external, worker } = app;
  if (!external && !worker) {
    return shell(
      <EmptyState
        title={`연결된 앱이 아닙니다: ${id}`}
        action={
          <Link className="underline" href="/connected-apps">
            연결 앱 목록으로
          </Link>
        }
      />,
    );
  }

  const impl = external ? "external" : "worker";
  const head = external ? readDefinition(external.definition, counts) : readServiceApp(worker!, counts);
  const name = (external ? external.name : worker!.name) ?? id;
  const version = (external ? external.version : worker!.version) ?? "—";
  const status = external ? external.status : worker!.status;
  const rows = filterOperations(head.operations, query);
  const sections = groupOperations(rows, head.groups);
  const address = external ? addressView(head.baseUrl, reported) : null;
  const days = counts?.[0]?.recent_days ?? 7;

  const columns: Array<Column<OperationRow>> = [
    { key: "operation", header: "작업", cell: (row) => <OperationCell row={row} /> },
    { key: "kind", header: "종류", width: "6ch", cell: (row) => kindLabel(row.kind) },
    { key: "modes", header: "수행 모드", width: "10ch", cell: (row) => modesLabel(row.modes) },
    // 일꾼 앱(C11)에는 그 칸이 없다 — 열을 두지 않는다.
    ...(external
      ? [
          {
            key: "idempotent",
            header: "다시 불러도 됨",
            width: "11ch",
            cell: (row: OperationRow) => (
              <span title="아니오면 결과를 모르는 실패를 자동으로 다시 부르지 않습니다">
                {row.idempotent ? "예" : "아니오"}
              </span>
            ),
          },
        ]
      : []),
    { key: "waiting", header: "기다림", width: "8ch", align: "right", cell: (row) => count(row, (c) => c.waiting) },
    { key: "working", header: "처리 중", width: "8ch", align: "right", cell: (row) => count(row, (c) => c.working) },
    {
      key: "completed",
      header: `${days}일 끝남`,
      width: "9ch",
      align: "right",
      cell: (row) => count(row, (c) => c.completed_recent),
    },
    {
      key: "failed",
      header: `${days}일 실패`,
      width: "9ch",
      align: "right",
      cell: (row) => {
        const failed = row.counts?.failed_recent ?? 0;
        if (row.counts === null) return NONE;
        if (failed === 0) return "0";
        return (
          <span
            className="text-status-warning-fg"
            title={row.counts.last_error_code ? `마지막 오류: ${row.counts.last_error_code}` : undefined}
          >
            {failed}
          </span>
        );
      },
    },
    {
      key: "last_finished_at",
      header: "마지막으로 끝난 때",
      width: "20ch",
      cell: (row) => (row.counts?.last_finished_at ? time(row.counts.last_finished_at) : NONE),
    },
  ];

  return shell(
    <>
      <header className="mb-4 flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-h1 font-bold">{name}</h1>
          <span className="font-mono text-body-sm text-text-muted" title={external?.definition_hash ?? undefined}>
            {id}@{version}
          </span>
          <span className="text-body-sm text-text-secondary" title={IMPL_HINT[impl]}>
            {IMPL_LABEL[impl]}
          </span>
          <Hint text={SOURCE_NOTE} />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
          {external ? <span>만든 곳 {external.publisher ?? "—"}</span> : null}
          <span>맡은 일꾼 {workers && workers.length > 0 ? workers.join(", ") : "—"}</span>
          {address ? (
            <span className="inline-flex items-center gap-1" title={address.note ?? undefined}>
              쓰는 주소 <span className="font-mono">{address.url ?? "—"}</span>
              <span className="text-caption text-text-muted">({address.source})</span>
              <Hint
                text={`주소는 맡은 일꾼의 설정 ${addressSetting(id)}에서 바꿉니다 (정의의 허용 호스트 안에서만). 바꾼 뒤 일꾼을 다시 띄우면 여기 보입니다.`}
              />
            </span>
          ) : null}
          {head.auth ? <span>인증 {head.auth}</span> : null}
          <span title={statusWhy(status)}>
            <StatusBadge group="서비스 앱" label={statusLabel(status)} />
          </span>
        </p>
      </header>

      <form className="filter-card flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-body-sm">
          찾기
          <input
            name="q"
            defaultValue={query}
            placeholder="작업 이름·설명·키워드"
            className="h-9 w-72 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
        <Link
          href={connectedAppHref(id)}
          className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-body text-text-secondary hover:bg-bg-subtle"
        >
          초기화
        </Link>
        <Button type="submit" variant="secondary">
          좁히기
        </Button>
      </form>

      {counts === null ? <ErrorBanner message="일감 집계를 읽지 못했습니다" /> : null}

      <h2 className="mb-2 mt-4 text-h2 font-semibold">
        작업 {rows.length} / {head.operations.length}
      </h2>
      {rows.length === 0 ? (
        <EmptyState title={query ? `「${query}」에 맞는 작업이 없습니다.` : "작업이 없습니다."} />
      ) : (
        <OperationTree
          columns={columns}
          rows={rows}
          sections={sections}
          caption={`${name} 작업`}
          // 기다림·실패가 있는 묶음과 찾기에 걸린 묶음은 펼쳐서 연다 (CON-17).
          openOf={(one) => Boolean(query) || one.waiting > 0 || one.failed > 0}
          groupCells={(one) =>
            counts === null
              ? {}
              : {
                  waiting: one.waiting,
                  working: one.working,
                  completed: one.completed,
                  failed: <span className={one.failed > 0 ? "text-status-warning-fg" : undefined}>{one.failed}</span>,
                  last_finished_at: one.lastFinished ? time(one.lastFinished) : NONE,
                }
          }
        />
      )}
    </>,
  );
}
