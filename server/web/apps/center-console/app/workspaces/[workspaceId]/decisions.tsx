"use client";

import { useEffect, useState } from "react";
import { Button, ErrorBanner } from "@bpm/ui";
import type { DecisionTableInfo } from "@bpm/api-types/c17-decisions-response";
import { loadDecisions, saveDecision } from "@/app/actions";

/**
 * CON-20b 결정표 격자 (STU-04a가 하던 일) — **브라우저는 DMN을 해석하지 않는다**
 * ([ADR-0148](../../../../../../docs/decisions/0148-center-reads-and-writes-decision-tables.md)).
 * 읽고 쓰는 것은 Center이고 여기는 격자만 다룬다. 칸은 **원문 그대로** 오간다.
 *
 * 저장은 그 결정표 **하나**다 — 같은 파일의 다른 결정·모르는 요소는 Center가 남긴다.
 * 엔진이 거부할 칸은 Center가 막으므로(422 `bad_table`) **여기서 다시 검사하지 않는다**.
 */

const HITS: Array<[string, string]> = [
  ["UNIQUE", "맞는 줄이 하나여야 합니다 — 둘 이상이면 실행 오류"],
  ["FIRST", "처음 맞는 줄 하나 — 줄 순서가 뜻입니다"],
  ["ANY", "여럿 맞아도 되지만 결과가 같아야 합니다"],
  ["COLLECT", "맞는 줄을 모두 모읍니다 — 출력이 목록입니다"],
];

const TYPES = ["string", "number", "boolean", ""];

const CELL = "w-full border border-border-default bg-bg-surface px-2 py-1 text-body-sm";
const HEAD = "w-full border border-border-strong bg-bg-surface px-2 py-1 text-body-sm font-semibold";

const CELL_HELP =
  "입력 칸: - (무엇이든) · \"글\"·숫자·true/false · 쉼표는 「또는」 · < n, <= n, > n, >= n · [a..b] (a..b)";
const VALUE_HELP = '출력 칸: 값 하나 — "높음"·0.05·true. 비우면 없음(None)입니다.';

/** 새 id — 있던 것과 겹치지 않게. Center는 id를 그대로 쓴다(모르는 요소를 그 id로 찾는다). */
const freshId = (prefix: string, taken: string[]): string => {
  for (let n = 1; ; n += 1) {
    const made = `${prefix}_${n}`;
    if (!taken.includes(made)) return made;
  }
};

export function DecisionGrid({
  workspaceId,
  path,
  canWrite,
  onDirty,
}: {
  workspaceId: string;
  path: string;
  canWrite: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [tables, setTables] = useState<DecisionTableInfo[] | null>(null);
  const [revision, setRevision] = useState("");
  const [at, setAt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = await loadDecisions(workspaceId, path);
      if (!alive) return;
      if (found.error || !found.tables) {
        setFailure(found.error ?? "결정표를 읽지 못했습니다");
        return;
      }
      setTables(found.tables);
      setRevision(found.revision ?? "");
      setAt(0);
      setFailure(null);
      setWarnings([]);
      setDirty(false);
      onDirty(false);
    })();
    return () => {
      alive = false;
    };
    // `onDirty`는 그릴 때마다 새 함수라 넣지 않는다 — 넣으면 끝없이 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, path]);

  const table = tables?.[at];

  /** 격자를 고친다 — 고친 표만 갈아 끼우고 「저장 안 한 변경」을 올린다. */
  const change = (made: DecisionTableInfo) => {
    if (!tables) return;
    setTables(tables.map((one, i) => (i === at ? made : one)));
    setDirty(true);
    onDirty(true);
  };

  const save = async () => {
    if (!table) return;
    setBusy(true);
    setFailure(null);
    const made = await saveDecision(workspaceId, path, table, table.id, revision);
    setBusy(false);
    if (made.error || !made.revision) {
      setFailure(
        made.stale
          ? "다른 사람이 먼저 저장했습니다. 다시 읽으면 지금 편집이 사라집니다."
          : (made.error ?? "저장하지 못했습니다"),
      );
      return;
    }
    setRevision(made.revision);
    setWarnings(made.warnings ?? []);
    setDirty(false);
    onDirty(false);
  };

  if (failure && !tables) return <div className="p-6"><ErrorBanner message={failure} /></div>;
  if (!tables) return <p className="p-6 text-body-sm text-text-muted">결정표를 읽는 중입니다…</p>;
  if (!table) return <p className="p-6 text-body-sm text-text-muted">이 파일에는 결정표가 없습니다.</p>;

  const inputs = table.inputs ?? [];
  const outputs = table.outputs ?? [];
  const rules = table.rules ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-bg-surface p-4">
      {failure ? <ErrorBanner message={failure} /> : null}

      <div className="flex flex-wrap items-end gap-3">
        {tables.length > 1 ? (
          <label className="flex flex-col gap-1 text-caption text-text-muted">
            결정
            <select
              className={CELL}
              value={at}
              onChange={(e) => {
                if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 버리고 다른 결정을 열까요?")) return;
                setAt(Number(e.target.value));
                setDirty(false);
                onDirty(false);
              }}
            >
              {tables.map((one, i) => (
                <option key={one.id} value={i}>
                  {one.name || one.id}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-caption text-text-muted">
          이름
          <input
            className={CELL}
            value={table.name ?? ""}
            onChange={(e) => change({ ...table, name: e.target.value })}
            disabled={!canWrite}
          />
        </label>
        <label className="flex flex-col gap-1 text-caption text-text-muted" title={HITS.find(([h]) => h === table.hit)?.[1]}>
          적중 정책
          <select
            className={CELL}
            value={table.hit ?? "UNIQUE"}
            onChange={(e) => change({ ...table, hit: e.target.value })}
            disabled={!canWrite}
          >
            {HITS.map(([one, help]) => (
              <option key={one} value={one} title={help}>
                {one}
              </option>
            ))}
          </select>
        </label>
        {canWrite ? (
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>
            저장
          </Button>
        ) : null}
      </div>

      <p className="text-caption text-text-muted">{HITS.find(([h]) => h === table.hit)?.[1]}</p>

      <table className="w-full border-collapse text-body-sm">
        <thead>
          <tr>
            {inputs.map((one, i) => (
              <th key={one.id ?? i} className="border border-border-default p-1 align-top">
                <input
                  className={HEAD}
                  value={one.expression ?? ""}
                  placeholder="식 이름"
                  title="규칙 태스크가 이 이름으로 값을 넘깁니다 (label이 아닙니다)"
                  onChange={(e) =>
                    change({
                      ...table,
                      inputs: inputs.map((c, n) => (n === i ? { ...c, expression: e.target.value } : c)),
                    })
                  }
                  disabled={!canWrite}
                />
                <ColumnType
                  value={one.type ?? ""}
                  canWrite={canWrite}
                  onChange={(type) =>
                    change({ ...table, inputs: inputs.map((c, n) => (n === i ? { ...c, type } : c)) })
                  }
                  onDrop={
                    inputs.length > 1
                      ? () =>
                          change({
                            ...table,
                            inputs: inputs.filter((_, n) => n !== i),
                            rules: rules.map((row) => ({
                              ...row,
                              cells: (row.cells ?? []).filter((_, n) => n !== i),
                            })),
                          })
                      : undefined
                  }
                />
              </th>
            ))}
            {outputs.map((one, i) => (
              <th key={one.id ?? i} className="border border-border-default bg-primary-subtle p-1 align-top">
                <input
                  className={HEAD}
                  value={one.name ?? ""}
                  placeholder="출력 이름"
                  onChange={(e) =>
                    change({
                      ...table,
                      outputs: outputs.map((c, n) => (n === i ? { ...c, name: e.target.value } : c)),
                    })
                  }
                  disabled={!canWrite}
                />
                <ColumnType
                  value={one.type ?? ""}
                  canWrite={canWrite}
                  onChange={(type) =>
                    change({ ...table, outputs: outputs.map((c, n) => (n === i ? { ...c, type } : c)) })
                  }
                  onDrop={
                    outputs.length > 1
                      ? () =>
                          change({
                            ...table,
                            outputs: outputs.filter((_, n) => n !== i),
                            rules: rules.map((row) => ({
                              ...row,
                              values: (row.values ?? []).filter((_, n) => n !== i),
                            })),
                          })
                      : undefined
                  }
                />
              </th>
            ))}
            <th className="w-40 border border-border-default p-1 text-caption font-normal text-text-muted">설명</th>
            {canWrite ? <th className="w-10 border border-border-default p-1" /> : null}
          </tr>
        </thead>
        <tbody>
          {rules.map((row, r) => (
            <tr key={row.id ?? r}>
              {inputs.map((_, i) => (
                <td key={i} className="border border-border-default p-1">
                  <input
                    className={CELL}
                    value={(row.cells ?? [])[i] ?? ""}
                    title={CELL_HELP}
                    onChange={(e) =>
                      change({
                        ...table,
                        rules: rules.map((one, n) =>
                          n === r
                            ? { ...one, cells: (one.cells ?? []).map((c, m) => (m === i ? e.target.value : c)) }
                            : one,
                        ),
                      })
                    }
                    disabled={!canWrite}
                  />
                </td>
              ))}
              {outputs.map((_, i) => (
                <td key={i} className="border border-border-default p-1">
                  <input
                    className={CELL}
                    value={(row.values ?? [])[i] ?? ""}
                    title={VALUE_HELP}
                    onChange={(e) =>
                      change({
                        ...table,
                        rules: rules.map((one, n) =>
                          n === r
                            ? { ...one, values: (one.values ?? []).map((c, m) => (m === i ? e.target.value : c)) }
                            : one,
                        ),
                      })
                    }
                    disabled={!canWrite}
                  />
                </td>
              ))}
              <td className="border border-border-default p-1">
                <input
                  className={CELL}
                  value={row.description ?? ""}
                  onChange={(e) =>
                    change({
                      ...table,
                      rules: rules.map((one, n) => (n === r ? { ...one, description: e.target.value } : one)),
                    })
                  }
                  disabled={!canWrite}
                />
              </td>
              {canWrite ? (
                <td className="border border-border-default p-1 text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => change({ ...table, rules: rules.filter((_, n) => n !== r) })}
                  >
                    ✕
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              change({
                ...table,
                rules: [
                  ...rules,
                  {
                    id: freshId("Rule", rules.map((one) => one.id ?? "")),
                    cells: inputs.map(() => "-"),
                    values: outputs.map(() => ""),
                    description: "",
                  },
                ],
              })
            }
          >
            규칙 줄 더하기
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              change({
                ...table,
                inputs: [...inputs, { id: freshId("Input", inputs.map((one) => one.id ?? "")), expression: "", label: "", type: "string" }],
                rules: rules.map((row) => ({ ...row, cells: [...(row.cells ?? []), "-"] })),
              })
            }
          >
            입력 열 더하기
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              change({
                ...table,
                outputs: [...outputs, { id: freshId("Output", outputs.map((one) => one.id ?? "")), name: "", type: "string" }],
                rules: rules.map((row) => ({ ...row, values: [...(row.values ?? []), ""] })),
              })
            }
          >
            출력 열 더하기
          </Button>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="text-body-sm">
          <p className="text-text-muted">저장했습니다. 막지 않은 경고가 있습니다:</p>
          <ul className="list-disc pl-5 text-text-secondary">
            {warnings.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-caption text-text-muted">{CELL_HELP}</p>
    </div>
  );
}

function ColumnType({
  value,
  canWrite,
  onChange,
  onDrop,
}: {
  value: string;
  canWrite: boolean;
  onChange: (type: string) => void;
  onDrop?: () => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-1">
      <select
        className="flex-1 border border-border-default bg-bg-surface px-1 text-caption"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canWrite}
        title="없으면 값을 맞추지 않습니다 — 그러면 `25 > 20`이 글자 비교가 됩니다"
      >
        {TYPES.map((one) => (
          <option key={one || "none"} value={one}>
            {one || "(없음)"}
          </option>
        ))}
      </select>
      {canWrite && onDrop ? (
        <button type="button" onClick={onDrop} className="px-1 text-caption text-text-muted" title="이 열 빼기">
          ✕
        </button>
      ) : null}
    </div>
  );
}
