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
  todo,
  waitingApprovals,
  workspaceTip,
  type TodoItem,
  type TodoKind,
} from "@/lib/dashboard";
import { loadProcessNames, processNamer } from "@/lib/names";
import { Shell } from "@/components/Shell";
import { ICON } from "@/components/icons";
import type { LucideIcon } from "lucide-react";
import { duration } from "@/lib/summary";
import { between, time, took } from "@/lib/time";

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
  // 「지금 할 일」 — 카드가 받은 재료로만 (ADR-0183). 못 받은 종류는 빠지고 아래 까닭을 적는다.
  const todos = todo(
    { runs: runs.value ? (runs.value.runs ?? []) : null, approvals: approvals.value, packages: packages.value },
    now,
  );
  const named = processNamer(await loadProcessNames());
  const missing = [
    runs.error ? `실패한 실행을 읽지 못했습니다 — ${runs.error}` : null,
    approvals.error ? `결재를 읽지 못했습니다 — ${approvals.error}` : null,
    packages.error ? `승인 기다리는 후보를 읽지 못했습니다 — ${packages.error}` : null,
  ].filter((one): one is string => one !== null);

  return (
    <Shell mode={found.mode} actor={found.actor} current="/dashboard">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold">대시보드</h1>
        <p className="text-body-sm text-text-muted">{time(new Date(now).toISOString())} 기준</p>
      </header>

      <TodoList todo={todos} named={named} missing={missing} now={now} />

      <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          // 큰 숫자가 **실패 수**다 — 「오늘 실행 0건」이 무엇인지 헷갈리지 않게 (ADR-0183).
          title="최근 24시간 실패"
          icon={ICON.failed}
          href="/runs?status=failed"
          link="실행 기록 보기"
          value={today ? String(today.failed) : null}
          unit="건"
          note={
            today
              ? // 도는 중·기다리는 중은 **오늘 시작한 것만이 아니다** (`runsToday`) — 「지금」이라고 적는다.
                `완료 ${today.done} · 지금 도는 중 ${today.running} · 지금 기다리는 중 ${today.waiting}`
              : runs.error
          }
        />
        <Card
          title="기다리는 결재"
          icon={ICON.approvals}
          href="/approvals"
          link="결재함 보기"
          value={waiting ? String(waiting.open) : null}
          unit="건"
          note={
            waiting
              ? [
                  waiting.oldestSeconds === null
                    ? "기다리는 결재가 없습니다"
                    : `가장 오래 기다린 것 ${duration(waiting.oldestSeconds)}`,
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
          icon={ICON.candidates}
          // 승인은 배포의 첫 걸음이다 — CON-15 「승인 대기」 탭 (ADR-0181).
          href="/deployments?tab=pending"
          link="승인하러 가기"
          value={candidate === null ? null : String(candidate)}
          unit="판"
          note={candidate === null ? packages.error : "승인하면 배포할 수 있습니다"}
        />
        <Card
          title="실행기"
          icon={ICON.runners}
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
          icon={ICON.jobs}
          href="/jobs"
          link="작업 지시 보기"
          value={queue ? String(queue.waiting) : null}
          unit="건"
          note={
            queue
              ? queue.oldestSeconds === null
                ? "내려갈 작업이 없습니다"
                : `가장 오래 기다린 것 ${duration(queue.oldestSeconds)}`
              : jobs.error
          }
        />
        <Card
          title="작업공간"
          icon={ICON.projects}
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

/** 종류 표지 — 아이콘은 카드·메뉴와 **같은 모양**이다 (`icons.ts`, ADR-0187). */
const KIND: Record<TodoKind, { label: string; icon: LucideIcon; tone: string; list: Route; listName: string }> = {
  failed: {
    label: "실패",
    icon: ICON.failed,
    tone: "bg-status-failed-bg text-status-failed-fg",
    list: "/runs?status=failed",
    listName: "실패",
  },
  approval: { label: "결재", icon: ICON.approvals, tone: "bg-bg-subtle text-text-secondary", list: "/approvals", listName: "결재" },
  candidate: {
    label: "승인",
    icon: ICON.candidates,
    tone: "bg-bg-subtle text-text-secondary",
    list: "/deployments?tab=pending",
    listName: "승인",
  },
};

function todoHref(item: TodoItem): Route {
  if (item.kind === "failed") return `/runs/${encodeURIComponent(item.key)}` as Route;
  if (item.kind === "approval") return `/approvals/${encodeURIComponent(item.key)}` as Route;
  return "/deployments?tab=pending";
}

/**
 * 「지금 할 일」 ([ADR-0183](../../../../../docs/decisions/0183-dashboard-shows-what-to-do-now.md)) — 사람이 손대야
 * 풀리는 것만. 줄 전체가 그 항목으로 가는 링크이고 **쓰기 단추는 없다** (ADR-0151 — 같은 단추는 한 곳).
 */
function TodoList({
  todo: found,
  named,
  missing,
  now,
}: {
  todo: ReturnType<typeof todo>;
  named: ReturnType<typeof processNamer>;
  missing: string[];
  now: number;
}) {
  const more = (Object.keys(found.more) as TodoKind[]).filter((kind) => found.more[kind] > 0);
  return (
    <section className="mb-6 rounded-lg border border-border-default bg-bg-surface">
      <h2 className="border-b border-border-default px-4 py-3 text-body font-semibold">지금 할 일</h2>
      {found.items.length === 0 ? (
        <p className="px-4 py-4 text-body-sm text-text-muted">지금 손댈 것이 없습니다.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {found.items.map((item) => {
            const what =
              item.kind === "candidate"
                ? `${item.title ?? item.bpm_process_id} · v${item.version}`
                : (item.title ?? named(item.bpm_process_id, item.version) ?? item.bpm_process_id ?? "—");
            // 실패는 **언제 끝났나**, 결재·승인은 **얼마나 기다렸나**가 요점이다.
            const when =
              item.kind === "failed" ? time(item.since) : took(between(item.since, null, new Date(now)));
            return (
              <li key={`${item.kind}:${item.key}`} className="border-b border-border-default last:border-b-0">
                <Link
                  href={todoHref(item)}
                  className="flex items-center gap-3 px-4 py-3 text-body hover:bg-bg-subtle"
                >
                  <Kind kind={item.kind} />
                  <span className="min-w-0 flex-1 truncate text-text-primary">{what}</span>
                  <span className="shrink-0 whitespace-nowrap text-body-sm tabular-nums text-text-muted">{when}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {more.length > 0 || missing.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border-default px-4 py-3 text-body-sm text-text-muted">
          {more.length > 0 ? (
            <p className="flex flex-wrap gap-x-3">
              <span>그 밖에</span>
              {more.map((kind) => (
                <Link key={kind} href={KIND[kind].list} className="text-primary hover:underline">
                  {KIND[kind].listName} {found.more[kind]}건
                </Link>
              ))}
            </p>
          ) : null}
          {missing.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** 종류 표지 하나 — 아이콘 16 + 글. 줄마다 폭이 같아 「무엇」 열이 한 줄로 선다. */
function Kind({ kind }: { kind: TodoKind }) {
  const { label, icon: Icon, tone } = KIND[kind];
  return (
    <span className={`inline-flex w-16 shrink-0 items-center justify-center gap-1 rounded-sm px-2 py-0.5 text-caption font-semibold ${tone}`}>
      <Icon size={16} aria-hidden className="shrink-0" />
      {label}
    </span>
  );
}

/** 카드 하나 — **큰 숫자 하나 + 한 줄 + 그 화면으로 가는 링크**다. 쓰기 단추를 두지 않는다. */
function Card({
  title,
  icon: Icon,
  href,
  link,
  value,
  unit,
  note,
}: {
  title: string;
  /** 제목 앞 아이콘 (16) — 메뉴 줄과 같은 모양(ADR-0187). 장식이라 읽지 않는다. */
  icon: LucideIcon;
  href: Route;
  link: string;
  /** `null`이면 **못 셌다** — 「—」와 까닭을 보인다 (0과 다르다). */
  value: string | null;
  unit: string;
  note: string | null;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4">
      <h2 className="flex items-center gap-2 text-body-sm font-semibold text-text-secondary">
        <Icon size={16} aria-hidden className="shrink-0 text-text-muted" />
        {title}
      </h2>
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
