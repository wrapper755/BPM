import Link from "next/link";
import { DataTable, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { ScheduleInfo } from "@bpm/api-types/c5-schedule-info";
import { CenterError, center } from "@/lib/center";
import { scheduleResult, schedulesOf } from "@/lib/summary";
import { STATE_LABEL } from "@/app/jobs/labels";
import { fullTime, time } from "@/lib/time";

/**
 * CON-05 [S] 「일정」 — 타이머로 시작하는 배포의 다음 차례·마지막 차례 (C5 §일정, ADR-0110).
 *
 * **센 것은 Center의 것이다** (`GET /schedules`) — 콘솔이 cron을 다시 읽지 않는다. 같은 함수로 세지
 * 않으면 「다음 차례」가 일정과 어긋난다.
 *
 * 「지금 쏘기」·「멈추기」 단추는 두지 않는다 (화면 문서) — 지금 돌리려면 CON-05, 멈추려면 배포를 거둔다.
 */
/** 「일정」의 재료 — 화면이 그리기 **전에** 같이 읽도록 따로 둔다. */
export type ScheduleData = { rows: ScheduleInfo[]; jobState: Map<string, string>; failure: string | null };

/**
 * 페이지가 제 목록을 읽을 때 **나란히** 부른다 — 작업 지시 표(1000줄)를 다 그린 뒤에 부르면 그동안 Center가
 * 쉬던 연결을 닫아 「닿지 못했습니다」가 된다(개발 서버에서는 그리는 데 5초를 넘긴다).
 */
export async function loadSchedules(): Promise<ScheduleData> {
  const rows: ScheduleInfo[] = [];
  const jobState = new Map<string, string>();
  try {
    rows.push(...schedulesOf(await center.schedules()));
    // 「결과」는 마지막 작업의 상태다 — 일정이 있을 때만 작업을 읽는다.
    if (rows.some((row) => row.last_job_id)) {
      for (const job of await center.jobs({ limit: 500 })) {
        jobState.set(job.job_id, STATE_LABEL[job.state] ?? job.state);
      }
    }
  } catch (cause) {
    return { rows: [], jobState, failure: cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다" };
  }
  return { rows, jobState, failure: null };
}

export function Schedules({ data }: { data: ScheduleData }) {
  const { rows, jobState, failure } = data;
  // **일정이 없으면 영역이 없다** (화면 문서) — 늘 비는 표를 그리지 않는다.
  if (!failure && rows.length === 0) return null;

  const zone = rows[0]?.timezone ?? "";

  const columns: Array<Column<ScheduleInfo>> = [
    { key: "bpm_process_id", header: "프로세스", mono: true },
    { key: "version", header: "버전", width: "12ch", mono: true },
    {
      key: "target_id",
      header: "대상",
      cell: (row) => row.target_id ?? "서버 실행기 (Center가 고름)",
    },
    { key: "expression", header: "식", mono: true },
    {
      key: "next_at",
      header: "다음 차례",
      width: "18ch",
      // **연도까지** — 매달·매년 일정은 「01-01」로는 언제인지 모른다.
      cell: (row) => (row.problem ? "—" : row.next_at ? fullTime(row.next_at) : "끝남"),
    },
    { key: "last_slot", header: "마지막 차례", width: "18ch", cell: (row) => time(row.last_slot) },
    {
      key: "last_job_id",
      header: "그 작업",
      mono: true,
      cell: (row) =>
        row.last_job_id ? (
          <Link className="font-medium text-text-primary hover:text-primary" href={`/jobs/${encodeURIComponent(row.last_job_id)}`}>
            {row.last_job_id}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "last_missed",
      header: "놓친 차례",
      width: "10ch",
      align: "right",
      cell: (row) => String(row.last_missed ?? 0),
    },
    {
      key: "last_error",
      header: "결과",
      cell: (row) => {
        const found = scheduleResult(row, (jobId) => jobState.get(jobId));
        if (found.refused) return <span className="text-status-warning-fg">{found.label}</span>;
        return found.label === "—" ? "—" : <StatusBadge group="작업" label={found.label} />;
      },
    },
  ];

  return (
    <section className="mt-8 flex flex-col gap-2">
      <h2 className="text-h2 font-semibold">일정{zone ? ` (시간대 ${zone})` : ""}</h2>
      {failure ? (
        <ErrorBanner message={`일정을 읽지 못했습니다 — ${failure}`} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => `${row.bpm_process_id}@${row.version}:${row.target_id ?? "*"}:${row.expression}`}
            caption="타이머 시작 일정" numbered
          />
          <p className="text-body-sm text-text-muted">
            Center가 차례마다 작업을 만들어 깨웁니다. 놓친 차례는 가장 최근 한 번만 돌리고, 만든 작업은 다음
            차례에 만료됩니다. 지금 돌리려면 「작업 지시」, 멈추려면 그 배포를 거두세요.
          </p>
        </>
      )}
    </section>
  );
}
