import Link from "next/link";
import type { Route } from "next";
import { Activity, Inbox, PackageOpen, PencilRuler, ScrollText, Settings2 } from "lucide-react";
import { BpmMark, Button } from "@bpm/ui";
import { logout } from "@/app/actions";
import { openMode, session } from "@/lib/center";
import type { Mode } from "@/lib/session";
import { Fold } from "./Fold";
import { Refresh } from "./Refresh";

/**
 * CON-00 공통 틀 — **두 층이다** ([ADR-0145](../../../../../docs/decisions/0145-console-is-workspace-shaped.md)):
 * 좌측 **아이콘 레일**(56, 짙은 틀) + **펼침 패널**(224, 밝은 면) + 위 막대(48) + 본문.
 *
 * **짙은 색은 레일과 위 막대에만** 둔다 — 전에는 왼쪽 탐색 224가 남색이라 설계 중에도 화면
 * 왼쪽이 짙었다. 지금 자리(브레드크럼)는 본문 머리 띠에서 **위 막대로 올라왔다**.
 *
 * 폭·높이는 토큰이다 (`size.rail.width` 56 · `size.nav.width` 224 · `size.topbar.height` 48).
 * 패널은 접힌다 — 접으면 본문이 224 넓어진다 (`Fold`가 `<html data-panel>`을 바꾸고 CSS가 받는다).
 * 아직 없는 화면은 **끄고 이유를 가까이 적는다** (U3).
 */

/**
 * 탐색 한 줄. **아직 없는 화면에는 `href`가 없다** — 끄고 이유(`later`)를 말풍선에 보인다 (U3).
 * 그래야 타입 라우트(`typedRoutes`)가 없는 주소를 잡아 준다.
 *
 * **`later`에 마일스톤 이름을 적지 않는다** — 지나간 마일스톤을 가리키면 다음 사람이 「그쪽
 * 몫이구나」로 읽고 넘어간다. 공백 번호(`docs/09-gaps.md`)를 적는다.
 */
type NavItem =
  // `Route`로 적는다 — 리터럴 **합집합**을 `Link`에 넘기면 타입 라우트가 그중 하나로만
  // 좁혀 보고 나머지를 거부한다 (화면을 더할 때마다 깨졌다).
  | { label: string; href: Route; later?: never; adminOnly?: boolean }
  | { label: string; href?: never; later: string; adminOnly?: boolean };

/** 꺼진 줄에 붙는 짧은 표시. 이유는 말풍선에 있다. */
const LATER_BADGE = "아직";

/** 레일의 아이콘 한 벌 — Lucide 하나만 쓴다 (스타일 가이드 §6). */
type Icon = typeof Activity;

/**
 * 묶음 여섯 (CON-00 [R]·[P]). 레일에 아이콘 하나씩 서고, 누르면 그 묶음의 첫 화면으로 간다 —
 * 펼침 패널은 **지금 자리의 묶음**을 그린다.
 *
 * **아이콘에는 말풍선이 필수다** (ADR-0145 §5) — 글 없는 아이콘은 뜻이 흐려진다.
 */
const NAV: Array<{ label: string; icon: Icon; items: NavItem[] }> = [
  {
    // 설계가 콘솔 안으로 들어왔다 (ADR-0143) — 작업공간 하나가 BPM 프로세스 한 벌이다 (C17).
    label: "설계",
    icon: PencilRuler,
    items: [{ label: "작업공간", href: "/workspaces" }],
  },
  {
    label: "운영 현황",
    icon: Activity,
    items: [
      { label: "프로세스", href: "/bots" },
      { label: "앱", href: "/apps" },
    ],
  },
  {
    // 같은 둘(프로세스·앱)을 「지금 모습」(위)과 「지나온 이력」(여기)으로 가른다 (ADR-0121).
    label: "로그",
    icon: ScrollText,
    items: [
      { label: "프로세스", href: "/runs" },
      { label: "앱", href: "/app-logs" },
    ],
  },
  {
    label: "업무",
    icon: Inbox,
    items: [
      { label: "결재함", href: "/approvals" },
      { label: "작업 지시", href: "/jobs" },
      { label: "조직", href: "/organization" },
    ],
  },
  {
    label: "배포·자원",
    icon: PackageOpen,
    items: [
      { label: "공통 패키지", href: "/packages" },
      { label: "배포", href: "/deployments" },
      // 연결 앱 카탈로그 — 외부 정의·일꾼 앱과 그 작업, 보기만 한다 (CON-18, ADR-0138).
      { label: "연결 앱", href: "/connected-apps" },
      { label: "일꾼", href: "/consumers" },
    ],
  },
  {
    label: "관리",
    icon: Settings2,
    items: [
      // 계정을 보는 것도 관리자의 일이다 (C5 `GET /accounts`) — 보기 전용에는 줄이 없다.
      { label: "관리자 계정", href: "/accounts", adminOnly: true },
    ],
  },
];

export async function Shell({
  mode,
  actor,
  current,
  full,
  crumb,
  children,
}: {
  mode: Mode;
  actor: string;
  current: string;
  /**
   * **본문을 가득 쓴다** — 패딩도 머리 띠도 두지 않는다 (ADR-0145 §3). 작업공간(CON-20)처럼
   * 캔버스가 본문의 주인인 화면이 쓰고, 그 화면이 **제 머리 띠를 스스로 그린다**.
   */
  full?: boolean;
  /**
   * 지금 자리를 **그 화면이 안다**면 그것을 쓴다 — 작업공간 안에서는 「작업공간 › <이름>」이다
   * (ADR-0145 §1). 주소만으로는 이름을 알 수 없어 넘겨받는다. **자리 줄은 하나다** — 넘기는
   * 화면은 제 머리 띠에 같은 줄을 또 그리지 않는다.
   */
  crumb?: React.ReactNode;
  children: React.ReactNode;
}) {
  // **회사가 정해진 계정**(회사 관리자·회사 보기 전용)에게는 Center 관리자만의 메뉴를 가린다 (C16).
  const company = (await session())?.company ?? null;
  const centerAdmin = mode === "admin" && !company;
  const roleLabel = mode === "admin" ? (company ? "회사 관리자" : "관리자") : "보기 전용";
  // 열린 모드는 **켜 둔 것을 잊는 것**이 위험이라 늘 보이는 자리에 둔다 (ADR-0142 §5).
  const open = await openMode();
  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || centerAdmin),
  })).filter((group) => group.items.length > 0);
  const here = groups.find((group) => group.items.some((item) => item.href === current)) ?? null;

  return (
    <div className="min-h-screen">
      {/* [R] 레일 — 묶음마다 아이콘 하나. 맨 위가 마크다 (ADR-0118: 이름을 쓰지 않는다). */}
      <nav
        aria-label="주요 탐색"
        className="chrome fixed inset-y-0 left-0 z-40 flex flex-col items-center gap-1 py-3"
        style={{ width: "var(--size-rail-width)" }}
      >
        <Link href="/" title="첫 화면" className="mb-2 flex items-center rounded-md">
          <BpmMark label="첫 화면" className="h-6 w-auto" />
        </Link>
        {groups.map((group) => (
          <RailLink key={group.label} group={group} here={here?.label === group.label} />
        ))}
        <Fold />
      </nav>

      {/* [P] 펼침 패널 — **지금 자리의 묶음**을 그린다. 밝은 면이다. */}
      <aside
        aria-label={here ? `${here.label} 메뉴` : "메뉴"}
        className="console-panel fixed inset-y-0 z-30 overflow-y-auto border-r border-border-default bg-bg-surface"
        style={{ left: "var(--size-rail-width)" }}
      >
        <div style={{ width: "var(--size-nav-width)" }} className="p-3">
          <h2 className="mb-2 px-2 text-caption font-semibold text-text-muted">{here?.label ?? "메뉴"}</h2>
          <ul className="flex flex-col gap-1">
            {(here?.items ?? []).map((item) => (
              <li key={item.label}>
                <NavLink item={item} current={current} />
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* [A] 위 막대 — **지금 자리**를 쥔다 (전에는 본문 머리 띠에 있었다). */}
      <header
        className="chrome console-topbar fixed top-0 right-0 z-20 flex items-center gap-2 border-b-2 border-chrome-edge px-3 md:gap-3 md:px-5"
        style={{ height: "var(--size-topbar-height)" }}
      >
        {crumb ? (
            <nav aria-label="지금 자리" className="min-w-0 truncate text-body-sm">
            {crumb}
          </nav>
        ) : (
          <Crumb here={here?.label ?? null} current={current} />
        )}
        {open ? (
          <span
            title="키·승인 없이 들어옵니다 — 등록 요청이 저절로 승인되고, 일꾼이 스스로 들어오고, 키 없는 호출이 관리자입니다 (BPM_CENTER__OPEN_MODE)"
            className="ml-auto inline-flex items-center gap-2 rounded-full px-2 py-1 text-caption whitespace-nowrap"
            style={{
              color: "var(--status-warning-fg)",
              backgroundColor: "var(--status-warning-bg)",
              borderRadius: "var(--radius-full)",
            }}
          >
            <span
              aria-hidden
              className="inline-block size-2 shrink-0"
              style={{ backgroundColor: "var(--status-warning-solid)", borderRadius: "var(--radius-full)" }}
            />
            {/* 좁은 화면에서는 **점만** 남는다 — 말풍선이 뜻을 말한다 (자리를 로그아웃에 내준다). */}
            <span className="hidden md:inline">열린 모드</span>
          </span>
        ) : null}
        {/* 좁은 화면에서는 **누구인지를 접는다** — 결재는 휴대폰에서도 할 수 있어야 한다 (CON-00). */}
        <span
          className={`hidden text-body-sm whitespace-nowrap md:inline${open ? "" : " md:ml-auto"}`}
          title={`${actor} · ${roleLabel}${company ? ` · ${company}` : ""}`}
        >
          {actor}
          <span className="text-text-muted">
            {" "}
            · {roleLabel}
            {company ? ` · ${company}` : ""}
          </span>
        </span>
        <span className={open ? "" : "ml-auto md:ml-0"} />
        <Refresh />
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            로그아웃
          </Button>
        </form>
      </header>

      <main
        className={`console-main ${full ? "flex min-w-0 flex-col" : "page-main min-w-0 p-6"}`}
        style={{
          marginTop: "var(--size-topbar-height)",
          // 가득 쓰는 화면은 **남는 높이를 다 가진다** — 캔버스가 제 높이를 알아야 그릴 수 있다.
          ...(full ? { height: "calc(100vh - var(--size-topbar-height))" } : {}),
        }}
      >
        {children}
      </main>
    </div>
  );
}

/** 레일의 아이콘 하나 — 누르면 그 묶음의 첫 화면으로 간다. 고른 묶음은 왼쪽에 강조 막대. */
function RailLink({
  group,
  here,
}: {
  group: { label: string; icon: Icon; items: NavItem[] };
  here: boolean;
}) {
  const Glyph = group.icon;
  const first = group.items.find((item) => item.href);
  const body = <Glyph size={22} aria-hidden />;
  const shape = "relative flex size-10 items-center justify-center rounded-md";
  const mark = here ? (
    <span
      aria-hidden
      className="absolute top-1 bottom-1 left-0 w-0.5 rounded-full"
      style={{ backgroundColor: "var(--primary)" }}
    />
  ) : null;

  // 갈 곳이 없는 묶음은 **끄고 까닭을 말풍선에** 둔다 (U3).
  if (!first?.href) {
    return (
      <span className={`${shape} text-text-muted`} title={`${group.label} — 아직`} aria-label={group.label}>
        {mark}
        {body}
      </span>
    );
  }
  return (
    <Link
      href={first.href}
      title={group.label}
      aria-label={group.label}
      aria-current={here ? "true" : undefined}
      className={`${shape} ${here ? "bg-bg-subtle text-text-primary" : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary"}`}
    >
      {mark}
      {body}
    </Link>
  );
}

/** 위 막대의 지금 자리 — 「<묶음> › <자리>」. 자리는 그 목록으로 가는 링크다. */
function Crumb({ here, current }: { here: string | null; current: string }) {
  const group = NAV.find((one) => one.label === here);
  const item = group?.items.find((one) => one.href === current);
  return (
    <nav aria-label="지금 자리" className="min-w-0 truncate text-body-sm">
      {group && item?.href ? (
        <>
          <span className="text-text-muted">{group.label}</span>
          <span className="text-text-muted"> › </span>
          <Link href={item.href} className="hover:underline">
            {item.label}
          </Link>
        </>
      ) : null}
    </nav>
  );
}

function NavLink({ item, current }: { item: NavItem; current: string }) {
  if (item.later) {
    return (
      <span
        className="flex items-center justify-between rounded-md px-3 py-1.5 text-body-sm text-text-muted"
        title={item.later}
      >
        {item.label}
        <span className="text-caption">{LATER_BADGE}</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href!}
      aria-current={current === item.href ? "page" : undefined}
      className={
        current === item.href
          ? "block rounded-md bg-primary-subtle px-3 py-1.5 text-body-sm font-semibold text-text-primary"
          : "block rounded-md px-3 py-1.5 text-body-sm hover:bg-bg-subtle"
      }
    >
      {item.label}
    </Link>
  );
}
