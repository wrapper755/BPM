import { timerRequester } from "@/lib/summary";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { JobInfo } from "@bpm/api-types/c5-job-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { cancelControl } from "@/lib/jobs";
import { CancelJob } from "./cancel";
import { AutoFilter } from "@/components/AutoFilter";
import { Schedules, loadSchedules } from "@/components/Schedules";
import { loadProcessNames, processNamer } from "@/lib/names";
import { LABEL as RUN_LABEL } from "@/app/runs/page";
import {
  STATES,
  STATE_LABEL,
  delegatedFrom,
  reason,
  stateNote,
} from "./labels";
import { time } from "@/lib/time";
import { ART } from "@/components/empty-art";

/**
 * CON-05 작업 지시 (목록).
 *
 * **입력 값은 목록에 보이지 않는다** — 「입력 키」만 둔다 (U10). 값은 상세에서 접힌 채로만.
 * 필터는 주소(URL)에 남겨 새로 고쳐도 그대로다 (JS 없이 GET 폼).
 *
 * 이름을 보이고 id는 감춘다 (U2 — CON-01·CON-15와 같은 결). 「최대」는 없다 — 쪽으로 나누므로 늘 Center의 최대를 받는다.
 */

/** Center가 한 번에 주는 최대 (C5 `GET /jobs` `limit` — `LIST_LIMIT_MAX`). */
const MAX_JOBS = 1000;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const asked = await searchParams;
  // 상태는 고르기 하나 — 빈 값이 「전체」다 (다른 목록과 같은 모양). 실행기 거르기는 없다 — 자리가 서버 하나다 (ADR-0144).
  const state = STATES.includes(asked.state ?? "") ? (asked.state as string) : "";
  const admin = found.mode === "admin";

  // 「일정」은 목록과 **나란히** 읽는다 — 표를 다 그린 뒤에 부르면 쉬던 연결이 닫혀 있다 (Schedules).
  const schedules = loadSchedules();
  let rows: JobInfo[] = [];
  let failure: string | null = null;
  try {
    rows = await center.jobs({
      state: state || undefined,
      limit: MAX_JOBS,
    });
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  // 이름표는 `<id>@<판>` 열쇠다 — 판을 비우고 만든 작업도 이름이 서게 id로도 찾는다.
  const processNames = await loadProcessNames();
  const named = processNamer(processNames);
  const nameOf = (row: JobInfo) => named(row.bpm_process_id, row.version);

  const columns: Array<Column<JobInfo>> = [
    {
      key: "state",
      header: "상태",
      // 상태 표지는 길이가 정해져 있다(대기열·취소됨 — 셋까지) — 그만큼만 쥔다.
      width: "9ch",
      cell: (row) => {
        const note = stateNote(row);
        return (
          <div className="flex flex-col gap-1">
            <StatusBadge group="작업" label={STATE_LABEL[row.state] ?? row.state} />
            {note ? <span className="text-body-sm text-text-muted">{note}</span> : null}
          </div>
        );
      },
    },
    {
      key: "bot",
      header: "프로세스",
      cardTitle: true,
      // 이름이 되도록 다 보이게 — 결재함의 제목 열과 같은 폭 (ADR-0165).
      minWidth: "26ch",
      // 업무 이름 — 누르면 그 작업의 상세. 작업 id는 말풍선에 (U2). 이름을 못 찾으면 id가 고정폭으로 선다.
      cell: (row) => {
        const name = nameOf(row);
        return (
          <Link
            className={`font-medium text-text-primary hover:text-primary ${name ? "" : "font-mono text-body-sm"}`}
            href={`/jobs/${encodeURIComponent(row.job_id)}`}
            title={row.job_id}
          >
            {name ?? row.bpm_process_id}
          </Link>
        );
      },
    },
    {
      key: "version",
      header: "판",
      width: "12ch",
      // 판을 비우고 만든 작업은 Center가 배포된 판으로 돌린다 (C5).
      cell: (row) => (
        <span className="text-text-secondary tabular-nums">{row.version ? `v${row.version}` : "배포된 판"}</span>
      ),
    },
    {
      // **키만** 보인다 (U10) — 값은 상세에서 접힌 채로만.
      key: "inputs",
      header: "입력 키",
      cell: (row) => Object.keys(row.inputs ?? {}).join(", ") || "—",
    },
    {
      key: "requested_by",
      header: "요청자",
      cell: (row) => {
        const from = delegatedFrom(row);
        return from ? (
          <Link className="font-medium text-text-primary hover:text-primary" href={`/runs/${encodeURIComponent(from)}`} title={from}>
            서버 프로세스
          </Link>
        ) : (
          // 일정이 만든 작업은 「일정 <식>」이다 (C5 예약값 `timer:`, ADR-0110).
          timerRequester(row.requested_by) ?? row.requested_by
        );
      },
    },
    // 시각은 한 줄 — 날짜와 시각이 두 줄로 갈리면 줄 높이가 들쭉날쭉하다 (CON-02 「최근 성공」과 같다).
    {
      key: "requested_at",
      header: "요청 시각",
      width: "12ch",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{time(row.requested_at)}</span>,
    },
    {
      key: "expires_at",
      header: "만료",
      width: "12ch",
      // 없으면 글자 「—」 그대로 — 요소로 감싸면 휴대폰 카드가 그 줄을 빼지 못한다 (ADR-0164).
      cell: (row) =>
        row.expires_at ? <span className="whitespace-nowrap tabular-nums">{time(row.expires_at)}</span> : "—",
    },
    {
      // 실행의 성패는 작업 상태가 아니다 — C3 `run_finished`가 정한다 (C5). 누르면 그 실행 (실행 id는 말풍선).
      key: "run",
      header: "실행",
      width: "12ch",
      cell: (row) =>
        row.run_id ? (
          <Link href={`/runs/${encodeURIComponent(row.run_id)}`} title={row.run_id} className="hover:underline">
            <StatusBadge group="실행·노드" label={RUN_LABEL[row.run_status ?? ""] ?? row.run_status ?? "시작됨"} />
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "state_reason", header: "사유", width: "14ch", cell: reason },
    // 메모도 너무 좁아지면 네 줄이 된다 — 이름 다음으로 폭을 쥔다.
    { key: "note", header: "메모", minWidth: "22ch", cell: (row) => row.note ?? "—" },
  ];
  if (admin) {
    columns.push({
      key: "cancel",
      header: "",
      width: "3rem",
      align: "right",
      cell: (row) => <CancelJob compact jobId={row.job_id} control={cancelControl(row)} />,
    });
  }

  const filtered = Boolean(state);

  return (
    <Shell mode={found.mode} actor={found.actor} current="/jobs">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 font-bold">작업 지시</h1>
        </div>
        {admin ? (
          // 목록 머리의 「새 …」는 칠하지 않는다 (ADR-0168 — 다른 목록과 같다).
          <Link href="/jobs/new">
            <Button variant="tonal">새 작업...</Button>
          </Link>
        ) : null}
      </header>

      {/* 고르는 대로 든다 — 「좁히기」가 없다 (ADR-0165). */}
      <AutoFilter>
        <label className="filter-field">
          <span className="text-text-muted">상태</span>
          <select
            name="state"
            defaultValue={state}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            <option value="">전체</option>
            {STATES.map((one) => (
              <option key={one} value={one}>
                {STATE_LABEL[one]}
              </option>
            ))}
          </select>
        </label>
      </AutoFilter>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          art={filtered ? ART.search : ART.jobs}
          title={filtered ? "해당하는 작업 지시가 없습니다." : "작업 지시가 없습니다. 「새 작업...」으로 만드세요."}
          hint={filtered ? "필터를 비워 보세요." : undefined}
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.job_id} caption="작업 지시 목록" numbered />
      )}

      {/* [S] 「일정」 — 차례마다 작업을 만드는 것이라 작업 지시 아래다 (ADR-0172). 없으면 영역이 없다. */}
      <Schedules data={await schedules} />
    </Shell>
  );
}
