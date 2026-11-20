import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ErrorBanner } from "@bpm/ui";
import { CenterError, center, session } from "@/lib/center";
import {
  candidates,
  jobQueue,
  runnerHealth,
  runsToday,
  waitingApprovals,
  workspaceTip,
} from "@/lib/dashboard";
import { Shell } from "@/components/Shell";
import { time } from "@/lib/time";

/**
 * CON-21 대시보드 — **홈이다** ([ADR-0151](../../../../../docs/decisions/0151-console-follows-the-lifecycle.md) §3).
 *
 * 들어오자마자 **실패·막힘·기다림**이 한 화면에 보이고 거기서 제 일로 간다. **역할로 가르지
 * 않는다** — 카드는 모두 같고 쓰기 단추가 없다(승인·배포·답하기는 그 화면에서 한다. 같은 단추가
 * 두 곳에 생기면 어느 쪽이 참인지 알 수 없다).
 *
 * **카드 하나가 못 세도 다른 카드는 그대로다** — 여섯 호출을 각각 받아 실패한 것만 「—」와 까닭을
 * 보인다 (U3). 하나가 500이라고 홈 전체가 오류 띠 하나로 바뀌면 들어올 자리가 없어진다.
 */
export default async function DashboardPage() {
  const found = await session();
  if (!found) redirect("/login");

  const [runs, approvals, packages, runners, jobs, workspaces] = await Promise.all([
    settle(() => center.runs({ limit: 200 })),
    settle(() => center.approvals({ state: "open" })),
    settle(() => center.packages()),
    settle(() => center.serverRunners()),
    settle(() => center.jobs({ limit: 200 })),
    settle(() => center.workspaces()),
  ]);

  const now = Date.now();
  const today = runs.value ? runsToday(runs.value.runs ?? [], now) : null;
  const waiting = approvals.value ? waitingApprovals(approvals.value, now) : null;
  const candidate = packages.value ? candidates(packages.value) : null;
  const health = runners.value ? runnerHealth(runners.value) : null;
  const queue = jobs.value ? jobQueue(jobs.value, now) : null;
  const spaces = workspaces.value ? workspaceTip(workspaces.value) : null;

  return (
    <Shell mode={found.mode} actor={found.actor} current="/dashboard">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold">대시보드</h1>
        <p className="text-body-sm text-text-muted">{time(new Date(now).toISOString())} 기준</p>
      </header>

      <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          title="오늘 실행"
          href="/runs?status=failed"
          link="실행 기록 보기"
          value={today ? String(today.failed) : null}
          unit="건 실패"
          note={
            today
              ? `완료 ${today.done} · 도는 중 ${today.running} · 기다리는 중 ${today.waiting}`
              : runs.error
          }
        />
        <Card
          title="기다리는 결재"
          href="/approvals"
          link="결재함 보기"
          value={waiting ? String(waiting.open) : null}
          unit="건"
          note={
            waiting
              ? [
                  waiting.oldestHours === null
                    ? "기다리는 결재가 없습니다"
                    : `가장 오래 기다린 것 ${waiting.oldestHours}시간`,
                  waiting.unassigned > 0
                    ? `담당자 없는 것 ${waiting.unassigned}건 — 콘솔에서만 답할 수 있습니다`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : approvals.error
          }
        />
        <Card
          title="승인 기다리는 후보"
          href="/deployments"
          link="배포 보기"
          value={candidate === null ? null : String(candidate)}
          unit="판"
          note={candidate === null ? packages.error : "승인하면 배포할 수 있습니다"}
        />
        <Card
          title="실행기"
          href="/server-runners"
          link="서버 실행기 보기"
          value={health ? `${health.online} / ${health.total}` : null}
          unit="대 온라인"
          note={
            health
              ? health.warning > 0
                ? `준비에 문제 있는 실행기 ${health.warning}대`
                : "모두 준비됨"
              : runners.error
          }
        />
        <Card
          title="작업 대기열"
          href="/jobs"
          link="작업 지시 보기"
          value={queue ? String(queue.waiting) : null}
          unit="건"
          note={
            queue
              ? queue.oldestMinutes === null
                ? "내려갈 작업이 없습니다"
                : `가장 오래 기다린 것 ${queue.oldestMinutes}분`
              : jobs.error
          }
        />
        <Card
          title="작업공간"
          href="/workspaces"
          link="작업공간 보기"
          value={spaces ? String(spaces.total) : null}
          unit="개"
          note={
            spaces
              ? spaces.latest
                ? `최근 고친 것: ${spaces.latest}`
                : "아직 만든 작업공간이 없습니다"
              : workspaces.error
          }
        />
      </ul>
    </Shell>
  );
}

/** 카드 하나 — **큰 숫자 하나 + 한 줄 + 그 화면으로 가는 링크**다. 쓰기 단추를 두지 않는다. */
function Card({
  title,
  href,
  link,
  value,
  unit,
  note,
}: {
  title: string;
  href: Route;
  link: string;
  /** `null`이면 **못 셌다** — 「—」와 까닭을 보인다 (0과 다르다). */
  value: string | null;
  unit: string;
  note: string | null;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
      <h2 className="text-body-sm font-semibold text-text-secondary">{title}</h2>
      <p className="flex items-baseline gap-1">
        <strong className="text-h1 font-bold tabular-nums">{value ?? "—"}</strong>
        {value === null ? null : <span className="text-body-sm text-text-muted">{unit}</span>}
      </p>
      <p className="min-h-10 text-body-sm text-text-secondary">
        {value === null ? <ErrorBanner message={note ?? "셀 수 없습니다"} /> : note}
      </p>
      <Link href={href} className="text-body-sm hover:underline" style={{ color: "var(--primary)" }}>
        {link} →
      </Link>
    </li>
  );
}

/** 하나가 실패해도 나머지를 그린다 — `(값 | 까닭)`. */
async function settle<T>(call: () => Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await call(), error: null };
  } catch (cause) {
    return {
      value: null,
      error: cause instanceof CenterError ? cause.message : "Center에서 읽지 못했습니다",
    };
  }
}
