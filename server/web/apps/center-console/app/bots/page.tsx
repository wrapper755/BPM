import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Button, EmptyState, ErrorBanner, StatusBadge } from "@bpm/ui";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { namesOf, placeLine, workPlaceLabel } from "@/lib/organization";
import { ServerRunners } from "@/components/ServerRunners";
import { Schedules } from "@/components/Schedules";
import { STATUS_LABEL, packageHref, time } from "@/app/packages/page";
import { DeleteVersion } from "./tools";
import { PackageActions } from "@/components/PackageActions";
import {
  NO_RUNS,
  SAMPLE,
  SCAN,
  STATUS_FILTERS,
  compareVersions,
  deployedRunners,
  filterGroups,
  percent,
  sortGroups,
  statusFilterOf,
  summarize,
  type BotRow,
  type GroupSort,
  type ProcessGroup,
  type RunFields,
} from "@/lib/summary";

// 세는 일은 `lib/summary.ts`에 있다 (화면을 모르는 자리 — 시험이 그것을 잰다).
export { NO_RUNS, SAMPLE, SCAN, deployedRunners, percent, summarize };
export type { BotRow, RunFields };

/**
 * CON-02 BPM 프로세스 — BPM 프로세스·버전별 준비도. **BPM 프로세스마다 카드 하나**다 (판을 묶는다).
 *
 * **Center가 집계를 갖고 있지 않다.** 실행 요약(C3 `RunInfo`)·보고된 준비 상태(C4
 * `readiness`)·누락 리소스(C5 `missing_resources`)를 **콘솔에서 묶어** 보인다 — Center에 집계
 * 표를 두면 실행이 올 때마다 낡고, 어느 쪽이 원본인지 흐려진다 (CON-01의 셈 열과 같은 결).
 *
 * **「투입 가능」 같은 판정 열을 두지 않는다** (화면 문서) — 판단은 관리자 몫이고, 화면은 숫자와
 * 경고만 보인다.
 *
 * 셈은 **끝난 실행**만 센다 — 도는 중인 실행의 셈 칸은 `null`이다 (C3: 요약은 받을 때 만든다).
 */



/**
 * 「확인률」은 C3 요약의 **`confirmations`**(확인만 센 수)로 잰다. 그 칸은 **선택 칸**이라
 * 옛 PC 실행기가 보낸 기록에는 없다 — 그런 실행은 **분모에도 넣지 않는다**(`confirm_sample`).
 * 0으로 세면 「확인이 없었다」와 「세지 않았다」가 같아져 확인률이 조용히 낮아진다.
 */
export const CONFIRM_NOTE =
  "「확인률」은 확인 요청만 셉니다 (결재는 제외) — 그 셈을 보내지 않은 옛 기록은 표본에서 빠집니다.";



/**
 * 비율 막대 — 글자 + 가로 막대 (스타일 가이드 §7: **색만으로 뜻을 전하지 않는다**).
 *
 * 색은 `status_map`이 쓰는 상태 토큰에서 온다 (값을 코드에 적지 않는다).
 */
function Rate({ part, whole, token }: { part: number; whole: number; token: string }) {
  const shown = percent(part, whole);
  if (shown === null) return <span className="text-text-muted">—</span>;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="tabular-nums">{shown}</span>
      <span
        aria-hidden
        className="h-2 w-16 shrink-0 overflow-hidden"
        style={{ backgroundColor: "var(--color-bg-subtle)", borderRadius: "var(--radius-full)" }}
      >
        <span
          className="block h-full"
          style={{
            width: shown,
            backgroundColor: `var(--status-${token}-solid)`,
            borderRadius: "var(--radius-full)",
          }}
        />
      </span>
    </span>
  );
}





export default async function BotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const query = await searchParams;
  const status = statusFilterOf(query.status);
  const sort: GroupSort = query.sort === "name" ? "name" : "trouble";

  let rows: BotRow[] = [];
  let failure: string | null = null;
  try {
    // BPM 프로세스·배포·보고된 준비 상태는 **한 번에** 읽는다 (서로를 기다릴 일이 없다).
    const [packages, runners, deployments, companyNames, departmentNames, staffNames] = await Promise.all([
      center.packages({ kind: "bpm_process" }),
      center.serverRunners(),
      center.deployments({ active: true }),
      // 승인 창에 보일 회사·업무 자리의 **이름** (C16) — 못 읽으면 id로 보인다.
      center.companies().then(namesOf, () => ({}) as Record<string, string>),
      center.departments().then(namesOf, () => ({}) as Record<string, string>),
      center.staffList().then(namesOf, () => ({}) as Record<string, string>),
    ]);

    // 실행 요약은 **BPM 프로세스마다** 묻는다 — 한 번에 받아 오면 판이 많은 BPM 프로세스의 옛 판이 잘린다.
    const ids = [...new Set(packages.map((one) => one.id))];
    const sampled = await Promise.all(
      ids.map(async (id) => summarize((await center.runs({ bpm_process_id: id, limit: SCAN })).runs ?? [])),
    );
    const counts = new Map(sampled.flatMap((one) => [...one.entries()]));

    rows = packages
      .map((one) => {
        const key = `${one.id}@${one.version}`;
        const reported = runners.flatMap((runner) =>
          (runner.readiness ?? []).filter(
            (ready) => ready.bpm_process_id === one.id && ready.version === one.version,
          ),
        );
        const unusable = reported.filter((ready) => ready.ready === false);
        return {
          id: one.id,
          version: one.version,
          name: one.name ?? null,
          status: one.status,
          // `id`에 판이 붙어 온다 (C5 — `version` 칸이 따로 없다). 사유도 함께 보인다.
          missing: (one.missing_resources ?? []).map((gone) => `${gone.type} ${gone.id} (${gone.reason})`),
          blocked: unusable.length,
          blocked_codes: [
            ...new Set(unusable.flatMap((ready) => ready.blocked ?? [])),
          ],
          ...deployedRunners(deployments as DeploymentInfo[], one.id, one.version),
          place_line: placeLine(
            one.company ? (companyNames[one.company] ?? one.company) : null,
            workPlaceLabel(one.place, { departments: departmentNames, staff: staffNames }),
          ),
          // **실행 요약은 제 칸만 덮는다** (`RunFields`) — 위에서 센 「실행 불가」·「배포된
          // 실행기」가 살아 있어야 한다.
          ...(counts.get(key) ?? NO_RUNS),
        } as BotRow;
      })
      .sort((a, b) => a.id.localeCompare(b.id) || compareVersions(a.version, b.version));
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const notReady = rows.filter((row) => row.blocked > 0);
  const incomplete = rows.filter((row) => row.missing.length > 0);
  const groups = sortGroups(filterGroups(rows, { q: query.q, status }), sort);
  const admin = found.mode === "admin";

  return (
    <Shell mode={found.mode} actor={found.actor} current="/bots">
      <header className="mb-4">
        <h1 className="text-h2 font-bold">프로세스</h1>
      </header>

      {/* [F] 거르기 — GET 폼이라 JS 없이 돌고 주소에 남는다. */}
      <form className="filter-card mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-body-sm">
          이름
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="(전체)"
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          />
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          상태
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {STATUS_FILTERS.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          정렬
          <select
            name="sort"
            defaultValue={sort}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            <option value="trouble">문제 먼저</option>
            <option value="name">이름순</option>
          </select>
        </label>
        <Link
          href="/bots"
          className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-body text-text-secondary hover:bg-bg-subtle"
        >
          초기화
        </Link>
        <Button type="submit" variant="secondary">
          좁히기
        </Button>
      </form>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="올라온 프로세스가 없습니다."
          hint="Studio에서 「Center로 올리기」로 올리세요."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {notReady.length > 0 ? (
            <ErrorBanner
              message={`사전 점검에 실행 불가 항목이 있는 버전: ${notReady
                .map((row) => `${row.id}@${row.version} (${row.blocked}대)`)
                .join(", ")}`}
            />
          ) : null}
          {incomplete.length > 0 ? (
            <ErrorBanner
              message={`필요한 리소스가 Center에 없는 버전 (배포 시 거부됨): ${incomplete
                .map((row) => `${row.id}@${row.version}`)
                .join(", ")}`}
            />
          ) : null}

          {groups.length === 0 ? (
            <EmptyState title="조건에 맞는 프로세스가 없습니다." hint="거르기를 초기화하세요." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-label="프로세스">
              {groups.map((group) => (
                <ProcessCard key={group.id} group={group} admin={admin} />
              ))}
            </ul>
          )}
          <p className="text-body-sm text-text-muted">
            {CONFIRM_NOTE} 셈은 끝난 실행만 셉니다 — 도는 중인 실행은 표본에 들어가지 않습니다.
            프로세스마다 최근 {SCAN}건을 훑어 버전별로 {SAMPLE}회까지 셉니다 (그보다 적으면 표본 수가
            작게 보입니다).
          </p>

          {admin ? (
            <DeleteVersion rows={rows.map((row) => ({ id: row.id, version: row.version }))} />
          ) : (
            <p className="text-body-sm text-text-muted">
              승인·삭제는 관리자 계정으로 합니다.
            </p>
          )}
        </div>
      )}

      {/* 실행이 도는 곳 — 서버 실행기 목록·승인 대기·대기열 (옛 CON-12 목록). */}
      <div className="mt-8">
        <ServerRunners admin={found.mode === "admin"} />
      </div>

      {/* [S] 「일정」 — 타이머로 시작하는 배포 (C5 §일정). 없으면 영역이 없다. */}
      {failure ? null : <Schedules />}
    </Shell>
  );
}

/** 비어 있는 셈 — 「—」 (0으로 보이면 「없었다」로 읽힌다). */
const NONE = <span className="text-text-muted">—</span>;

/** 확인률 — **분모는 그 칸을 보낸 실행 수**다. 0이면 「—」다. */
function confirmRate(row: BotRow) {
  return row.confirm_sample === 0 ? NONE : `${(row.confirmations / row.confirm_sample).toFixed(1)}회`;
}

/** 지표 한 칸 — 이름 위, 값 아래. */
function Metric({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <dt className="text-body-sm text-text-muted">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  );
}

/**
 * [B] 카드 한 장 — BPM 프로세스 하나 (CON-02). 앞면은 **대표 판**의 지표이고 나머지 판은
 * 「다른 판」에 접힌다. 승인 단추는 판마다 그 줄에 드러나 있다.
 */
/** 승인 단추가 있는 상태 (`PackageActions`의 `asksFor`와 같다 — 철회는 끝이라 단추가 없다). */
const ACTIONABLE = new Set(["candidate", "approved", "deprecated"]);

function ProcessCard({ group, admin }: { group: ProcessGroup; admin: boolean }) {
  const { lead } = group;
  const blocked = group.troubled.filter((row) => row.blocked > 0);
  const missing = group.troubled.filter((row) => row.missing.length > 0);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
      {/* 업무 이름이 먼저, id는 그 아래 작게 (화면 문서 CON-02 [I]) — 이름이 없으면 id가 제목이다. */}
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          className={`truncate text-body font-semibold underline ${group.name ? "" : "font-mono"}`}
          href={packageHref({ id: lead.id, version: lead.version, kind: "bpm_process" })}
        >
          {group.name ?? group.id}
        </Link>
        {group.name ? <span className="truncate font-mono text-body-sm text-text-muted">{group.id}</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body">{lead.version}</span>
        <StatusBadge group="패키지" label={STATUS_LABEL[lead.status] ?? lead.status} />
        {/* 승인 단추는 숨기지 않고 드러내 둔다 (CON-02 [M]). */}
        {admin && ACTIONABLE.has(lead.status) ? (
          <span className="ml-auto">
            <PackageActions packageId={lead.id} version={lead.version} status={lead.status} place={lead.place_line} />
          </span>
        ) : null}
      </div>

      {lead.sample === 0 ? (
        <p className="text-body-sm text-text-muted">아직 끝난 실행이 없습니다.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Metric label="성공률">
            <Rate part={lead.successes} whole={lead.sample} token="done" />
          </Metric>
          <Metric label="재생률">
            <Rate part={lead.replayed} whole={lead.ai_tasks} token="replayed" />
          </Metric>
          <Metric label="확인률" title={CONFIRM_NOTE}>
            <span className="tabular-nums">{confirmRate(lead)}</span>
          </Metric>
          <Metric label="표본 수">
            <span className="tabular-nums">{lead.sample}회</span>
          </Metric>
          <Metric label="최근 성공">{time(lead.last_success)}</Metric>
          {/* **건수가 아니라 실행기 수**다. 건수는 툴팁에. */}
          <Metric label="배포된 실행기" title={`살아 있는 배포 ${lead.deployments}건`}>
            {lead.runners === 0 ? NONE : <span className="tabular-nums">{lead.runners}대</span>}
          </Metric>
        </dl>
      )}

      {blocked.length > 0 || missing.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {blocked.map((row) => (
            <span
              key={`blocked-${row.version}`}
              title={row.blocked_codes.join(", ") || undefined}
              className="rounded-md bg-status-failed-bg px-2 py-0.5 text-body-sm text-status-failed-fg"
            >
              {row.version} 실행 불가 {row.blocked}대
            </span>
          ))}
          {missing.map((row) => (
            <span
              key={`missing-${row.version}`}
              title={row.missing.join(", ")}
              className="rounded-md bg-status-warning-bg px-2 py-0.5 text-body-sm text-status-warning-fg"
            >
              {row.version} 리소스 {row.missing.length}개 없음
            </span>
          ))}
        </div>
      ) : null}

      {group.others.length > 0 ? (
        <details className="border-t border-border-default pt-2">
          <summary className="cursor-pointer text-body-sm text-text-secondary">
            다른 판 ({group.others.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {group.others.map((row) => (
              <li key={row.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
                <Link className="font-mono underline" href={packageHref({ id: row.id, version: row.version, kind: "bpm_process" })}>
                  {row.version}
                </Link>
                <StatusBadge group="패키지" label={STATUS_LABEL[row.status] ?? row.status} />
                <span className="tabular-nums">
                  {percent(row.successes, row.sample) ?? "—"} · {row.sample === 0 ? "—" : `${row.sample}회`}
                </span>
                <span className="text-text-muted">{time(row.last_success)}</span>
                {admin && ACTIONABLE.has(row.status) ? (
                  <span className="ml-auto">
                    <PackageActions packageId={row.id} version={row.version} status={row.status} place={row.place_line} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
