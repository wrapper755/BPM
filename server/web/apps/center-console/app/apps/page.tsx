import { redirect } from "next/navigation";
import { Button, DataTable, EmptyState, ErrorBanner, StatusBadge, type Column } from "@bpm/ui";
import type { CenterKeyInfo } from "@bpm/api-types/c7-center-key-info";
import type { EnrollmentInfo } from "@bpm/api-types/c5-enrollment-info";
import { STATE_LABEL } from "@/lib/center-keys";
import { KeyMenu } from "@/components/KeyMenu";
import { CENTER_PUBLIC_URL, CenterError, center, session } from "@/lib/center";
import { CenterAddress } from "@/components/CenterAddress";
import { Shell } from "@/components/Shell";
import { Enrollments } from "@/components/Enrollments";
import { fullTime, time } from "@/lib/time";

/**
 * CON-03 앱 — **Studio 하나**다 (PC 실행기를 걷었다, ADR-0144). 표 하나와 그 위의 「승인 대기」.
 *
 * Studio는 하트비트가 없다 — **승인 하나가 키 하나**라 Studio용 키 목록이 곧 Studio 목록이다
 * (ADR-0093). 설계가 콘솔로 들어오면 이 화면도 없어진다 (ADR-0143).
 */
export default async function AppsPage() {
  const found = await session();
  if (!found) redirect("/login");

  let studios: CenterKeyInfo[] = [];
  let studioEnrollments: EnrollmentInfo[] = [];
  let companies: Array<{ id: string; name: string }> = [];
  let failure: string | null = null;
  try {
    studios = await center.centerKeys({ type: "studio" });
    studioEnrollments = await center.enrollments("studio");
    // 승인 창의 「회사」 고를 거리 (C16) — 회사 관리자에게는 Center가 제 회사 하나만 준다.
    companies = (await center.companies()).map((one) => ({ id: one.id, name: one.name }));
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const columns: Array<Column<CenterKeyInfo>> = [
    { key: "name", header: "이름" },
    { key: "pc", header: "PC", cell: (row) => row.bound_to?.machine_name ?? "—" },
    { key: "created_at", header: "승인한 날", width: "18ch", cell: (row) => fullTime(row.created_at) },
    // 하트비트가 없어 「온라인」 대신 마지막으로 Center를 부른 때다.
    { key: "last_used_at", header: "마지막 사용", width: "16ch", cell: (row) => time(row.last_used_at) },
    { key: "expires_at", header: "키 만료", width: "18ch", cell: (row) => fullTime(row.expires_at) },
    {
      key: "state",
      header: "상태",
      width: "12ch",
      cell: (row) => <StatusBadge group="API 키" label={STATE_LABEL[row.state] ?? row.state} />,
    },
  ];
  // 키 폐기·삭제는 그 Studio 줄에서 한다 — API 키 화면은 없다 (ADR-0124).
  if (found.mode === "admin") {
    columns.push({ key: "actions", header: "", width: "6ch", cell: (row) => <KeyMenu row={row} /> });
  }

  return (
    <Shell mode={found.mode} actor={found.actor} current="/apps">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h1 font-bold">앱</h1>
        <CenterAddress url={CENTER_PUBLIC_URL} who="Studio" />
      </header>

      {failure ? (
        <ErrorBanner message={failure} action={<Button variant="secondary">다시 시도</Button>} />
      ) : (
        <section className="flex flex-col gap-3">
          <Enrollments
            rows={studioEnrollments}
            where="Studio 설정 창"
            canDecide={found.mode === "admin"}
            companies={companies}
            nameHelp="이 이름이 Studio에서 올린 것의 「누가」로 남습니다 (예: 김OO 설계 PC)."
          />
          {studios.length === 0 ? (
            <EmptyState
              title="승인된 Studio가 없습니다."
              hint="Studio 설정 창에 Center 주소를 넣으면 등록 요청이 옵니다."
            />
          ) : (
            <DataTable columns={columns} rows={studios} rowKey={(row) => row.key_id} caption="Studio 목록" />
          )}
        </section>
      )}
    </Shell>
  );
}
