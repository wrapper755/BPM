import Link from "next/link";
import { DataTable, EmptyState, type Column } from "@bpm/ui";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import { PackageActions } from "@/components/PackageActions";
import { packageHref } from "@/lib/packages";
import { time } from "@/lib/time";
import { ART } from "@/components/empty-art";

/**
 * CON-15 「승인 대기」 탭 — 후보인 판을 **BPM 프로세스와 공통 패키지를 함께** 보인다
 * ([ADR-0181](../../../../../../docs/decisions/0181-menu-puts-approvals-on-top-and-approval-in-deploy.md) —
 * 승인은 배포의 첫 걸음이다). 승인 단추와 확인 창은 CON-02와 **같은 구성요소**다.
 *
 * 차례는 **올린 때가 오래된 것부터** — 먼저 올라온 것이 먼저 기다렸다.
 */
export type PendingRow = PackageInfo & { place_line: string };

const KIND: Record<string, string> = { bpm_process: "프로세스", process_lib: "공통 패키지" };

export function PendingTable({ rows, admin }: { rows: PendingRow[]; admin: boolean }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        art={ART.runs}
        title="승인을 기다리는 후보가 없습니다."
        hint="「프로젝트」에서 「배포 후보로 만들기」로 올리면 여기 섭니다."
      />
    );
  }
  const number = new Map(rows.map((row, index) => [`${row.id}@${row.version}`, index + 1]));
  const columns: Array<Column<PendingRow>> = [
    {
      key: "number",
      header: "번호",
      width: "6ch",
      align: "right",
      cell: (row) => <span className="text-text-muted">{number.get(`${row.id}@${row.version}`)}</span>,
    },
    {
      key: "name",
      header: "이름",
      cardTitle: true,
      // 업무 이름만, id는 말풍선에 (U2 — CON-02·CON-15 목록과 같은 결).
      cell: (row) => (
        <Link href={packageHref(row)} title={row.id} className="text-text-primary hover:underline">
          {row.name ?? <span className="font-mono text-body-sm">{row.id}</span>}
        </Link>
      ),
    },
    {
      key: "version",
      header: "판",
      width: "10ch",
      cell: (row) => <span className="text-text-secondary tabular-nums">v{row.version}</span>,
    },
    { key: "kind", header: "종류", width: "11ch", cell: (row) => KIND[row.kind] ?? row.kind },
    { key: "when", header: "올린 시각", width: "18ch", cell: (row) => time(row.uploaded_at) },
    {
      key: "who",
      header: "올린 이",
      width: "14ch",
      cell: (row) => row.uploaded_by || <span className="text-text-muted">—</span>,
    },
    ...(admin
      ? [
          {
            key: "actions",
            header: "",
            width: "8rem",
            align: "right",
            // 이 탭의 주 동작이라 「⋯」에 숨기지 않고 단추로 선다.
            cell: (row: PendingRow) => (
              <PackageActions packageId={row.id} version={row.version} status={row.status} place={row.place_line} quiet />
            ),
          } as Column<PendingRow>,
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <DataTable columns={columns} rows={rows} rowKey={(row) => `${row.id}@${row.version}`} caption="승인 대기" />
      {admin ? null : <p className="text-body-sm text-text-muted">승인은 관리자 계정으로 합니다.</p>}
    </div>
  );
}
