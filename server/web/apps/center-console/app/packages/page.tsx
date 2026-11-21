import Link from "next/link";
import { redirect } from "next/navigation";
import { DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import { CenterError, center, session } from "@/lib/center";
import { compareVersions } from "@/lib/summary";
import { time } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { AutoFilter } from "@/components/AutoFilter";
import { FilterReset } from "@/components/FilterReset";
// 글·주소로 옮기는 일은 `lib/packages.ts`에 있다 — 브라우저 쪽 구성요소도 쓴다.
import { STATUS_LABEL, nameMatches, packageHref } from "@/lib/packages";
import { ART } from "@/components/empty-art";

/**
 * CON-06 공통 패키지 (목록).
 *
 * **BPM 프로세스가 아닌 패키지만** 둔다 — `bpm_process`는 BPM 프로세스라 CON-02의 몫이다. 지금 그런 종류는
 * 공유 BPM 프로세스 하나다 (C5 `kind` — 도구 묶음은 패키지가 아니다, ADR-0050).
 *
 * 「이름」 거르기는 작업공간 목록과 같은 결이다 — 주소의 `q`로 서버가 다시 그린다 (ADR-0184).
 */

/** 이 화면이 다루는 종류 (C1 `kind`). 순서가 목록의 묶음 순서다. */
export const COMMON_KINDS = ["process_lib"] as const;

export const KIND_LABEL: Record<string, string> = {
  process_lib: "공유 프로세스",
  bpm_process: "프로세스",
};


export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const found = await session();
  if (!found) redirect("/login");
  const { q } = await searchParams;

  let uploaded = 0;

  let rows: PackageInfo[] = [];
  let failure: string | null = null;
  try {
    // 종류별로 따로 묻지 않고 한 번 읽어 **콘솔에서 가른다** — 목록 하나에 둘을 함께 보인다.
    const all = await center.packages();
    const order = new Map<string, number>(COMMON_KINDS.map((kind, at) => [kind, at]));
    const common = all.filter((one) => order.has(one.kind));
    uploaded = common.length;
    rows = common
      .filter((one) => nameMatches(one, q))
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
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{time(row.uploaded_at)}</span>,
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
        <h1 className="text-h2 font-bold">라이브러리</h1>
        {/* 제목은 메뉴와 같은 말이고(ADR-0186) 「공통 패키지」는 이 서가에 놓인 것의 종류 이름이다. */}
        <p className="text-body-sm text-text-muted">지어 올린 공통 패키지 — 프로세스가 설치해서 부른다</p>
      </header>

      {failure ? (
        <ErrorBanner message={failure} />
      ) : uploaded === 0 ? (
        <EmptyState
          art={ART.projects}
          title="올라온 공통 패키지가 없습니다."
          hint="「프로젝트」의 「공통 패키지」 칸에서 만들어 「배포 후보로 만들기」로 지으세요."
        />
      ) : (
        <>
          {/* 치는 대로 든다(ADR-0165), ↺는 칸 바로 옆 (ADR-0171 — 작업공간 목록과 같은 결). */}
          <AutoFilter clear="inline">
            <div className="filter-field">
              <label htmlFor="packages-q">이름</label>
              <span className="flex items-center gap-1">
                <input
                  id="packages-q"
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="(전체)"
                  className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
                />
                <FilterReset href="/packages" />
              </span>
            </div>
          </AutoFilter>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => `${row.id}@${row.version}`}
            caption="공통 패키지 목록"
            empty={{ title: "조건에 맞는 공통 패키지가 없습니다.", hint: "거르기를 초기화하세요.", art: ART.search }}
          />
        </>
      )}
    </Shell>
  );
}
