"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { InfoTip } from "@bpm/ui";

import { mapColumns, rowProblems, rowsToMap, type MapRow } from "@/lib/element-values";

/**
 * `이름=값` 칸 — **두 열의 표**다 (CON-20b 상세 패널). 열 이름은 칸의 설명이 정한 짝이고
 * (`mapColumns`), 줄은 고치는 동안 따로 든다 — 빈 줄·겹친 이름을 버리면 새 줄을 칠 수 없다.
 * 넣을 때 가린다(`rowsToMap`). 셈은 `lib/element-values.ts`, vitest가 잰다.
 */

const CELL = "w-full min-w-0 rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-body-sm";

export function MapTable({
  label,
  code,
  help,
  rows: given,
  canWrite,
  onChange,
}: {
  /** 칸 이름 (한글, 필수면 「 *」까지). */
  label: string;
  /** 원문 칸 이름 — 말풍선. */
  code: string;
  help?: string;
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
      {rows.length ? (
        <div role="table" aria-label={label} className="flex flex-col gap-1">
          <div role="row" className="grid grid-cols-[1fr_1fr_2rem] gap-1 text-caption text-text-muted">
            <span role="columnheader">{columns.left}</span>
            <span role="columnheader">{columns.right}</span>
            <span />
          </div>
          {rows.map(([name, value], at) => (
            <div role="row" key={at} className="flex flex-col gap-0.5">
              <div className="grid grid-cols-[1fr_1fr_2rem] items-center gap-1">
                <input
                  aria-label={`${columns.left} ${at + 1}`}
                  className={CELL}
                  value={name}
                  onChange={(e) => put(rows.map((one, i) => (i === at ? [e.target.value, one[1]] : one)))}
                  disabled={!canWrite}
                  aria-invalid={problems[at] ? true : undefined}
                />
                <input
                  aria-label={`${columns.right} ${at + 1}`}
                  className={`${CELL} font-mono`}
                  value={value}
                  onChange={(e) => put(rows.map((one, i) => (i === at ? [one[0], e.target.value] : one)))}
                  disabled={!canWrite}
                />
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`${at + 1}번째 줄 지우기`}
                    title="줄 지우기"
                    onClick={() => put(rows.filter((_, i) => i !== at))}
                    className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary"
                  >
                    <X size={14} aria-hidden />
                  </button>
                ) : (
                  <span />
                )}
              </div>
              {problems[at] ? <span className="text-caption text-status-warning-fg">{problems[at]}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-caption text-text-muted">비어 있습니다.</p>
      )}
      {canWrite ? (
        <button
          type="button"
          onClick={() => setRows([...rows, ["", ""]])}
          className="inline-flex h-8 items-center gap-1.5 self-start rounded-md px-2 text-body-sm text-text-primary hover:bg-bg-subtle"
        >
          <Plus size={16} aria-hidden />줄 더하기
        </button>
      ) : null}
    </div>
  );
}
