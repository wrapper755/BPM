"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DataTable, InfoTip, StatusBadge, type Column } from "@bpm/ui";
import { FilterReset } from "@/components/FilterReset";
import { PackageActions } from "@/components/PackageActions";
import { STATUS_LABEL, packageHref } from "@/lib/packages";
import { time } from "@/lib/time";
import {
  SAMPLE,
  SCAN,
  DEFAULT_STATUS,
  STATUS_FILTERS,
  filterGroups,
  flattenGroups,
  percent,
  quietBlockLabel,
  quietlyBlocked,
  sortGroups,
  statusFilterOf,
  type BotRow,
  type GroupSort,
} from "@/lib/summary";

/**
 * CON-02 [F]+[B] — 거르기와 표. **거르는 일이 브라우저에서 일어난다** ([ADR-0160](../../../../../docs/decisions/0160-the-filter-runs-as-you-type.md)).
 *
 * 줄은 서버가 이미 **다 보내 두었다**(거르기와 상관없이 같은 것을 읽는다). 그래서 글자를 칠 때마다
 * Center에 다시 묻지 않고 그 자리에서 추린다 — 「좁히기」 단추가 필요 없는 까닭이다.
 *
 * 주소는 `history.replaceState`로 맞춘다 — Next 라우터가 그것을 `useSearchParams`와 묶어 주고
 * **페이지를 다시 그리지 않는다**. 주소에 남으니 그대로 복사해 건네도 같은 화면이 열린다.
 */
export function ProcessTable({
  rows,
  admin,
  query,
}: {
  rows: BotRow[];
  admin: boolean;
  query: { q?: string; status?: string; sort?: string };
}) {
  const [text, setText] = useState(query.q ?? "");
  const [status, setStatus] = useState(statusFilterOf(query.status));
  const [sort, setSort] = useState<GroupSort>(query.sort === "name" ? "name" : "trouble");
  // 친 글자는 **조금 뒤에** 주소에 남긴다 — 글쇠마다 기록하면 뒤로 가기가 한 글자씩 되돌아간다.
  const [typed, setTyped] = useState(text);

  useEffect(() => {
    const timer = setTimeout(() => setTyped(text), 200);
    return () => clearTimeout(timer);
  }, [text]);

  // 첫 그림에서는 주소를 건드리지 않는다 (서버가 준 그대로다).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (typed.trim()) params.set("q", typed.trim());
    if (status !== DEFAULT_STATUS) params.set("status", status);
    if (sort !== "trouble") params.set("sort", sort);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [typed, status, sort]);

  const shown = flattenGroups(sortGroups(filterGroups(rows, { q: text, status }), sort));
  // 「번호」는 **지금 보이는 차례**다 — 거르기·정렬이 바뀌면 다시 1부터 (ADR-0171).
  const number = new Map(shown.map((row, index) => [`${row.id}@${row.version}`, index + 1]));

  return (
    <>
      {/* [F] 거르기 — 치거나 고르면 **바로** 듣는다. `method="get"`은 JS가 없을 때의 길이다. */}
      <form
        className="filter-bar"
        method="get"
        onSubmit={(event) => event.preventDefault()}
      >
        {/* 「초기화」는 이름 칸 바로 옆의 아이콘 단추다 (ADR-0171). */}
        <div className="filter-field">
          <label htmlFor="bots-q">이름</label>
          <span className="flex items-center gap-1">
            <input
              id="bots-q"
              name="q"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="(전체)"
              className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
            />
            <FilterReset
              href="/bots"
              onClick={() => {
                setText("");
                setStatus(DEFAULT_STATUS);
                setSort("trouble");
              }}
            />
          </span>
        </div>
        <label className="filter-field">
          상태
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(statusFilterOf(event.target.value))}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {STATUS_FILTERS.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          정렬
          <select
            name="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value === "name" ? "name" : "trouble")}
            className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
          >
            {/* 값은 열 이름이다 — 칸 이름이 이미 「정렬」이다 (ADR-0171). */}
            <option value="trouble">경고</option>
            <option value="name">이름</option>
          </select>
        </label>
      </form>

      <DataTable
        columns={columnsFor(admin, number)}
        rows={shown}
        rowKey={(row) => `${row.id}@${row.version}`}
        caption="프로세스"
        empty={{ title: "조건에 맞는 프로세스가 없습니다.", hint: "거르기를 초기화하세요." }}
      />
    </>
  );
}

/**
 * 「실행당 확인」은 C3 요약의 **`confirmations`**(확인만 센 수)로 잰다. 그 칸은 **선택 칸**이라
 * 옛 PC 실행기가 보낸 기록에는 없다 — 그런 실행은 **분모에도 넣지 않는다**(`confirm_sample`).
 * 0으로 세면 「확인이 없었다」와 「세지 않았다」가 같아져 평균이 조용히 낮아진다.
 *
 * 셈의 뜻은 **열 머리의 「?」**에 있다 — 표 아래 각주는 걷었다 (U20, ADR-0162).
 */
const CONFIRM_NOTE =
  "확인 요청만 셉니다 (결재는 제외) — 그 셈을 보내지 않은 옛 기록은 표본에서 빠집니다.";

const SAMPLE_NOTE = `끝난 실행만 셉니다 — 도는 중인 실행은 들어가지 않습니다. 프로세스마다 최근 ${SCAN}건을 훑어 버전별로 ${SAMPLE}회까지 셉니다 (그보다 적으면 표본 수가 작게 보입니다).`;

/** 비어 있는 셈 — 「—」 (0으로 보이면 「없었다」로 읽힌다). */
const NONE = <span className="text-text-muted">—</span>;

/** 실행당 확인 — 평균 횟수다(비율이 아니다). **분모는 그 칸을 보낸 실행 수**이고 0이면 「—」다. */
function confirmRate(row: BotRow) {
  return row.confirm_sample === 0 ? NONE : `${(row.confirmations / row.confirm_sample).toFixed(1)}회`;
}

/**
 * 비율 막대 — 글자 + 가로 막대 (스타일 가이드 §7: **색만으로 뜻을 전하지 않는다**).
 *
 * 색은 `status_map`이 쓰는 상태 토큰에서 온다 (값을 코드에 적지 않는다). 막대는 **가늘다**(4px) — 글자가
 * 주인이고 막대는 눈짐작용이다 (ADR-0164 — 두꺼운 녹색 막대가 줄마다 서면 표가 시끄러웠다).
 */
function Rate({ part, whole, token }: { part: number; whole: number; token: string }) {
  const shown = percent(part, whole);
  if (shown === null) return NONE;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="tabular-nums">{shown}</span>
      <span
        aria-hidden
        className="h-1 w-12 shrink-0 overflow-hidden"
        style={{ backgroundColor: "var(--color-bg-subtle)", borderRadius: "var(--radius-full)" }}
      >
        <span
          className="block h-full"
          style={{
            width: shown,
            backgroundColor: `var(--status-${token}-solid)`,
            borderRadius: "var(--radius-full)",
          }}
        />
      </span>
    </span>
  );
}

/**
 * 「경고」 칸 — **그 줄의 판** 것이다 (ADR-0159: 줄이 판이니 묶을 까닭이 없다).
 *
 * 배포가 덮여 막힌 판은 **경고가 아니다** — 중립색 표지로만 선다 (ADR-0158). 말은 CON-12
 * 「준비」와 같은 것을 쓴다.
 *
 * **철회된 판은 비운다** — 되살아나지 않으니 고칠 것이 없고(ADR-0158: 띠도 세지 않는다),
 * 「철회」 옆에 「배포 철회」가 서면 **다른 두 가지가 같은 말로 보인다**.
 */
function Warnings({ row }: { row: BotRow }) {
  const quiet = row.blocked > 0 && quietlyBlocked(row.blocked_codes);
  if (row.status === "revoked" || (row.blocked === 0 && row.missing.length === 0)) return NONE;
  // 까닭(코드·없는 리소스)은 말풍선이 아니라 눌러 펴는 「?」에 (U20, ADR-0162).
  const codes = row.blocked_codes.join(", ");
  return (
    <span className="flex flex-wrap items-center gap-1">
      {row.blocked > 0 && !quiet ? (
        <span className="inline-flex items-center gap-1">
          <span className="whitespace-nowrap rounded-md bg-status-failed-bg px-2 py-0.5 text-body-sm text-status-failed-fg">
            실행 불가 {row.blocked}대
          </span>
          {codes ? <InfoTip label="실행 불가 까닭 설명">{codes}</InfoTip> : null}
        </span>
      ) : null}
      {row.missing.length > 0 ? (
        <span className="inline-flex items-center gap-1">
          <span className="whitespace-nowrap rounded-md bg-status-warning-bg px-2 py-0.5 text-body-sm text-status-warning-fg">
            리소스 {row.missing.length}개 없음
          </span>
          <InfoTip label="없는 리소스 설명">{row.missing.join(", ")}</InfoTip>
        </span>
      ) : null}
      {quiet ? (
        <span className="inline-flex items-center gap-1">
          <span className="whitespace-nowrap rounded-md bg-status-neutral-bg px-2 py-0.5 text-body-sm text-status-neutral-fg">
            {quietBlockLabel(row.blocked_codes)}
          </span>
          {codes ? <InfoTip label="막힌 까닭 설명">{codes}</InfoTip> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * [B] 표의 열 — **판 하나가 한 줄**이다 (CON-02). 카드에 접혀 있던 지표가 열로 선다.
 *
 * 승인 단추는 **판마다** 그 줄에 드러나 있다 (ADR-0090 — 판마다 할 수 있는 것이 다르다).
 */
function columnsFor(admin: boolean, number: Map<string, number>): Array<Column<BotRow>> {
  const href = (row: BotRow) => packageHref({ id: row.id, version: row.version, kind: "bpm_process" });
  return [
    {
      key: "number",
      header: "번호",
      width: "6ch",
      align: "right",
      cell: (row) => <span className="text-text-muted">{number.get(`${row.id}@${row.version}`)}</span>,
    },
    {
      key: "process",
      header: "프로세스",
      // 휴대폰 카드의 제목 — 첫 열(번호)이 제목이면 카드마다 숫자 하나가 머리에 선다 (CON-15와 같은 결).
      cardTitle: true,
      // 업무 이름만 보이고 id는 말풍선에 (U2 — 화면 문서 CON-02). 이름이 없으면 id가 제목이다.
      cell: (row) => (
        <Link
          className={`block truncate font-medium text-text-primary hover:text-primary ${row.name ? "" : "font-mono"}`}
          href={href(row)}
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
      // 판은 `v0.3.0` — 본문 글꼴·보조 글자색 (ADR-0164, mono는 기계 값에만).
      cell: (row) => (
        <Link className="text-text-secondary tabular-nums hover:text-primary" href={href(row)}>
          v{row.version}
        </Link>
      ),
    },
    {
      key: "status",
      header: "상태",
      width: "10ch",
      cell: (row) => <StatusBadge group="패키지" label={STATUS_LABEL[row.status] ?? row.status} />,
    },
    {
      key: "success",
      header: "성공률",
      width: "15ch",
      cell: (row) => Rate({ part: row.successes, whole: row.sample, token: "done" }),
    },
    {
      key: "replay",
      header: "재생률",
      width: "15ch",
      cell: (row) => Rate({ part: row.replayed, whole: row.ai_tasks, token: "replayed" }),
    },
    {
      key: "confirm",
      header: "실행당 확인",
      note: CONFIRM_NOTE,
      width: "10ch",
      align: "right",
      cell: (row) => <span className="tabular-nums">{confirmRate(row)}</span>,
    },
    {
      key: "sample",
      header: "표본",
      note: SAMPLE_NOTE,
      width: "9ch",
      align: "right",
      cell: (row) => (row.sample === 0 ? NONE : <span className="tabular-nums">{row.sample}회</span>),
    },
    {
      key: "last",
      header: "최근 성공",
      width: "17ch",
      // 시각은 한 줄 — 날짜와 시각이 두 줄로 갈리면 줄 높이가 둘쭉날쭉했다 (ADR-0164).
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{time(row.last_success)}</span>,
    },
    {
      key: "runners",
      header: "실행기",
      width: "8ch",
      align: "right",
      // **건수가 아니라 실행기 수**다 — 배포 건수는 CON-15에서 본다 (서버 실행기는 판마다 늘 「배포 1건」이었다).
      cell: (row) => (row.runners === 0 ? NONE : <span className="tabular-nums">{row.runners}대</span>),
    },
    // 칸은 **함수로 부른다**(요소로 감싸지 않는다) — 값이 없을 때의 「—」가 그대로 나와야 휴대폰 카드가 그 줄을
    // 뺄 수 있다 (ADR-0164 — `DataTable`은 요소 속을 그려 보지 않는다). 둘 다 훅이 없는 그리기 함수다.
    { key: "warning", header: "경고", cell: (row) => Warnings({ row }) },
    ...(admin
      ? [
          {
            key: "actions",
            header: "",
            width: "3rem",
            align: "right",
            // 「삭제...」는 상태와 상관없이 있다 — 철회된 판도 「⋯」가 선다 (표 아래 삭제 폼을 걷었다).
            cell: (row: BotRow) => (
              <PackageActions
                compact
                deletable
                packageId={row.id}
                version={row.version}
                status={row.status}
                place={row.place_line}
              />
            ),
          } as Column<BotRow>,
        ]
      : []),
  ];
}
