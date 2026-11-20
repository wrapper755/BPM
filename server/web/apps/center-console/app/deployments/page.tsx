import Link from "next/link";
import { redirect } from "next/navigation";
import { Autocomplete, Button, DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { AutoFilter } from "@/components/AutoFilter";
import { loadProcessNames } from "@/lib/names";
import { fullTime } from "@/lib/time";
import { RevokeDeployment } from "./tools";

/**
 * CON-15 배포 — 배포를 **만들고 철회하는 한 곳**이다 (ADR-0090). CON-03·CON-12의 배포 줄은
 * 여기로 잇기만 한다 (같은 단추는 한 곳). 봉투는 Center가 서명한다 — 화면은 누가 했는지를 보인다.
 */

/** 배포 하나의 지금 상태 (`status_map` 「배포」). 때는 콘솔 서버의 시각으로 본다. */
function stateOf(row: DeploymentInfo, now: number): string {
  if (row.revoked_at) return "철회됨";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "만료";
  if (row.not_before && Date.parse(row.not_before) > now) return "예약";
  return "활성";
}

/** 「상태」 거르기 — 빈 값은 **살아 있는 것**(철회되지 않은 것)이다. 철회된 것도 행이 남는다 (C5). */
const STATES = [
  { value: "", label: "(살아 있는 것)" },
  { value: "활성", label: "활성" },
  { value: "예약", label: "예약" },
  { value: "만료", label: "만료" },
  { value: "철회됨", label: "철회됨" },
  { value: "all", label: "(전체)" },
];

export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; process?: string; created?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const asked = await searchParams;
  const state = asked.state ?? "";
  const process = (asked.process ?? "").trim();

  let rows: DeploymentInfo[] = [];
  const names = new Map<string, string>();
  let failure: string | null = null;
  try {
    // 살아 있는 것만 볼 때만 Center가 거른다 — 나머지 상태는 철회된 것까지 받아 여기서 가른다.
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
  const choices = [...new Set(rows.map((row) => row.bpm_process_id))].sort();
  const needle = process.toLowerCase();
  rows = rows.filter(
    (row) =>
      (state === "" || state === "all" || stateOf(row, now) === state) &&
      (!needle ||
        `${row.bpm_process_id}@${row.version}`.toLowerCase().includes(needle) ||
        (processNames.get(`${row.bpm_process_id}@${row.version}`) ?? "").toLowerCase().includes(needle)),
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
      header: "프로세스@버전",
      mono: true,
      // 휴대폰 카드의 제목 — 첫 열(번호)이 제목이면 카드마다 숫자 하나가 머리에 선다.
      cardTitle: true,
      cell: (row) => `${row.bpm_process_id}@${row.version}`,
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
      cell: (row) => fullTime(row.signed_at),
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
                  label={`${row.bpm_process_id}@${row.version} → ${target(row)}`}
                />
              ),
          } as Column<DeploymentInfo>,
        ]
      : []),
  ];

  return (
    <Shell mode={found.mode} actor={found.actor} current="/deployments">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold">배포</h1>
        {found.mode === "admin" ? (
          <Link href="/deployments/new">
            <Button variant="tonal">새 배포...</Button>
          </Link>
        ) : null}
      </header>

      {/* 「철회된 것도 보기」는 「상태」 칸이 맡는다 (CON-15). */}
      <AutoFilter>
        <label className="flex flex-col gap-1 text-body-sm">
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
        <label className="flex flex-col gap-1 text-body-sm">
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
          title={state || process ? "조건에 맞는 배포가 없습니다." : "배포가 없습니다."}
          hint={found.mode === "admin" ? "승인된 프로세스를 「새 배포...」로 배포하세요." : "관리자가 배포하면 여기 보입니다."}
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.deployment_id} caption="배포" />
      )}
    </Shell>
  );
}
