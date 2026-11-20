import Link from "next/link";
import { redirect } from "next/navigation";
import { DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import { CenterError, center, session } from "@/lib/center";
import { compareVersions } from "@/lib/summary";
import { fullTime } from "@/lib/time";
import { Shell } from "@/components/Shell";
// 글·주소로 옮기는 일은 `lib/packages.ts`에 있다 — 브라우저 쪽 구성요소도 쓴다.
import { STATUS_LABEL, packageHref } from "@/lib/packages";

/**
 * CON-06 공통 패키지 (목록).
 *
 * **BPM 프로세스가 아닌 패키지만** 둔다 — `bpm_process`는 BPM 프로세스라 CON-02의 몫이다. 지금 그런 종류는
 * 공유 BPM 프로세스 하나다 (C5 `kind` — 도구 묶음은 패키지가 아니다, ADR-0050).
 */

/** 이 화면이 다루는 종류 (C1 `kind`). 순서가 목록의 묶음 순서다. */
export const COMMON_KINDS = ["process_lib"] as const;

export const KIND_LABEL: Record<string, string> = {
  process_lib: "공유 프로세스",
  bpm_process: "프로세스",
};

/** 연도까지 적는다 — 「01-01」로는 내일인지 내년인지 모른다 (CON-03과 같은 규칙). */
export function time(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at.toLocaleString("ko-KR");
}

export default async function PackagesPage() {
  const found = await session();
  if (!found) redirect("/login");

  let rows: PackageInfo[] = [];
  let failure: string | null = null;
  try {
    // 종류별로 따로 묻지 않고 한 번 읽어 **콘솔에서 가른다** — 목록 하나에 둘을 함께 보인다.
    const all = await center.packages();
    const order = new Map<string, number>(COMMON_KINDS.map((kind, at) => [kind, at]));
    rows = all
      .filter((one) => order.has(one.kind))
      .sort(
        (a, b) =>
          (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) ||
          // 이름이 맨 앞 열이라 이름순이다. 같은 이름이면 판이 높은 것부터 (CON-02와 같은 결).
          (a.name ?? a.id).localeCompare(b.name ?? b.id) ||
          compareVersions(b.version, a.version),
      );
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  // 「번호」 — 이 목록의 차례, 위에서부터 1 (CON-02·CON-15와 같다).
  const number = new Map(rows.map((row, index) => [`${row.id}@${row.version}`, index + 1]));

  const columns: Array<Column<PackageInfo>> = [
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
      // 휴대폰 카드의 제목 — 번호가 제목이면 카드마다 숫자 하나가 머리에 선다.
      cardTitle: true,
      // 이름이 맨 앞, id는 말풍선에 (U2 — 저작이 콘솔 안이라 사람이 id를 적을 일이 없다). 이름이 없으면 id가 제목이다.
      cell: (row) => (
        <Link
          className={`font-medium text-text-primary hover:text-primary ${row.name ? "" : "font-mono"}`}
          href={packageHref(row)}
          title={row.name ? row.id : undefined}
        >
          {row.name ?? row.id}
        </Link>
      ),
    },
    {
      key: "version",
      header: "판",
      width: "10ch",
      // 판은 본문 글꼴·보조 글자색 (CON-02 「판」과 같다, ADR-0164).
      cell: (row) => <span className="text-text-secondary tabular-nums">v{row.version}</span>,
    },
    {
      key: "kind",
      header: "종류",
      width: "16ch",
      cell: (row) => KIND_LABEL[row.kind] ?? row.kind,
    },
    {
      key: "status",
      header: "상태",
      width: "10ch",
      cell: (row) => <StatusBadge group="패키지" label={STATUS_LABEL[row.status] ?? row.status} />,
    },
    // 한 줄로 — 날짜와 시각이 두 줄로 갈리면 줄 높이가 들쭉날쭉하다 (CON-02 「최근 성공」과 같다).
    {
      key: "uploaded_at",
      header: "올린 시각",
      width: "17ch",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{fullTime(row.uploaded_at)}</span>,
    },
    { key: "uploaded_by", header: "올린 이", width: "14ch" },
    // 내어 준 횟수 (C5 `download_count`) — 같은 곳이 다시 받아도 센다. 쓰는 곳 수가 아니다.
    {
      key: "download_count",
      header: "내려받은 횟수",
      width: "12ch",
      align: "right",
      cell: (row) => String(row.download_count ?? 0),
    },
  ];

  return (
    <Shell mode={found.mode} actor={found.actor} current="/packages">
      <header className="mb-4">
        <h1 className="text-h2 font-bold">공통 패키지</h1>
      </header>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="올라온 공통 패키지가 없습니다."
          hint="「저작 › 프로젝트」의 「공통 패키지」 칸에서 만들어 「배포 후보로 만들기」로 지으세요."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.id}@${row.version}`}
          caption="공통 패키지 목록"
        />
      )}
    </Shell>
  );
}
