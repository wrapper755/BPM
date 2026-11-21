import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Autocomplete, Button, DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { AutoFilter } from "@/components/AutoFilter";
import { loadProcessNames, processNamer } from "@/lib/names";
import { fullTime, time } from "@/lib/time";
import { namesOf, placeLine, workPlaceLabel } from "@/lib/organization";
import { PendingTable, type PendingRow } from "./pending";
import { RevokeDeployment } from "./tools";
import { ART } from "@/components/empty-art";

/**
 * CON-15 배포 — **후보를 승인하고** 배포를 **만들고 철회하는 한 곳**이다 (ADR-0090·ADR-0181). 탭 둘 —
 * 「승인 대기」(`?tab=pending`)와 「배포됨」(기본). CON-12의 배포 줄은 여기로 잇기만 한다 (같은 단추는 한 곳).
 * 봉투는 Center가 서명한다 — 화면은 누가 했는지를 보인다.
 */

/** 탭 줄 — **링크**라 JS 없이 돈다 (CON-01 상세와 같은 줄). 고른 탭은 주소 `?tab=`에 남는다. */
function TabBar({ pending, waiting }: { pending: boolean; waiting: number | null }) {
  const items: Array<{ href: Route; label: string; count?: number | null; here: boolean }> = [
    { href: "/deployments?tab=pending", label: "승인 대기", count: waiting, here: pending },
    { href: "/deployments", label: "배포됨", here: !pending },
  ];
  return (
    <nav aria-label="배포" className="mb-4 overflow-x-auto border-b border-border-default">
      <ul className="m-0 flex list-none gap-1 p-0">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              aria-current={item.here ? "page" : undefined}
              className={`flex items-center gap-1.5 px-3 py-2.5 whitespace-nowrap text-body${
                item.here
                  ? " font-semibold text-text-primary shadow-[inset_0_-2px_0_var(--primary)]"
                  : " text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
              {item.count !== undefined && item.count !== null ? (
                <span className="text-body-sm text-text-muted tabular-nums">{item.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 배포 하나의 지금 상태 (`status_map` 「배포」). 때는 콘솔 서버의 시각으로 본다. */
function stateOf(row: DeploymentInfo, now: number): string {
  if (row.revoked_at) return "철회됨";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "만료";
  if (row.not_before && Date.parse(row.not_before) > now) return "예약";
  return "활성";
}

/**
 * 「상태」 거르기 — 고르는 값은 **표의 「상태」와 같은 말**이고 기본(빈 값)은 「활성」이다 (CON-15 — 「(살아 있는 것)」은
 * 표에 없는 말이었다, ADR-0171과 같은 결). 철회된 것도 행이 남는다 (C5).
 */
const STATES = [
  { value: "", label: "활성" },
  { value: "예약", label: "예약" },
  { value: "만료", label: "만료" },
  { value: "철회됨", label: "철회됨" },
  { value: "all", label: "전체" },
];

export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; state?: string; process?: string; created?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const asked = await searchParams;
  const pending = asked.tab === "pending";
  const admin = found.mode === "admin";

  // 후보는 **두 탭 모두** 읽는다 — 탭의 건수다. 못 읽으면 건수 없이 서고 「승인 대기」 탭이 까닭을 보인다.
  let candidates: PendingRow[] = [];
  let candidateFailure: string | null = null;
  try {
    const all = await center.packages();
    const waiting = all
      .filter((one) => one.status === "candidate")
      .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
    // 승인 창에 보일 회사·업무 자리의 **이름** (C16, CON-02와 같다) — 그 탭에서만, 못 읽으면 id로 보인다.
    const none = () => ({}) as Record<string, string>;
    const [companies, departments, staff] =
      pending && waiting.length > 0
        ? await Promise.all([
            center.companies().then(namesOf, none),
            center.departments().then(namesOf, none),
            center.staffList().then(namesOf, none),
          ])
        : [none(), none(), none()];
    candidates = waiting.map((one) => ({
      ...one,
      place_line: placeLine(
        one.company ? (companies[one.company] ?? one.company) : null,
        workPlaceLabel(one.place, { departments, staff }),
      ),
    }));
  } catch (cause) {
    candidateFailure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }
  const header = (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold">배포</h1>
        {admin ? (
          <Link href="/deployments/new">
            <Button variant="tonal">새 배포...</Button>
          </Link>
        ) : null}
      </header>
      <TabBar pending={pending} waiting={candidateFailure ? null : candidates.length} />
    </>
  );

  if (pending) {
    return (
      <Shell mode={found.mode} actor={found.actor} current="/deployments?tab=pending">
        {header}
        {candidateFailure ? <ErrorBanner message={candidateFailure} /> : <PendingTable rows={candidates} admin={admin} />}
      </Shell>
    );
  }

  const state = asked.state ?? "";
  const process = (asked.process ?? "").trim();

  let rows: DeploymentInfo[] = [];
  const names = new Map<string, string>();
  let failure: string | null = null;
  try {
    // 「활성」(기본)일 때만 Center가 철회된 것을 거른다 — 나머지 상태는 철회된 것까지 받아 여기서 가른다.
    const [deployments, runners] = await Promise.all([
      center.deployments({ active: state === "" ? true : undefined }),
      center.serverRunners(),
    ]);
    rows = deployments;
    for (const one of runners) names.set(`server_runner:${one.server_runner_id}`, one.name);
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const now = Date.now();
  // 거르기 (CON-15, ADR-0165 — 고르는 대로 든다). 프로세스는 「<id>@<버전>」과 이름의 **일부**로 걸린다.
  const processNames = await loadProcessNames();
  const named = processNamer(processNames);
  const nameOf = (row: DeploymentInfo) => named(row.bpm_process_id, row.version);
  const choices = [...new Set(rows.map((row) => row.bpm_process_id))].sort();
  const needle = process.toLowerCase();
  rows = rows.filter(
    (row) =>
      (state === "all" || stateOf(row, now) === (state || "활성")) &&
      (!needle ||
        `${row.bpm_process_id}@${row.version}`.toLowerCase().includes(needle) ||
        (nameOf(row) ?? "").toLowerCase().includes(needle)),
  );
  // 「대상」 열은 없다 — 실행 자리가 서버 하나라 줄마다 같은 이름이었다 (ADR-0144). 철회 확인 창이 말한다.
  const target = (row: DeploymentInfo): string => {
    const type = String(row.target.type ?? "");
    const id = String(row.target.id ?? "");
    if (id === "*") return "서버 (전체)";
    // 아직 등록 기록이 없는 실행기는 id 그대로 보인다 — 숨기면 잘못 걸린 배포를 못 찾는다.
    return names.get(`${type}:${id}`) ?? id;
  };

  // 「번호」 — 이 목록의 차례이고 **위에서부터 1**이다(가장 최근 배포가 1). 배포 id는 사람이 외워 쓸 일이
  // 없어 말풍선에만 둔다 (U2, CON-15).
  const number = new Map(rows.map((row, index) => [row.deployment_id, index + 1]));

  const columns: Array<Column<DeploymentInfo>> = [
    {
      key: "number",
      header: "번호",
      width: "6ch",
      align: "right",
      cell: (row) => (
        <span id={row.deployment_id} title={row.deployment_id} className="text-text-muted">
          {number.get(row.deployment_id)}
        </span>
      ),
    },
    {
      key: "bot",
      header: "프로세스",
      // 휴대폰 카드의 제목 — 첫 열(번호)이 제목이면 카드마다 숫자 하나가 머리에 선다.
      cardTitle: true,
      // 업무 이름만, id는 말풍선에 (U2 — CON-02와 같은 결). 이름이 없으면 id가 고정폭으로 선다.
      cell: (row) => {
        const name = nameOf(row);
        return name ? (
          <span title={row.bpm_process_id}>{name}</span>
        ) : (
          <span className="font-mono text-body-sm">{row.bpm_process_id}</span>
        );
      },
    },
    {
      key: "version",
      header: "판",
      width: "10ch",
      // 판은 별도 열 — 본문 글꼴·보조 글자색 (CON-02 「판」과 같다, ADR-0164).
      cell: (row) => <span className="text-text-secondary tabular-nums">v{row.version}</span>,
    },
    {
      key: "state",
      header: "상태",
      width: "10ch",
      cell: (row) => <StatusBadge group="배포" label={stateOf(row, now)} />,
    },
    {
      key: "validity",
      header: "유효 기간",
      width: "28ch",
      cell: (row) =>
        `${row.not_before ? fullTime(row.not_before) : "즉시"} ~ ${row.expires_at ? fullTime(row.expires_at) : "무기한"}`,
    },
    {
      key: "limit",
      header: "동시 실행",
      width: "9ch",
      align: "right",
      // 적지 않았으면 「기본」 — 계약의 기본값을 화면에 베끼지 않는다 (CON-12와 같다).
      cell: (row) => row.max_concurrency ?? "기본",
    },
    {
      key: "who",
      header: "누가",
      width: "14ch",
      // 사람이 서명하던 때의 배포에는 계정이 없다 (ADR-0090).
      cell: (row) =>
        row.revoked_at ? `철회 ${row.revoked_by ?? "—"}` : (row.deployed_by ?? <span className="text-text-muted">—</span>),
    },
    {
      key: "when",
      // 화면 이름이 「배포」라 「배포한 때」는 같은 말이 겹쳤다.
      header: "날짜",
      width: "18ch",
      cell: (row) => time(row.signed_at),
    },
    ...(found.mode === "admin"
      ? [
          {
            key: "actions",
            header: "",
            width: "4rem",
            align: "right",
            cell: (row: DeploymentInfo) =>
              row.revoked_at ? null : (
                <RevokeDeployment
                  deploymentId={row.deployment_id}
                  label={`${nameOf(row) ?? row.bpm_process_id} v${row.version} → ${target(row)}`}
                />
              ),
          } as Column<DeploymentInfo>,
        ]
      : []),
  ];

  return (
    <Shell mode={found.mode} actor={found.actor} current="/deployments">
      {header}

      {/* 「철회된 것도 보기」는 「상태」 칸이 맡는다 (CON-15). */}
      <AutoFilter>
        <label className="filter-field">
          <span className="text-text-muted">상태</span>
          <select
            name="state"
            defaultValue={state}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {STATES.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span className="text-text-muted">프로세스</span>
          <Autocomplete name="process" label="프로세스" defaultValue={process} placeholder="(전체)" options={choices} className="w-56" />
        </label>
      </AutoFilter>

      {asked.created ? (
        <p className="mb-3 text-body text-text-secondary">
          배포 {asked.created}건을 만들었습니다. 현장은 다음 하트비트에 받아 설치합니다.
        </p>
      ) : null}

      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          art={state || process ? ART.search : ART.runs}
          title={state || process ? "조건에 맞는 배포가 없습니다." : "배포가 없습니다."}
          hint={found.mode === "admin" ? "승인된 프로세스를 「새 배포...」로 배포하세요." : "관리자가 배포하면 여기 보입니다."}
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.deployment_id} caption="배포" />
      )}
    </Shell>
  );
}
