"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { InfoTip } from "@bpm/ui";

import { mapColumns, rowProblems, rowsToMap, type MapRow } from "@/lib/element-values";

/**
 * `이름=값` 칸 — **두 열의 표**다 (CON-20b 상세 패널). 열 이름은 칸의 설명이 정한 짝이고
 * (`mapColumns`), 줄은 고치는 동안 따로 든다 — 빈 줄·겹친 이름을 버리면 새 줄을 칠 수 없다.
 * 넣을 때 가린다(`rowsToMap`). 셈은 `lib/element-values.ts`, vitest가 잰다.
 */

export function MapTable({
  label,
  code,
  help,
  flow = false,
  rows: given,
  canWrite,
  onChange,
}: {
  /** 칸 이름 (한글, 필수면 「 *」까지). */
  label: string;
  /** 원문 칸 이름 — 말풍선. */
  code: string;
  help?: string;
  /** 값이 흐르는 칸(입력·출력) — 두 열 사이에 「←」. */
  flow?: boolean;
  rows: MapRow[];
  canWrite: boolean;
  onChange: (value: Record<string, string> | undefined) => void;
}) {
  const [rows, setRows] = useState<MapRow[]>(given);
  // 바깥에서 값이 바뀌면(「버리기」·다른 요소) 줄을 다시 짓는다 — 지금 줄이 같은 값을 뜻하면 그대로 둔다.
  const givenText = JSON.stringify(rowsToMap(given) ?? {});
  useEffect(() => {
    setRows((now) =>
      JSON.stringify(rowsToMap(now) ?? {}) === givenText
        ? now
        : Object.entries(JSON.parse(givenText) as Record<string, string>),
    );
  }, [givenText]);

  const columns = mapColumns(help);
  const problems = rowProblems(rows);
  const put = (made: MapRow[]) => {
    setRows(made);
    onChange(rowsToMap(made));
  };

  // 칸은 테두리 없이 글처럼 놓이고 올리거나 누르면 테두리가 난다 — 테두리는 표 하나다.
  // ✕는 열을 차지하지 않고 줄 오른쪽 끝에 겹쳐 뜬다 — 좁은 패널에서 이름이 잘리지 않게.
  const grid = flow ? "grid-cols-[1fr_1rem_1fr]" : "grid-cols-[1fr_1fr]";
  const cell =
    "w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-body-sm hover:border-border-default focus:border-primary focus:bg-bg-surface focus:outline-none disabled:hover:border-transparent";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-1.5">
        <span className="text-caption text-text-secondary" title={code}>
          {label}
        </span>
        {columns.rest ? (
          <InfoTip label={`${label.replace(/ \*$/, "")} 설명`} className="ml-auto">
            {columns.rest}
          </InfoTip>
        ) : null}
      </div>
      <div role="table" aria-label={label} className="overflow-hidden rounded-md border border-border-default">
        <div
          role="row"
          className={`grid ${grid} items-center gap-1 border-b border-border-default bg-bg-subtle px-1.5 py-1 text-caption text-text-muted`}
        >
          <span role="columnheader" className="px-1.5">
            {columns.left}
          </span>
          {flow ? <span aria-hidden /> : null}
          <span role="columnheader" className="px-1.5">
            {columns.right}
          </span>
        </div>
        {rows.map(([name, value], at) => (
          <div role="row" key={at} className="group relative border-b border-border-default px-1.5 py-0.5 last:border-b-0">
            <div className={`grid ${grid} items-center gap-1`}>
              <input
                aria-label={`${columns.left} ${at + 1}`}
                className={cell}
                value={name}
                onChange={(e) => put(rows.map((one, i) => (i === at ? [e.target.value, one[1]] : one)))}
                disabled={!canWrite}
                aria-invalid={problems[at] ? true : undefined}
              />
              {flow ? (
                <ArrowLeft size={14} aria-hidden className="justify-self-center text-text-muted" />
              ) : null}
              <input
                aria-label={`${columns.right} ${at + 1}`}
                className={`${cell} font-mono`}
                value={value}
                onChange={(e) => put(rows.map((one, i) => (i === at ? [one[0], e.target.value] : one)))}
                disabled={!canWrite}
              />
              {canWrite ? (
                // 올린 줄·누른 줄에만 — 줄마다 늘 있으면 표에서 가장 큰 소리가 된다.
                <button
                  type="button"
                  aria-label={`${at + 1}번째 줄 지우기`}
                  title="줄 지우기"
                  onClick={() => put(rows.filter((_, i) => i !== at))}
                  className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded bg-bg-surface text-text-muted opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100 hover:text-text-primary focus:opacity-100"
                >
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </div>
            {problems[at] ? (
              <span className="block px-1.5 pb-1 text-caption text-status-warning-fg">{problems[at]}</span>
            ) : null}
          </div>
        ))}
        {canWrite ? (
          <button
            type="button"
            onClick={() => setRows([...rows, ["", ""]])}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-body-sm text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
          >
            <Plus size={14} aria-hidden />줄 더하기
          </button>
        ) : rows.length ? null : (
          <p className="px-3 py-1.5 text-caption text-text-muted">비어 있습니다.</p>
        )}
      </div>
    </div>
  );
}
