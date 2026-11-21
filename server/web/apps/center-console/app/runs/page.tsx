import Link from "next/link";
import { redirect } from "next/navigation";
import { DataTable, ErrorBanner, StatusBadge, readPaging, type Column } from "@bpm/ui";
import type { RunInfo } from "@bpm/api-types/c3-run-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { sourceLabel } from "@/lib/labels";
import { namesOf } from "@/lib/organization";
import { AutoFilter } from "@/components/AutoFilter";
import { loadProcessNames, processNamer } from "@/lib/names";
import { time, took } from "@/lib/time";
import { ART } from "@/components/empty-art";

/**
 * CON-01 로그 (목록).
 *
 * 값은 **실행하는 쪽이 보낸 이벤트에서** 나온다 (C3). Center가 받을 때 요약을 만들어 두므로
 * 목록을 그릴 때 줄을 다시 읽지 않는다.
 *
 * 좁히기는 상태·BPM 프로세스다. **실행기는 열로도 거르기로도 두지 않는다** — 실행 자리가 서버 하나다 (ADR-0144).
 * **회사·부서·직원도 열로 두지 않는다** — 줄마다 같거나 늘 「—」였다. 상세 「요약」이 말한다 (ADR-0184).
 *
 * 「최근 n건」은 없다 — 쪽으로 나누므로 늘 Center의 최대(`MAX_LIMIT`)를 받아 쪽을 자른다.
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

/** Center가 한 번에 주는 최대 (C3 `GET /runs` `limit` — Center `MAX_LIMIT`). 그보다 많으면 표 아래가 말한다. */
const MAX_RUNS = 500;

/** 셈 열 — **센 적이 없으면 「—」**다 (끝나지 않은 실행). 0과 다르다. */
function tally(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

/**
 * 회사·부서·직원 이름표 (C16) — 상세 「요약」의 「회사 · 부서 · 직원」 줄이 `RunInfo`의 id를 이름으로 보인다.
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
  return <span title={id}>{processNamer(names)(id, version) ?? id}</span>;
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    bpm_process_id?: string;
    page?: string;
    size?: string;
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
      limit: MAX_RUNS,
    });
    rows = listing.runs ?? [];
    total = listing.total ?? rows.length;
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const processNames = await loadProcessNames();
  const processChoices = [
    ...new Map([...processNames].map(([key, name]) => [key.slice(0, key.lastIndexOf("@")), name])),
  ].sort((a, b) => a[1].localeCompare(b[1], "ko"));

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
      cardTitle: true,
      // 이름이 되도록 다 보이게 — 결재함의 제목 열과 같은 폭 (ADR-0165).
      minWidth: "26ch",
      // 실행 id 열은 없다 — 업무 이름이 상세로 가는 링크다 (화면 문서 CON-01).
      cell: (row) => (
        <Link className="font-medium text-text-primary hover:text-primary" href={`/runs/${encodeURIComponent(row.run_id)}`}>
          <ProcessName id={row.bpm_process_id} version={row.version} names={processNames} />
        </Link>
      ),
    },
    // 판은 「v<판>」, 보조 글자색 — 다른 목록의 「판」과 같다 (CON-02·CON-05·CON-15).
    {
      key: "version",
      header: "판",
      width: "10ch",
      cell: (row) => (row.version ? <span className="text-text-secondary tabular-nums">v{row.version}</span> : "—"),
    },
    { key: "source", header: "시작 방식", width: "10ch", cell: (row) => sourceLabel(row.source) },
    // 시각은 한 줄 (CON-05와 같다). 없으면 글자 「—」 그대로 — 휴대폰 카드가 그 줄을 뺀다.
    {
      key: "started_at",
      header: "시작",
      width: "12ch",
      cell: (row) => (row.started_at ? <span className="whitespace-nowrap tabular-nums">{time(row.started_at)}</span> : "—"),
    },
    // 「끝」 열은 없다 — 시작 + 소요가 말하고 끝 시각은 상세 「요약」에 있다 (ADR-0184, 1280px에서 넘쳤다).
    {
      key: "duration_s",
      header: "소요",
      width: "10ch",
      align: "right",
      cell: (row) => took(row.duration_s),
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
        <h1 className="text-h2 font-bold">실행 기록</h1>
      </header>

      {/* 고르는 대로 든다 — 「좁히기」가 없다 (ADR-0165). */}
      <AutoFilter>
        <label className="filter-field">
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
        <label className="filter-field">
          프로세스
          {/* id를 외워 치지 않게 **치면 후보가 뜬다** — 이름으로 찾고 id가 들어간다 (H6, ADR-0162). */}
          <input
            name="bpm_process_id"
            list="run-processes"
            defaultValue={query.bpm_process_id ?? ""}
            placeholder="(전체)"
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
          <datalist id="run-processes">
            {processChoices.map(([id, name]) => (
              <option key={id} value={id} label={name} />
            ))}
          </datalist>
        </label>
      </AutoFilter>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : (
        <div className="flex flex-col gap-2">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.run_id}
            caption="실행 목록" numbered
            // 500건까지 받으므로 쪽은 주소에 — 콘솔 서버가 그 쪽만 그린다 (ADR-0167).
            paging={{
              ...readPaging(query),
              query: {
                status: query.status,
                bpm_process_id: query.bpm_process_id,
              },
            }}
            empty={
              query.status || query.bpm_process_id
                ? { title: "조건에 맞는 실행이 없습니다.", hint: "거르기를 초기화하세요.", art: ART.search }
                : { title: "실행이 없습니다.", hint: "서버 실행기가 보낸 기록이 여기 쌓입니다.", art: ART.runs }
            }
          />
          {/* 건수는 페이저가 말한다 — Center가 잘랐을 때만 여기 한 줄 (ADR-0184). */}
          {total > rows.length ? (
            <p className="text-body-sm text-text-muted">{`전체 ${total}건 중 최근 ${rows.length}건`}</p>
          ) : null}
        </div>
      )}
    </Shell>
  );
}
