/**
 * 빈 상태 그림 (CON-00 [E], [ADR-0187](../../../../../docs/decisions/0187-icons-in-menus-and-drawn-empty-states.md)) —
 * `public/empty/`의 한 색 마스크. 만드는 것은 `spikes/s13-empty-states/cut.py`다(고른 판을 칸마다 자른다).
 *
 * **「조건에 맞는 것이 없다」는 어느 화면이든 `search`**이고, 그 밖의 빈 상태는 그 화면의 그림이다.
 */
export const ART = {
  approvals: "/empty/approvals.png",
  projects: "/empty/projects.png",
  runs: "/empty/runs.png",
  jobs: "/empty/jobs.png",
  search: "/empty/search.png",
  connect: "/empty/connect.png",
} as const;
