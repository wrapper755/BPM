import Link from "next/link";
import type { Route } from "next";
import { LogOut } from "lucide-react";
import { Button } from "@bpm/ui";
import { logout } from "@/app/actions";
import { session } from "@/lib/center";
import type { Mode } from "@/lib/session";
import { BAR_BUTTON } from "./bar-button";
import { Refresh } from "./Refresh";
import { ThemeToggle } from "./ThemeToggle";
import { TopNav, type NavGroup, type NavItem } from "./TopNav";

/**
 * CON-00 공통 틀 — **위 막대 하나다** ([ADR-0152](../../../../../docs/decisions/0152-console-chrome-is-one-top-bar.md)):
 * 화면 폭 전체의 **밝은 띠**(56)에 마크 + 「BPM」 + 묶음 일곱, 그 아래가 본문이다
 * ([ADR-0161](../../../../../docs/decisions/0161-soft-cards.md) — 짙은 틀을 벗었다. 본문은 가운데 최대 폭 안에 선다).
 * 레일(56)과 펼침 패널(224)은 걷었다 — 묶음이 여섯·줄이 열하나뿐이라 280px를 늘 쥐고도 패널이
 * 거의 비어 있었다.
 *
 * **지금 자리는 본문 머리로 내려왔다** (§4) — 위 막대를 메뉴가 쥐었고, 상세 화면이 목록으로
 * 돌아가는 길은 그 줄뿐이라 없앨 수 없다.
 *
 * 아직 없는 화면은 **끄고 이유를 가까이 적는다** (U3).
 */

/**
 * 묶음 일곱 (CON-00 [A]·[M]) — **BPM 생애주기 차례**다: 대시보드 → 저작 → 라이브러리 → 배포 → 운영 → 연결 → 권한·조직
 * ([ADR-0151](../../../../../docs/decisions/0151-console-follows-the-lifecycle.md), 「라이브러리」는
 * [ADR-0176](../../../../../docs/decisions/0176-projects-have-shared-packages.md)). 가로 막대라 **왼쪽에서
 * 오른쪽으로 읽힌다**.
 *
 * **줄마다 한 줄 설명(`note`)이 붙는다** — 그 화면에 **무엇이 있는지**를 말한다 (ADR-0152 §2).
 * 이름만으로는 눌러 봐야 아는 것을 글로 먼저 말하는 자리다.
 *
 * **줄 이름과 화면 제목이 같다** — 전에는 「운영 현황 › 프로세스」와 「로그 › 프로세스」가 같은
 * 이름이어서 눌러 봐야 어느 쪽인지 알았다 (ADR-0121이 화면 제목으로만 가르던 것이다).
 *
 * **결재함·작업 지시가 「운영」에 있다** — 결재의 정식 길은 **대리 답용 키의 API**이고
 * ([ADR-0081](../../../../../docs/decisions/0081-answering-on-behalf.md)) 콘솔 결재함은 ①막힌 것 찾기
 * ②담당자 없는 결재 답하기 ③감사용이다. 셋 다 운영자의 일이라 「업무」 묶음을 따로 두지 않는다.
 */
const NAV: Array<{ label: string; items: Array<NavItem & { adminOnly?: boolean }> }> = [
  {
    // 들어오는 자리 — 실패·막힘·기다림을 한 화면에서 본다 (CON-21). 역할로 가르지 않는다.
    label: "대시보드",
    items: [{ label: "대시보드", href: "/dashboard", note: "실패·막힘·기다림을 한 화면에서" }],
  },
  {
    // 저작이 콘솔 안으로 들어왔다 (ADR-0143) — 작업공간 하나가 BPM 프로세스 한 벌이다 (C17).
    // 공통 패키지를 **만드는** 자리도 프로젝트 안이다 (ADR-0176).
    label: "저작",
    items: [{ label: "프로젝트", href: "/workspaces", note: "프로세스를 묶고 그림을 그려 그 자리에서 돌려 본다" }],
  },
  {
    // 지어 올린 공통 패키지를 **회사 범위로 보고 고르는** 자리 — 배포되는 것이 아니다 (ADR-0169·0176).
    label: "라이브러리",
    items: [{ label: "공통 패키지", href: "/packages", note: "지어 올린 공유 프로세스 — 프로세스가 설치해서 부른다" }],
  },
  {
    // 내보내는 것 — 지은 것을 현장에 올린다. 줄이 하나라 펼치지 않고 바로 간다.
    label: "배포",
    items: [{ label: "배포", href: "/deployments", note: "승인된 판을 실행기에 올리고 철회한다" }],
  },
  {
    // 지키는 것 — 지금 모습·지나온 기록·막힌 결재·내려갈 작업이 **한 묶음**이다 (ADR-0151 §1).
    label: "운영",
    items: [
      { label: "프로세스", href: "/bots", note: "배포된 것이 지금 어떤 상태인가" },
      { label: "실행 기록", href: "/runs", note: "지나간 실행을 찾아 무엇이 막혔는지 본다" },
      { label: "결재함", href: "/approvals", note: "사람이 답해야 풀리는 것들" },
      { label: "작업 지시", href: "/jobs", note: "언제 돌릴지 시키고 대기열을 본다" },
      // 실행이 도는 자리 — 판의 것이 아니라 CON-02 아래에서 떼어 냈다 (ADR-0172).
      { label: "서버 실행기", href: "/server-runners", note: "실행이 도는 곳과 Center 대기열" },
    ],
  },
  {
    // 바깥을 들이는 것 — 앱 카탈로그(CON-18)와 그것을 맡는 일꾼(CON-17)은 한 짝이다.
    label: "연결",
    items: [
      { label: "앱", href: "/connected-apps", note: "프로세스가 부르는 바깥 앱 목록" },
      { label: "일꾼", href: "/consumers", note: "그 앱들의 일감을 가져가는 쪽" },
    ],
  },
  {
    // 사람과 권한 — 업무가 아니라 **누가 무엇을 할 수 있나**다.
    label: "권한·조직",
    items: [
      { label: "조직", href: "/organization", note: "회사·부서·직원과 업무 자리" },
      // 계정을 보는 것도 관리자의 일이다 (C5 `GET /accounts`) — 보기 전용에는 줄이 없다.
      {
        label: "관리자 계정",
        href: "/accounts",
        note: "콘솔에 들어오는 계정과 역할",
        adminOnly: true,
      },
    ],
  },
];

export async function Shell({
  mode,
  actor,
  current,
  here,
  full,
  children,
}: {
  mode: Mode;
  actor: string;
  current: string;
  /**
   * **본문을 가득 쓴다** — 패딩도 머리 띠도 두지 않는다 (ADR-0145 §3). 작업공간(CON-20)처럼
   * 캔버스가 본문의 주인인 화면이 쓰고, 그 화면이 **제 머리 띠를 스스로 그린다** — 그 작업공간의
   * 이름도 거기 있다 (ADR-0152 §7).
   */
  full?: boolean;
  /** 목록 **아래의** 화면이면 그 이름(「새 배포」) — 지금 자리 줄 끝에 붙고 목록이 링크가 된다 (CON-00 [H]). */
  here?: string;
  children: React.ReactNode;
}) {
  // **회사가 정해진 계정**(회사 관리자·회사 보기 전용)에게는 Center 관리자만의 메뉴를 가린다 (C16).
  const company = (await session())?.company ?? null;
  const centerAdmin = mode === "admin" && !company;
  const roleLabel = mode === "admin" ? (company ? "회사 관리자" : "관리자") : "보기 전용";
  const who = `${actor} · ${roleLabel}${company ? ` · ${company}` : ""}`;
  const groups: NavGroup[] = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || centerAdmin),
  })).filter((group) => group.items.length > 0);

  return (
    // `flow-root` — 본문의 `margin-top`(위 막대 높이)이 이 틀 밖으로 새면(여백 겹침) 문서가 막대 높이만큼
    // 길어져 화면이 굴러가고, 작업공간(CON-20b)의 머리 띠가 막대 밑으로 숨는다.
    <div className="flow-root min-h-screen">
      {/* [A] 위 막대 — 마크·메뉴·누구인지. **틀은 이것 하나다.** 바탕과 같은 결의 흰 면에 아래 선 하나 (ADR-0161). */}
      {/* 띠는 화면 폭 전체, **안쪽은 본문과 같은 최대 폭·같은 여백**이다 — 마크의 왼쪽 끝이 본문 제목과
          줄이 맞는다 (ADR-0164 — 로고가 화면 끝에, 본문이 가운데에 따로 떠 있었다). 바탕은 칠한 면이다
          (흐림 효과는 고정 위치로 펴는 메뉴·설명의 기준을 바꿔 걷었다). */}
      <header
        className="fixed inset-x-0 top-0 z-40 border-b border-border-default bg-bg-surface"
        style={{ height: "var(--size-topbar-height)" }}
      >
        {/* 가득 쓰는 화면(CON-20b)은 본문이 화면 끝까지 가므로 막대도 **폭을 풀고 그 머리 띠와 같은 여백**이다 —
            넓은 화면에서 마크만 가운데로 들어가 머리 띠의 지금 자리와 왼쪽 끝이 어긋났다. */}
        <div
          className={
            full
              ? "flex h-full w-full items-center gap-2 px-4 md:gap-3 md:px-5"
              : "mx-auto flex h-full w-full max-w-[1440px] items-center gap-2 px-5 md:gap-3 md:px-8 lg:px-10"
          }
        >
        <TopNav groups={groups} current={current} who={who} />
        {/* 오른쪽은 **한 묶음**이다 — 누구인지와 할 일(아이콘 둘) 사이에 옅은 선 하나 (ADR-0166). 「열린 모드」
            배지는 없다 — 서버의 동작이라 Center가 말한다 (ADR-0173). */}
        <div className="flex shrink-0 items-center gap-1 text-body">
          {/* 좁은 화면에서는 **누구인지를 접는다** — 펼친 메뉴의 맨 아래로 간다 (CON-00). */}
          <span className="ml-2 hidden shrink-0 whitespace-nowrap lg:inline" title={who}>
            {actor}
            <span className="text-text-muted">
              {" "}
              · {roleLabel}
              {company ? ` · ${company}` : ""}
            </span>
          </span>
          <span aria-hidden className="mx-2 hidden h-5 w-px shrink-0 bg-border-default lg:block" />
          <ThemeToggle />
          <Refresh />
          <form action={logout} className="shrink-0">
            <Button type="submit" variant="ghost" size="sm" title="로그아웃" aria-label="로그아웃" className={BAR_BUTTON}>
              <LogOut size={18} aria-hidden />
            </Button>
          </form>
        </div>
        </div>
      </header>

      <main
        className={
          full
            ? "flex min-w-0 flex-col"
            : "page-main mx-auto w-full max-w-[1440px] min-w-0 px-5 py-6 md:px-8 md:py-8 lg:px-10 lg:py-10"
        }
        style={{
          marginTop: "var(--size-topbar-height)",
          // 가득 쓰는 화면은 **남는 높이를 다 가진다** — 캔버스가 제 높이를 알아야 그릴 수 있다.
          ...(full ? { height: "calc(100vh - var(--size-topbar-height))" } : {}),
        }}
      >
        {full ? null : <Crumb groups={groups} current={current} here={here} />}
        {children}
      </main>
    </div>
  );
}

/**
 * [H]의 첫 줄 — 「<묶음> › <자리>」. 자리는 **그 목록으로 가는 링크**라 상세 화면이 돌아가는 길이다
 * (ADR-0152 §4 — 그래서 화면마다 「…로 돌아가기」를 두지 않는다).
 *
 * **묶음과 줄의 이름이 같으면 줄을 그리지 않는다**(「대시보드」) — 제목이 이미 그 말이라
 * 「대시보드 / 대시보드」가 위아래로 선다. **단 목록 아래의 화면(`here`)이면 그린다** — 「배포 › 새 배포」.
 * 지우면 목록으로 돌아갈 길이 없다(「배포」는 묶음과 줄이 같은 이름이라 「새 배포」에 줄이 없었다).
 */
function Crumb({ groups, current, here }: { groups: NavGroup[]; current: string; here?: string }) {
  const group = groups.find((one) => one.items.some((item) => item.href === current));
  const item = group?.items.find((one) => one.href === current);
  if (!group || !item?.href) return null;
  const same = group.label === item.label;
  if (same && !here) return null;
  return (
    <nav aria-label="지금 자리" className="page-crumb min-w-0 truncate text-body-sm">
      {same ? null : (
        <>
          <span className="text-text-muted">{group.label}</span>
          <span className="text-text-muted"> › </span>
        </>
      )}
      <Link href={item.href as Route} className="text-text-secondary hover:underline">
        {item.label}
      </Link>
      {here ? (
        <>
          <span className="text-text-muted"> › </span>
          <span aria-current="page" className="text-text-muted">
            {here}
          </span>
        </>
      ) : null}
    </nav>
  );
}
