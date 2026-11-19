import { redirect } from "next/navigation";
import { EmptyState, ErrorBanner } from "@bpm/ui";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { namesOf, placeLine, workPlaceLabel } from "@/lib/organization";
import { ServerRunners } from "@/components/ServerRunners";
import { Schedules } from "@/components/Schedules";
import { DeleteVersion } from "./tools";
// 거르기와 표는 **브라우저 쪽**에 있다 (ADR-0160) — 서버는 줄을 다 보내 두기만 한다.
import { CONFIRM_NOTE, ProcessTable } from "./table";
import {
  NO_RUNS,
  SAMPLE,
  SCAN,
  bannerRows,
  compareVersions,
  deployedRunners,
  summarize,
  type BotRow,
} from "@/lib/summary";

/**
 * CON-02 BPM 프로세스 — BPM 프로세스·버전별 준비도. **판마다 한 줄**인 표다 ([ADR-0159](../../../../../docs/decisions/0159-con-02-is-a-table-like-the-others.md) —
 * 콘솔의 목록은 모두 같은 표다). 묶는 일은 **차례를 정하는 동안만** 한다.
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




export default async function BotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  // 거르기 값은 **표가 들고 있다** (ADR-0160) — 서버는 첫 그림에 쓰라고 그대로 건넨다.
  const query = await searchParams;

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

  // **띠에 오는 것은 사람이 고칠 것뿐이다** (ADR-0158) — 세는 자리는 `lib/summary.ts`다.
  const { notReady, incomplete } = bannerRows(rows);
  const admin = found.mode === "admin";

  return (
    <Shell mode={found.mode} actor={found.actor} current="/bots">
      <header className="mb-4">
        <h1 className="text-h2 font-bold">프로세스</h1>
      </header>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="올라온 프로세스가 없습니다."
          hint="「저작 › 작업공간」에서 「배포 후보로 만들기」로 올리세요."
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

          <ProcessTable rows={rows} admin={admin} query={query} />
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
