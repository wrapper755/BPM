import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, DataTable, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { RunInfo } from "@bpm/api-types/c3-run-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { sourceLabel } from "@/lib/labels";
import { namesOf, orgName } from "@/lib/organization";

/**
 * CON-01 로그 (목록).
 *
 * 값은 **실행하는 쪽이 보낸 이벤트에서** 나온다 (C3). Center가 받을 때 요약을 만들어 두므로
 * 목록을 그릴 때 줄을 다시 읽지 않는다.
 *
 * 좁히기는 상태·BPM 프로세스·**실행기**·**최근 n건**이다. 「실행기」는 C3 `RunInfo.runner_id`인데
 * **Center가 읽을 때 채우는 값**이다 (보낸 키 → C4 키 묶기) — 보내는 쪽이 제 id를 적지 않는다.
 *
 * Studio가 보낸 기록에는 `runner_id`가 **없다** — 그 키에 묶인 실행기가 없어서다. 화면은 「—」로
 * 보이고 「실행한 쪽」이 `Studio`라고 말한다.
 *
 * 셈 열(AI 태스크·재생·결재·확인)은 `run_finished`가 세어 보낸 것이다 — **도는 중에는
 * 비어 있고 「—」로 보인다** (줄을 다시 읽어 세지 않는다, C3).
 */

/** C3 `status` → 화면 표기. `status_map`의 「실행·노드」 묶음에 있는 말만 쓴다. */
export const LABEL: Record<string, string> = {
  running: "실행 중",
  waiting: "기다리는 중",
  success: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

const CHOICES = ["", "running", "waiting", "success", "failed", "cancelled"];

/** C3 `executor` → 화면 표기 (「실행한 쪽」 열). */
const EXECUTOR: Record<string, string> = {
  server_runner: "서버 실행기",
  studio: "Studio",
};

/** 「최근 n건」 — 화면 설계서의 10~500, 기본 100. */
const LIMITS = [10, 50, 100, 200, 500];
const DEFAULT_LIMIT = 100;

/** 셈 열 — **센 적이 없으면 「—」**다 (끝나지 않은 실행). 0과 다르다. */
function tally(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

/** Studio가 보낸 기록에는 실행기가 없다는 말 (U3 — 「—」 옆에 까닭을 둔다). */
export const NO_RUNNER_NOTE =
  "「실행기」가 비어 있는 기록은 실행기가 아닌 쪽(Studio 시험 실행)이 보낸 것입니다.";

export function time(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function seconds(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 10) / 10}초`;
}

/**
 * 회사·부서·직원 이름표 (C16) — 「회사」·「부서」·「직원」 열은 `RunInfo`의 id를 이름으로 보인다.
 * **못 받아도 목록은 그린다** — 빈 표면 id 그대로 보인다 (U3).
 */
export async function loadOrgNames(): Promise<Record<"company" | "department" | "staff", Record<string, string>>> {
  try {
    const [companies, departments, staff] = await Promise.all([
      center.companies(),
      center.departments(),
      center.staffList(),
    ]);
    return { company: namesOf(companies), department: namesOf(departments), staff: namesOf(staff) };
  } catch {
    return { company: {}, department: {}, staff: {} };
  }
}

/**
 * BPM 프로세스 이름표 (C5 `PackageInfo.name`) — 열쇠는 `<id>@<version>`. 실행 기록에는 id만 있다.
 * **못 받아도 목록은 그린다** — 빈 표면 id 그대로 보인다 (U3).
 */
export async function loadProcessNames(): Promise<Map<string, string>> {
  try {
    const found = await center.packages({ kind: "bpm_process" });
    return new Map(found.flatMap((one) => (one.name ? [[`${one.id}@${one.version}`, one.name] as const] : [])));
  } catch {
    return new Map();
  }
}

/** 「BPM 프로세스」 칸 — **업무 이름만**, id는 마우스를 올리면. 이름이 없으면 id다 (화면 문서 CON-01). */
function ProcessName({
  id,
  version,
  names,
}: {
  id: string | null | undefined;
  version: string | null | undefined;
  names: Map<string, string>;
}) {
  if (!id) return <>—</>;
  return <span title={id}>{names.get(`${id}@${version ?? ""}`) ?? id}</span>;
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    bpm_process_id?: string;
    runner_id?: string;
    limit?: string;
  }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const query = await searchParams;

  let rows: RunInfo[] = [];
  let total = 0;
  let failure: string | null = null;
  try {
    const listing = await center.runs({
      status: query.status,
      bpm_process_id: query.bpm_process_id,
      runner_id: query.runner_id,
      limit: Number(query.limit) || DEFAULT_LIMIT,
    });
    rows = listing.runs ?? [];
    total = listing.total ?? rows.length;
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const org = await loadOrgNames();
  const processNames = await loadProcessNames();

  const columns: Array<Column<RunInfo>> = [
    {
      key: "status",
      header: "상태",
      width: "12ch",
      // 색만으로 뜻을 전하지 않는다 — 글자를 함께 쓴다 (스타일 가이드 §7).
      cell: (row) => <StatusBadge group="실행·노드" label={LABEL[row.status ?? ""] ?? row.status ?? "—"} />,
    },
    {
      key: "bpm_process_id",
      header: "프로세스",
      // 실행 id 열은 없다 — 업무 이름이 상세로 가는 링크다 (화면 문서 CON-01).
      cell: (row) => (
        <Link className="underline" href={`/runs/${encodeURIComponent(row.run_id)}`}>
          <ProcessName id={row.bpm_process_id} version={row.version} names={processNames} />
        </Link>
      ),
    },
    { key: "version", header: "버전", width: "10ch", cell: (row) => row.version ?? "—" },
    { key: "executor", header: "실행한 쪽", width: "12ch", cell: (row) => EXECUTOR[row.executor ?? ""] ?? "—" },
    { key: "runner_id", header: "실행기", width: "16ch", cell: (row) => row.runner_id ?? "—" },
    // 자리는 Center가 그 실행의 작업에서 붙인다 (C16) — Studio 시험 실행·작업 없는 실행은 「—」.
    { key: "company", header: "회사", width: "12ch", cell: (row) => orgName(row.company, org.company) },
    { key: "department", header: "부서", width: "12ch", cell: (row) => orgName(row.department, org.department) },
    { key: "staff", header: "직원", width: "12ch", cell: (row) => orgName(row.staff, org.staff) },
    { key: "source", header: "시작 방식", width: "10ch", cell: (row) => sourceLabel(row.source) },
    { key: "started_at", header: "시작", width: "14ch", cell: (row) => time(row.started_at) },
    { key: "finished_at", header: "끝", width: "14ch", cell: (row) => time(row.finished_at) },
    {
      key: "duration_s",
      header: "소요",
      width: "10ch",
      align: "right",
      cell: (row) => seconds(row.duration_s),
    },
    { key: "ai_tasks", header: "AI 태스크", width: "11ch", align: "right", cell: (row) => tally(row.ai_tasks) },
    { key: "replayed_tasks", header: "재생", width: "8ch", align: "right", cell: (row) => tally(row.replayed_tasks) },
    {
      key: "human_requests",
      header: "결재·확인",
      width: "11ch",
      align: "right",
      cell: (row) => tally(row.human_requests),
    },
    { key: "error_code", header: "오류 코드", cell: (row) => row.error_code ?? "—" },
  ];

  return (
    <Shell mode={found.mode} actor={found.actor} current="/runs">
      <header className="mb-4">
        <h1 className="text-h2 font-bold">프로세스 로그</h1>
      </header>

      <form className="filter-card flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-body-sm">
          상태
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {CHOICES.map((one) => (
              <option key={one || "all"} value={one}>
                {one ? LABEL[one] : "(전체)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          프로세스
          <input
            name="bpm_process_id"
            defaultValue={query.bpm_process_id ?? ""}
            placeholder="(전체)"
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          실행기
          <input
            name="runner_id"
            defaultValue={query.runner_id ?? ""}
            placeholder="(전체)"
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          최근 n건
          <select
            name="limit"
            defaultValue={String(Number(query.limit) || DEFAULT_LIMIT)}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {LIMITS.map((one) => (
              <option key={one} value={one}>
                {one}건
              </option>
            ))}
          </select>
        </label>
        <Link href="/runs" className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-body text-text-secondary hover:bg-bg-subtle">
          초기화
        </Link>
        <Button type="submit" variant="secondary">
          좁히기
        </Button>
      </form>
      <p className="mb-4 text-body-sm text-text-muted">{NO_RUNNER_NOTE}</p>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : (
        <div className="flex flex-col gap-2">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.run_id}
            caption="실행 목록"
            empty={{
              title: "조건에 맞는 실행이 없습니다.",
              hint: "Studio 시험 실행이나 서버 실행기가 보낸 기록이 여기 쌓입니다.",
            }}
          />
          {rows.length > 0 ? <p className="text-body-sm text-text-muted">{total}건</p> : null}
        </div>
      )}
    </Shell>
  );
}
