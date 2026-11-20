import Link from "next/link";
import { redirect } from "next/navigation";
import { Autocomplete, DataTable, EmptyState, ErrorBanner, StatusBadge, readPaging, type Column } from "@bpm/ui";
import type { ApprovalInfo } from "@bpm/api-types/c6-approval-info";
import type { ServerRunnerInfo } from "@bpm/api-types/c12-server-runner-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { AutoFilter } from "@/components/AutoFilter";
import { loadNodeNames, loadProcessNames } from "@/lib/names";

/**
 * CON-04 결재함 (목록).
 *
 * **값은 목록에 보이지 않는다** — 검토 자료는 상세에서 접힌 채로만 보인다 (U10). 목록에는
 * 「변수 키」만 둔다. 필터는 주소(URL)에 남겨 새로 고쳐도 그대로다.
 */

/** C6 상태 → `status_map` 「결재」 묶음의 표기. 모르는 값은 그대로 보인다 (원칙 10). */
export const STATE_LABEL: Record<string, string> = {
  open: "대기",
  answered: "답함",
  expired: "시간 초과",
  withdrawn: "회수됨",
};

/** 회수 사유 → 글 (C6). */
export const WITHDRAW_LABEL: Record<string, string> = {
  run_ended: "실행이 끝남",
  admin_withdraw: "관리자 회수",
  host_lost: "실행기 기록 유실",
};

export function time(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** 실행하는 곳 — 그 결재를 올린 **실행기 이름** (CON-04). 자리가 하나다 (ADR-0144). */
export function where(row: ApprovalInfo): string {
  return row.host.name ?? row.host.id;
}

/** 담당자들 (ADR-0080). 없으면 「—」 — 콘솔은 담당자로 막지 않는다. */
export function assigned(row: ApprovalInfo): string {
  return (row.assignees ?? []).join(", ") || "—";
}

/** 답한 사람. 대리 답이면 「<이름> · <키 이름>」 — 누가와 어느 길로를 함께 (ADR-0081). */
export function answeredBy(row: ApprovalInfo): string {
  if (!row.answered_by) return "—";
  return row.answered_via ? `${row.answered_by} · ${row.answered_via}` : row.answered_by;
}

const STATES = [
  { value: "", label: "(전체)" },
  { value: "open", label: "대기" },
  { value: "answered", label: "답함" },
  { value: "expired", label: "시간 초과" },
  { value: "withdrawn", label: "회수됨" },
];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; host?: string; assignee?: string; page?: string; size?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const asked = await searchParams;
  const state = asked.state ?? "";
  const host = asked.host ?? "";
  const assignee = (asked.assignee ?? "").trim();

  let rows: ApprovalInfo[] = [];
  let hosts: ServerRunnerInfo[] = [];
  let failure: string | null = null;
  try {
    rows = await center.approvals({
      state: state || undefined,
      host: host || undefined,
      assignee: assignee || undefined,
    });
    hosts = await center.serverRunners();
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  // id 대신 보일 이름 — BPM 프로세스·단계(노드) (ADR-0165). 못 받으면 id 그대로다.
  // 쪽은 주소에 — 콘솔 서버가 그 쪽만 그린다 (ADR-0167 — 다 그려 보내니 한 장이 8.3MB였다).
  const paging = { ...readPaging(asked), query: { state, host, assignee } };
  const pageRows = rows.slice(paging.page * paging.size, (paging.page + 1) * paging.size);
  const [processNames, nodeNames, people] = await Promise.all([
    loadProcessNames(),
    // 이름은 **보일 쪽의 것만** 묻는다.
    loadNodeNames(pageRows.map((row) => [row.bpm_process_id, row.version] as [string, string])),
    // 거르지 않았으면 받은 목록이 전부다 — 두 번 받지 않는다 (ADR-0167).
    assigneeChoices(state || host || assignee ? null : rows),
  ]);

  const columns: Array<Column<ApprovalInfo>> = [
    {
      key: "state",
      header: "상태",
      width: "9ch",
      cell: (row) => <StatusBadge group="결재" label={STATE_LABEL[row.state] ?? row.state} />,
    },
    {
      // 사람이 먼저 읽는 것 — 가장 넓다 (ADR-0165).
      key: "title",
      header: "제목",
      cardTitle: true,
      minWidth: "26ch",
      cell: (row) => (
        <Link className="font-medium text-text-primary hover:text-primary" href={`/approvals/${encodeURIComponent(row.request_id)}`}>
          {row.title ?? "결재 요청"}
        </Link>
      ),
    },
    {
      // 요청 id 대신 **그림의 그 단계 이름** (ADR-0165, U2) — id는 상세에 있다.
      key: "node",
      header: "단계",
      minWidth: "18ch",
      cell: (row) => nodeNames.get(`${row.bpm_process_id}@${row.version}#${row.node_id}`) ?? row.node_id,
    },
    { key: "host", header: "실행하는 곳", width: "12ch", cell: where },
    {
      key: "bpm_process_id",
      header: "프로세스",
      minWidth: "20ch",
      cell: (row) => processNames.get(`${row.bpm_process_id}@${row.version}`) ?? `${row.bpm_process_id}@${row.version}`,
    },
    {
      // **키만** 보인다 (U10) — 값은 상세에서 접힌 채로만.
      key: "keys",
      header: "변수 키",
      minWidth: "16ch",
      // 앞의 둘과 「외 n개」 — 다 늘어놓으면 칸이 일곱 줄이 됐다. 전부는 상세에 (ADR-0165).
      cell: (row) => keysLine(Object.keys(row.review ?? {})),
    },
    // 시각은 한 줄 — 두 줄로 갈리면 줄 높이가 들쭉날쭉했다.
    { key: "created_at", header: "요청 시각", width: "11ch", cell: (row) => <span className="whitespace-nowrap">{time(row.created_at)}</span> },
    { key: "expires_at", header: "시한", width: "11ch", cell: (row) => <span className="whitespace-nowrap">{time(row.expires_at)}</span> },
    { key: "assignees", header: "담당", width: "11ch", cell: assigned },
    { key: "answered_by", header: "답한 사람", width: "18ch", cell: answeredBy },
    {
      key: "delivered",
      header: "전달됨",
      width: "8ch",
      cell: (row) => (row.delivered ? "받아 감" : "—"),
    },
  ];

  return (
    <Shell mode={found.mode} actor={found.actor} current="/approvals">
      <header className="mb-4">
        <h1 className="text-h2 font-bold">결재함</h1>
      </header>

      {/* 필터는 JS 없이도 돈다 — GET 폼이 주소에 남긴다. */}
      {/* 고르는 대로 든다 — 「좁히기」가 없다 (ADR-0165). */}
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
          <span className="text-text-muted">실행하는 곳</span>
          <select
            name="host"
            defaultValue={host}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            <option value="">(전체)</option>
            {hosts.map((one) => (
              <option key={one.server_runner_id} value={one.server_runner_id}>
                {one.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          <span className="text-text-muted">담당</span>
          {/* 자동 완성 — 결재에 적힌 담당과 조직의 직원 이름이 후보다 (ADR-0165). 모르는 이름도 칠 수 있다. */}
          <Autocomplete
            name="assignee"
            label="담당"
            defaultValue={assignee}
            placeholder="(전체)"
            options={[...new Set([...rows.flatMap((row) => row.assignees ?? []), ...people])].sort((a, b) =>
              a.localeCompare(b, "ko"),
            )}
            className="w-56"
          />
        </label>
      </AutoFilter>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            state || host || assignee
              ? "해당하는 결재 요청이 없습니다."
              : "기다리는 결재가 없습니다."
          }
          hint={state || host || assignee ? "필터를 「(전체)」로 바꿔 보세요." : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.request_id}
          caption="결재 목록" numbered
          paging={paging}
        />
      )}
    </Shell>
  );
}

/** 「변수 키」 한 칸 — 앞의 둘과 「외 n개」 (ADR-0165). */
function keysLine(keys: string[]): string {
  if (keys.length === 0) return "—";
  return keys.length <= 2 ? keys.join(", ") : `${keys.slice(0, 2).join(", ")} 외 ${keys.length - 2}개`;
}

/**
 * 「담당」 자동 완성의 후보 — **모든 결재의 담당**(거른 목록만 보면 고른 뒤 후보가 하나로 준다)과 조직의
 * 직원 이름. 못 받으면 비어 있다 — 칸은 그대로 칠 수 있다.
 */
async function assigneeChoices(known: ApprovalInfo[] | null): Promise<string[]> {
  const [all, staff] = await Promise.all([
    known ?? center.approvals().catch(() => []),
    center.staffList().catch(() => []),
  ]);
  return [...all.flatMap((one) => one.assignees ?? []), ...staff.map((one) => one.name)];
}
