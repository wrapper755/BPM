import Link from "next/link";
import { redirect } from "next/navigation";
import { DataTable, ErrorBanner, MetaList, Section, StatusBadge, type Column } from "@bpm/ui";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { DependentInfo } from "@bpm/api-types/c5-dependent-info";
import type { ProvidedProcess } from "@bpm/api-types/c1-manifest";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { PackageActions } from "@/components/PackageActions";
import { namesOf, placeLine, workPlaceLabel } from "@/lib/organization";
import { DeletePackage } from "../../tools";
import { KIND_LABEL, time } from "../../page";
import { STATUS_LABEL, packageHref } from "@/lib/packages";

/**
 * CON-06 공통 패키지 (상세) — **CON-02 「프로세스 상세」도 같은 함수**(`PackageDetail`)로 그린다.
 * 다른 것은 지금 자리(메뉴)와 BPM 프로세스에 없는 섹션뿐이다. 종류가 그 자리의 것이 아니면 맞는 주소로 넘긴다.
 *
 * 「제공 정의」는 **매니페스트의 `provides`**(C1)를 그린다 — Center가 짓지 않는다.
 * `provides`가 아예 없으면 **빈 표로 두지 않고** 「매니페스트에 없습니다」라고 말한다:
 * 「제공하는 것이 없다」와 「적히지 않았다」는 다르다.
 */

/** `relation` → 사람 말 (C5). 모르는 값은 그대로 보인다 (원칙 10). */
const RELATION_LABEL: Record<string, string> = {
  lib: "공유 프로세스",
};


/** 「실행 요구」 한 줄 — 비어 있는 칸은 빼고 적는다. */
function requirements(info: PackageInfo): Array<[string, string]> {
  const requires = info.manifest?.requires;
  if (!requires) return [];
  const rows: Array<[string, string]> = [
    ["코어", requires.core ?? ""],
    ["AI 환경", (requires.domains ?? []).join(", ")],
    ["도구", (requires.tools ?? []).join(", ")],
    ["설정", (requires.settings ?? []).join(", ")],
    ["서비스 앱", (requires.service_apps ?? []).map((one) => one.app_id).join(", ")],
    ["확장", (requires.extensions ?? []).map((one) => `${one.id} ${one.version}`).join(", ")],
    ["태스크 종류", (requires.task_types ?? []).map((one) => one.id).join(", ")],
    ["공유 프로세스", (requires.libs ?? []).join(", ")],
    ["런타임", (requires.runtimes ?? []).join(", ")],
    ["OS", (requires.os ?? []).join(", ")],
  ];
  return rows.filter(([, value]) => value !== "");
}

/** 내용 해시는 앞 12자만 — 「sha256:」 뒤를 줄인다. 전체는 말풍선이다. */
function shortHash(hash: string): string {
  const body = hash.replace(/^sha256:/, "");
  return body.length > 12 ? `${body.slice(0, 12)}…` : body;
}

/** 사람 개입을 한 줄로. 아무것도 없으면 「없음」이다. */
function human(found: ProvidedProcess["human"]): string {
  if (!found) return "—";
  const said = [
    found.approval_center ? "Center 결재" : "",
    found.approval_field ? "현장 결재" : "",
    found.confirmation ? "확인" : "",
  ].filter(Boolean);
  return said.length > 0 ? said.join(", ") : "없음";
}

export default async function PackagePage({
  params,
}: {
  params: Promise<{ packageId: string; version: string }>;
}) {
  return <PackageDetail params={await params} area="package" />;
}

/**
 * 패키지 상세 — `area`가 지금 자리다: `process`는 「운영 › 프로세스 현황」(CON-02), `package`는
 * 「라이브러리 › 공통 패키지」(CON-06). BPM 프로세스는 앞의 것, 나머지는 뒤의 것에만 보인다.
 */
export async function PackageDetail({
  params,
  area,
}: {
  params: { packageId: string; version: string };
  area: "process" | "package";
}) {
  const found = await session();
  if (!found) redirect("/login");
  const packageId = decodeURIComponent(params.packageId);
  const version = decodeURIComponent(params.version);

  let info: PackageInfo | null = null;
  let users: DependentInfo[] = [];
  let failure: string | null = null;
  let companyNames: Record<string, string> = {};
  let departmentNames: Record<string, string> = {};
  let staffNames: Record<string, string> = {};
  try {
    info = await center.packageInfo(packageId, version);
    users = await center.dependents(packageId, version);
    // 업무 자리·회사의 **이름**을 찾는다 (C16). 못 읽어도 화면은 id로 보인다 — 자리는 매니페스트 것이다.
    [companyNames, departmentNames, staffNames] = await Promise.all([
      center.companies().then(namesOf, () => ({})),
      center.departments().then(namesOf, () => ({})),
      center.staffList().then(namesOf, () => ({})),
    ]);
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  // 종류가 이 자리의 것이 아니면 맞는 상세로 넘긴다 (옛 링크·다른 화면의 링크).
  if (info && (info.kind === "bpm_process") !== (area === "process")) redirect(packageHref(info));

  const provides = info?.manifest?.provides ?? null;
  const company = info?.company ? (companyNames[info.company] ?? info.company) : null;
  const place =
    info?.kind === "bpm_process"
      ? workPlaceLabel(info?.place, { departments: departmentNames, staff: staffNames })
      : null;

  const processColumns: Array<Column<ProvidedProcess>> = [
    { key: "process_id", header: "정의 id", mono: true },
    { key: "name", header: "이름", cell: (row) => row.name ?? "—" },
    { key: "file", header: "파일", mono: true },
    { key: "reads", header: "읽는 변수", cell: (row) => (row.reads ?? []).join(", ") || "—" },
    { key: "writes", header: "쓰는 변수", cell: (row) => (row.writes ?? []).join(", ") || "—" },
    { key: "ai_tasks", header: "AI 태스크", width: "10ch", cell: (row) => String(row.ai_tasks ?? 0) },
    { key: "human", header: "결재", cell: (row) => human(row.human) },
    { key: "description", header: "설명", cell: (row) => row.description ?? "—" },
  ];

  const dependentColumns: Array<Column<DependentInfo>> = [
    {
      key: "id",
      header: "id",
      mono: true,
      cell: (row) => (
        <Link className="font-medium text-text-primary hover:text-primary" href={packageHref(row)}>
          {row.id}
        </Link>
      ),
    },
    { key: "version", header: "버전", width: "12ch" },
    { key: "kind", header: "종류", width: "16ch", cell: (row) => KIND_LABEL[row.kind] ?? row.kind },
    { key: "name", header: "이름", cell: (row) => row.name ?? "—" },
    {
      key: "status",
      header: "상태",
      width: "10ch",
      cell: (row) => <StatusBadge group="패키지" label={STATUS_LABEL[row.status] ?? row.status} />,
    },
    {
      key: "relation",
      header: "관계",
      width: "16ch",
      cell: (row) => RELATION_LABEL[row.relation] ?? row.relation,
    },
    {
      key: "pinned_hash",
      header: "고정 해시",
      mono: true,
      cell: (row) => row.pinned_hash ?? "—",
    },
  ];

  const admin = found.mode === "admin";
  const requires = info ? requirements(info) : [];
  const missing = info?.missing_resources ?? [];

  return (
    <Shell mode={found.mode} actor={found.actor} current={area === "process" ? "/bots" : "/packages"}>
      {/* 결재함 상세(CON-04)와 같은 모양 — 단추는 제목 오른쪽, 칠한 위험 단추는 확인 창 안에만 (ADR-0164). */}
      <header>
        <h1 className="text-h2 font-bold">
          {info?.name ?? packageId} <span className="font-normal text-text-secondary">v{version}</span>
        </h1>
        {admin && info ? (
          <div className="flex flex-wrap items-start justify-end gap-2">
            <PackageActions
              packageId={info.id}
              version={info.version}
              status={info.status}
              place={placeLine(company, place ?? "—")}
            />
            <DeletePackage packageId={info.id} version={info.version} back={area === "process" ? "/bots" : "/packages"} />
          </div>
        ) : null}
      </header>

      {failure ? <ErrorBanner message={failure} /> : null}

      {info ? (
        // 넓은 화면은 본문(왼쪽) + 요약(오른쪽), 좁은 화면은 요약이 먼저다 (CON-04 상세와 같은 결).
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <aside className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--size-topbar-height)+1.5rem)] lg:order-2">
            <Section title="요약">
              <MetaList
                items={[
                  ["상태", <StatusBadge key="s" group="패키지" label={STATUS_LABEL[info.status] ?? info.status} />],
                  ["종류", KIND_LABEL[info.kind] ?? info.kind],
                  ["id", <span key="i" className="font-mono">{info.id}</span>],
                  ["회사", company ?? "—"],
                  ...(place ? ([["업무 자리", place]] as Array<[string, string]>) : []),
                  ["올린 이", info.uploaded_by],
                  ["올린 시각", time(info.uploaded_at)],
                  [
                    "승인",
                    // 사람이 서명하던 때의 승인에는 계정이 없다 — 서명 키만 남아 있다 (ADR-0090).
                    info.signed_by
                      ? `${info.approved_by ?? `서명 키 ${info.signed_by}`} · ${time(info.signed_at)}`
                      : "아직",
                  ],
                  [
                    "내려받기",
                    info.download_count
                      ? `${info.download_count}회 · 마지막 ${time(info.last_downloaded_at)}`
                      : "아직 없음",
                  ],
                  [
                    "내용 해시",
                    // 줄인 값의 전체는 말풍선에 (U20 — 줄인 id의 전체는 말풍선에 둘 수 있다).
                    <span key="h" className="font-mono" title={info.content_hash}>
                      {shortHash(info.content_hash)}
                    </span>,
                  ],
                ]}
              />
            </Section>
          </aside>

          <div className="flex min-w-0 flex-col gap-5 lg:order-1">
            {missing.length > 0 ? (
              <ErrorBanner
                message={`필요한 리소스가 Center에 없습니다 (배포 시 거부됨): ${missing
                  .map((one) => `${one.type} ${one.id} (${one.reason})`)
                  .join(", ")}`}
              />
            ) : null}

            {info.manifest?.description ? (
              <Section title="설명">
                <p className="max-w-[72ch] text-body leading-relaxed">{info.manifest.description}</p>
              </Section>
            ) : null}

            <Section title="실행 요구">
              {requires.length === 0 ? (
                <p className="text-body-sm text-text-muted">요구하는 것이 없습니다.</p>
              ) : (
                <dl className="m-0 grid grid-cols-[12ch_1fr] gap-x-6 gap-y-2 text-body">
                  {requires.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-text-muted">{label}</dt>
                      <dd className="m-0 min-w-0 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>

            {info.kind === "process_lib" ? (
              <Section title="제공 정의">
                {!provides ? (
                  <p className="text-body-sm text-text-muted">매니페스트에 `provides`가 없습니다.</p>
                ) : (provides.processes ?? []).length === 0 ? (
                  <p className="text-body-sm text-text-muted">제공하는 정의가 없습니다.</p>
                ) : (
                  <DataTable
                    columns={processColumns}
                    rows={provides.processes ?? []}
                    rowKey={(row) => row.process_id}
                    caption="제공 정의"
                  />
                )}
              </Section>
            ) : null}

            {/* BPM 프로세스를 참조하는 패키지는 없다 — `requires.libs`는 공유 BPM 프로세스만 가리킨다. */}
            {area === "package" ? (
              <Section title="이 패키지를 쓰는 패키지">
                {users.length === 0 ? (
                  <p className="text-body-sm text-text-muted">아직 없습니다.</p>
                ) : (
                  <DataTable
                    columns={dependentColumns}
                    rows={users}
                    rowKey={(row) => `${row.id}@${row.version}:${row.relation}`}
                    caption="이 패키지를 쓰는 패키지"
                  />
                )}
              </Section>
            ) : null}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
