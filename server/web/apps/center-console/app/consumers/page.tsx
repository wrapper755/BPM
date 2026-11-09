import { redirect } from "next/navigation";
import { DataTable, EmptyState, ErrorBanner, type Column } from "@bpm/ui";
import type { ConsumerInfo } from "@bpm/api-types/c15-consumer-info";
import { CenterError, center, session } from "@/lib/center";
import { KINDS_UNSET, cameFrom, kindMismatches, kindsLabel, type AppChoice } from "@/lib/consumers";
import { connectedApps, kindsLabel as appKindsLabel, workersOf } from "@/lib/connected-apps";
import { Shell } from "@/components/Shell";
import { fullTime } from "@/app/bot-uis/page";
import { ConsumerMenu, NewConsumer } from "./tools";

/**
 * CON-17 일꾼 (ADR-0137). 「종류」는 Center 관리자가 정하고, 토픽의 작업과 어긋나면 ⚠ (ADR-0139). 일꾼의 원본은 Center DB이고 바꾼 것은 **다음 요청부터** 반영된다 — Center를
 * 다시 띄우지 않는다. 목록은 콘솔 계정 모두, 「새 일꾼...」·「...」는 **Center 관리자만**(일꾼은 Center 공용, C16).
 */
export default async function ConsumersPage() {
  const found = await session();
  if (!found) redirect("/login");
  const manage = found.mode === "admin" && !found.company;

  let rows: ConsumerInfo[] = [];
  let failure: string | null = null;
  try {
    rows = await center.consumers();
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }
  // 「맡을 연결 앱」 — 토픽은 곧 연결 앱 id다(CON-18과 같은 재료). 못 읽으면 직접 적기만 된다.
  let apps: AppChoice[] | null = null;
  if (manage) {
    try {
      const [extensions, serviceApps] = await Promise.all([center.extensions(), center.serviceApps()]);
      apps = connectedApps(extensions, serviceApps).map((one) => ({
        id: one.id,
        name: one.name,
        kinds: appKindsLabel(one.kinds),
        workers: workersOf(rows, one.id),
      }));
    } catch {
      apps = null;
    }
  }

  const columns: Array<Column<ConsumerInfo>> = [
    { key: "name", header: "이름" },
    { key: "topics", header: "토픽", mono: true, cell: (row) => (row.topics ?? []).join(", ") },
    {
      key: "kinds",
      header: "종류",
      width: "14ch",
      cell: (row) => {
        const unset = !row.kinds || row.kinds.length === 0;
        const mismatches = kindMismatches(row.kinds, row.topic_kinds);
        return (
          <span className="flex items-center gap-1">
            <span className={unset ? "text-text-muted" : undefined} title={unset ? KINDS_UNSET : undefined}>
              {kindsLabel(row.kinds)}
            </span>
            {mismatches.length ? (
              <span className="text-status-warning-fg" title={mismatches.join("\n")} aria-label={mismatches.join(" ")}>
                ⚠
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "apps",
      header: "맡은 앱",
      mono: true,
      cell: (row) => ((row.apps ?? []).length ? (row.apps ?? []).join(", ") : "—"),
    },
    {
      key: "last_fetch_at",
      header: "마지막 가져감",
      width: "18ch",
      cell: (row) => (row.last_fetch_at ? fullTime(row.last_fetch_at) : "아직 없음"),
    },
    {
      key: "source",
      header: "들어온 길",
      width: "20ch",
      cell: (row) => (
        <span className="flex flex-col">
          {cameFrom(row.source, row.approved_by)}
          <span className="text-caption text-text-muted">{fullTime(row.approved_at)}</span>
        </span>
      ),
    },
    ...(manage
      ? [
          {
            key: "actions",
            header: "",
            width: "6ch",
            cell: (row: ConsumerInfo) => (
              <ConsumerMenu
                consumerId={row.consumer_id}
                name={row.name}
                topics={row.topics ?? []}
                kinds={row.kinds ?? []}
                apps={apps}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <Shell mode={found.mode} actor={found.actor} current="/consumers">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 font-bold">일꾼</h1>
        {manage ? <NewConsumer apps={apps} /> : null}
      </header>
      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="등록된 일꾼이 없습니다."
          hint={manage ? "「새 일꾼...」으로 만들고 받은 토큰을 일꾼 설정에 넣으세요." : undefined}
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.consumer_id} caption="일꾼" />
      )}
    </Shell>
  );
}
