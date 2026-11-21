import {
  Activity,
  Building2,
  Cable,
  CalendarClock,
  CircleX,
  FolderKanban,
  History,
  Inbox,
  LayoutDashboard,
  Library,
  ListChecks,
  PackageCheck,
  PackagePlus,
  Play,
  Plug,
  Rocket,
  Save,
  Server,
  Square,
  UserCog,
  type LucideIcon,
} from "lucide-react";

/**
 * **같은 대상은 어디서나 같은 모양** — 메뉴 줄·대시보드 카드·「지금 할 일」 표지가 이 표 하나를 쓴다
 * ([ADR-0187](../../../../../docs/decisions/0187-icons-in-menus-and-drawn-empty-states.md)). 결재함 줄과
 * 「기다리는 결재」 카드와 「결재」 표지가 다른 모양이면 같은 것인지 눌러 봐야 안다.
 *
 * 아이콘은 **장식**이다 — 이름은 글이 말하고 아이콘은 `aria-hidden`, 색은 글을 따른다(`currentColor`).
 */
export const ICON = {
  dashboard: LayoutDashboard,
  approvals: Inbox,
  projects: FolderKanban,
  library: Library,
  candidates: PackageCheck,
  deployments: Rocket,
  processes: Activity,
  runs: History,
  failed: CircleX,
  jobs: CalendarClock,
  runners: Server,
  apps: Plug,
  workers: Cable,
  organization: Building2,
  accounts: UserCog,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICON;

/** 편집기 머리(CON-20b [H])의 단추 — 생애주기 차례 그대로 (ADR-0185). */
export const ACTION_ICON = {
  check: ListChecks,
  trial: Play,
  stop: Square,
  build: PackagePlus,
  save: Save,
} satisfies Record<string, LucideIcon>;
