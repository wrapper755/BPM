import { isValidElement, type ReactNode } from "react";
import { cn } from "../cn";
import { EmptyState } from "./EmptyState";

/**
 * 표 (스타일 가이드 §3).
 *
 * - 머리 고정, 줄 높이는 토큰(`row.default` 36 / `row.compact` 32).
 * - 숫자 열은 오른쪽 정렬 + `tabular-nums`, id 열은 mono로 짧게 (툴팁에 전체, U2).
 * - **업무 값 열은 기본으로 접는다** (U10) — `business: true`인 열은 `showBusiness`일 때만 보인다.
 * - 정렬·필터 상태를 주소(URL)에 남기는 일은 화면의 몫이다 (여기서는 다루지 않는다).
 * - **768px 아래에서는 카드 목록이다** (ADR-0161) — 첫 열(또는 `cardTitle` 열)이 카드의 제목이고 나머지는 「머리 : 값」 줄이다.
 *   두 모양을 함께 그리고 CSS로 하나만 보인다 — 서버에서 그리는 화면이 많아 폭을 JS로 재지 않는다.
 *   머리가 빈 열(단추 열 등)은 이름 없이 카드 맨 아래에 선다. **값이 없는 줄(「—」·빈 칸)은 카드에 그리지
 *   않는다** (H8, ADR-0162) — 표는 열이 맞아야 해서 그대로 두지만 카드에서는 「—」 줄이 대여섯이었다.
 */
export interface Column<T> {
  key: string;
  header: string;
  /** 칸 내용. 없으면 `row[key]`를 문자열로 보인다. */
  cell?: (row: T) => ReactNode;
  align?: "left" | "right";
  /** id·키처럼 mono로 보일 열. */
  mono?: boolean;
  /** 업무 값 열 (기본 접음, U10). */
  business?: boolean;
  width?: string;
  /** 좁은 화면의 카드에서 **제목**이 될 열. 없으면 첫 열이다 (상태 배지가 첫 열인 표가 쓴다). */
  cardTitle?: boolean;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  /** 줄의 고유 열쇠. 기록처럼 id가 없는 줄은 `index`를 쓴다 (SVC-03 사용 기록). */
  rowKey: (row: T, index: number) => string;
  density?: "default" | "compact";
  showBusiness?: boolean;
  /** 줄이 없을 때 — 다음에 할 일을 말한다 (U12). */
  empty?: { title: string; hint?: string; action?: ReactNode };
  caption?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  density = "default",
  showBusiness = false,
  empty,
  caption,
  className,
}: DataTableProps<T>) {
  const shown = columns.filter((c) => showBusiness || !c.business);
  const rowHeight = density === "compact" ? "var(--size-row-compact)" : "var(--size-row-default)";

  if (rows.length === 0 && empty) {
    return <EmptyState title={empty.title} hint={empty.hint} action={empty.action} />;
  }

  const title = shown.find((c) => c.cardTitle) ?? shown[0];
  const rest = shown.filter((c) => c !== title);
  const value = (c: Column<T>, row: T) =>
    c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key] ?? "");

  return (
    <>
    <ul className={cn("flex list-none flex-col gap-3 p-0 md:hidden", className)} aria-label={caption}>
      {rows.map((row, index) => (
        <li
          key={rowKey(row, index)}
          className="border border-border-default bg-bg-surface p-4 shadow-sm"
          style={{ borderRadius: "var(--radius-lg)" }}
        >
          {title ? (
            <div className={cn("mb-2 min-w-0 font-semibold", title.mono && "font-mono text-body-sm")}>
              {value(title, row)}
            </div>
          ) : null}
          <dl className="m-0 flex flex-col gap-1.5">
            {rest.map((c) =>
              isBlank(value(c, row)) ? null : c.header ? (
                <div key={c.key} className="flex min-w-0 items-baseline justify-between gap-3 text-body-sm">
                  <dt className="shrink-0 text-text-muted">{c.header}</dt>
                  <dd
                    className={cn(
                      "m-0 min-w-0 text-right",
                      c.align === "right" && "tabular-nums",
                      c.mono && "font-mono",
                    )}
                  >
                    {value(c, row)}
                  </dd>
                </div>
              ) : (
                <div key={c.key} className="mt-1 flex flex-wrap justify-end gap-2">
                  {value(c, row)}
                </div>
              ),
            )}
          </dl>
        </li>
      ))}
    </ul>
    <div
      data-table-frame
      className={cn("hidden overflow-auto border border-border-default bg-bg-surface shadow-sm md:block", className)}
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <table className="w-full border-collapse text-body">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 z-10 bg-bg-surface">
          <tr>
            {shown.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{ width: c.width, height: rowHeight }}
                className={cn(
                  "border-b border-border-default px-4 text-caption font-semibold text-text-muted",
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="transition-colors last:[&>td]:border-b-0 hover:bg-bg-canvas">
              {shown.map((c) => (
                <td
                  key={c.key}
                  style={{ height: rowHeight }}
                  className={cn(
                    "border-b border-border-default px-4",
                    c.align === "right" && "text-right tabular-nums",
                    c.mono && "font-mono text-body-sm",
                  )}
                >
                  {value(c, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

/**
 * 카드에서 뺄 「값 없음」 — 빈 것, 「—」 글자, 「—」만 든 조각이나 꾸민 글자(`<>—</>`, `<span …>—</span>`).
 * 단추·링크처럼 **제 할 일이 있는 요소**는 비어 보여도 남긴다 — 글자만 감싼 `span`만 들여다본다.
 */
function isBlank(node: ReactNode): boolean {
  if (node === null || node === undefined || node === false) return true;
  if (typeof node === "string") return node.trim() === "" || node.trim() === "—";
  if (isValidElement<{ children?: ReactNode }>(node) && (typeof node.type === "symbol" || node.type === "span")) {
    return isBlank(node.props.children);
  }
  return false;
}
