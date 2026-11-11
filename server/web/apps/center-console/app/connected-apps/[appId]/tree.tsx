import type { ReactNode } from "react";
import type { Column } from "@bpm/ui";
import { cn } from "@bpm/ui";
import type { GroupSection, OperationRow } from "@/lib/connected-apps";

/**
 * CON-18 작업 트리 격자 — 머리 줄 하나에 묶음(부모)과 작업(자식)이 **같은 열**로 선다.
 *
 * 표(`<table>`)는 줄을 `<details>`로 접을 수 없어 줄마다 같은 열 틀의 격자를 쓴다 — 열 폭은 `columns`의
 * `width`이고 첫 열만 남는 폭을 다 가져간다. JS 없이 접고 편다. 묶음 줄의 일감 열은 자식의 합이다.
 */

/** 묶음 줄이 합을 보이는 열 — 나머지 열은 비운다. */
export type GroupCells = Partial<Record<string, ReactNode>>;

function template(columns: Array<Column<OperationRow>>): string {
  return columns.map((one, at) => (at === 0 ? "minmax(28ch, 1fr)" : (one.width ?? "10ch"))).join(" ");
}

/** 첫 열 폭 + 나머지 열 폭 — 이보다 좁으면 격자가 가로로 넘친다(표 안에서만 스크롤). */
function minWidth(columns: Array<Column<OperationRow>>): string {
  return `calc(28ch + ${columns.slice(1).map((one) => one.width ?? "10ch").join(" + ")})`;
}

function Row({
  columns,
  cells,
  className,
}: {
  columns: Array<Column<OperationRow>>;
  cells: ReactNode[];
  className?: string;
}) {
  return (
    <div className={cn("grid items-start border-b border-border-default", className)} style={{ gridTemplateColumns: template(columns) }}>
      {cells.map((cell, at) => (
        <div
          key={columns[at]!.key}
          className={cn("px-3 py-2", columns[at]!.align === "right" && "text-right tabular-nums")}
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

/** 자식 줄의 첫 칸 — 왼쪽에 세로선과 가지. 마지막 자식은 세로선이 가지에서 끝난다. */
function Branch({ last, children }: { last: boolean; children: ReactNode }) {
  return (
    <div className="relative pl-8">
      {/* 칸의 위아래 여백(py-2)까지 그어야 줄과 줄 사이에서 선이 끊기지 않는다. */}
      <span
        aria-hidden
        className="absolute left-3 border-l border-border-strong"
        style={{
          top: "calc(-1 * var(--space-2))",
          height: last ? "calc(var(--space-2) + var(--space-4))" : "calc(100% + 2 * var(--space-2))",
        }}
      />
      <span aria-hidden className="absolute left-3 w-3 border-t border-border-strong" style={{ top: "var(--space-4)" }} />
      {children}
    </div>
  );
}

export function OperationTree({
  columns,
  rows,
  sections,
  groupCells,
  openOf,
  caption,
}: {
  columns: Array<Column<OperationRow>>;
  /** 묶음이 없는 앱 — 작업만 같은 격자로. */
  rows: OperationRow[];
  sections: GroupSection[] | null;
  groupCells: (one: GroupSection) => GroupCells;
  openOf: (one: GroupSection) => boolean;
  caption: string;
}) {
  const operationCells = (row: OperationRow, first: ReactNode) =>
    columns.map((one, at) => (at === 0 ? first : one.cell ? one.cell(row) : null));

  return (
    <div
      role="table"
      aria-label={caption}
      className="overflow-x-auto border border-border-default bg-bg-surface text-body shadow-sm"
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <div style={{ minWidth: minWidth(columns) }}>
        <Row
          columns={columns}
          className="sticky top-0 z-10 bg-bg-subtle text-body-sm font-semibold text-text-secondary"
          cells={columns.map((one) => one.header)}
        />
        {sections === null
          ? rows.map((row) => (
              <Row key={row.name} columns={columns} className="hover:bg-bg-subtle" cells={operationCells(row, columns[0]!.cell!(row))} />
            ))
          : sections.map((one) => (
              <details key={one.id ?? "-"} open={openOf(one)} className="group/node">
                <summary className="cursor-pointer list-none bg-bg-subtle/40 hover:bg-bg-subtle [&::-webkit-details-marker]:hidden">
                  <Row
                    columns={columns}
                    cells={columns.map((col, at) =>
                      at === 0 ? (
                        <span className="flex items-baseline gap-2">
                          <span aria-hidden className="inline-block w-3 text-text-secondary group-open/node:rotate-90">
                            ▸
                          </span>
                          <span className="font-semibold" title={one.description ?? undefined}>
                            {one.name}
                          </span>
                          <span className="text-body-sm text-text-muted">({one.rows.length})</span>
                        </span>
                      ) : (
                        (groupCells(one)[col.key] ?? null)
                      ),
                    )}
                  />
                </summary>
                {one.rows.map((row, at) => (
                  <Row
                    key={row.name}
                    columns={columns}
                    className="hover:bg-bg-subtle"
                    cells={operationCells(row, <Branch last={at === one.rows.length - 1}>{columns[0]!.cell!(row)}</Branch>)}
                  />
                ))}
              </details>
            ))}
      </div>
    </div>
  );
}
