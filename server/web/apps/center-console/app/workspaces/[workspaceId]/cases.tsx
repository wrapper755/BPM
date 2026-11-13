"use client";

import { useEffect, useState } from "react";
import { Button, ErrorBanner } from "@bpm/ui";
import type { Case, CaseFile } from "@bpm/api-types/c14-case-file";
import { loadWorkspaceFile, saveWorkspaceFile } from "@/app/actions";
import {
  VALUE_KINDS,
  duplicateNames,
  freshName,
  fromText,
  kindOf,
  parseCases,
  toText,
  withEntry,
  writeCases,
  type ValueKind,
} from "@/lib/cases";

/**
 * CON-20b 시험 케이스 편집기 (STU-07이 하던 일).
 *
 * 케이스는 **JSON 파일 그대로**라 콘솔이 직접 읽고 쓴다 (BPMN·DMN과 다른 점이다 — 형식 해석이
 * 없다). **값마다 갈래를 고른다** — JSON 글상자 하나로 두면 `"3"`과 `3`을 사람이 가려 적어야 한다.
 *
 * 결재 답·맡기기 결과·메시지는 **아직 JSON으로 적는다** — 그 폼은 그림의 결재 칸을 알아야 짓는데
 * 케이스를 고칠 때 그림이 열려 있지 않다 (M11 조각 4f).
 */

const INPUT = "w-full border border-border-default bg-bg-surface px-2 py-1 text-body-sm";

export function CaseEditor({
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
  const [file, setFile] = useState<CaseFile | null>(null);
  const [revision, setRevision] = useState("");
  const [at, setAt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = await loadWorkspaceFile(workspaceId, path);
      if (!alive) return;
      if (found.error || found.text === undefined) {
        setFailure(found.error ?? "케이스를 읽지 못했습니다");
        return;
      }
      const made = parseCases(found.text);
      if (made.error || !made.file) {
        setFailure(made.error ?? "케이스를 읽지 못했습니다");
        return;
      }
      setFile(made.file);
      setRevision(found.revision ?? "");
      setAt(0);
      setFailure(null);
      setDirty(false);
      onDirty(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, path]);

  const change = (made: CaseFile) => {
    setFile(made);
    setDirty(true);
    onDirty(true);
  };

  const changeCase = (made: Case) => {
    if (!file) return;
    change({ ...file, cases: (file.cases ?? []).map((one, i) => (i === at ? made : one)) });
  };

  const save = async () => {
    if (!file) return;
    const twice = duplicateNames(file.cases ?? []);
    if (twice.length) {
      // 엔진은 **이름으로** 케이스를 고른다 — 겹치면 뒤의 것이 가려진다.
      setFailure(`케이스 이름이 겹칩니다: ${twice.join(", ")} — 엔진이 이름으로 고르므로 하나가 가려집니다.`);
      return;
    }
    setBusy(true);
    setFailure(null);
    const made = await saveWorkspaceFile(workspaceId, path, revision, writeCases(file));
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
    setDirty(false);
    onDirty(false);
  };

  if (failure && !file) return <div className="p-6"><ErrorBanner message={failure} /></div>;
  if (!file) return <p className="p-6 text-body-sm text-text-muted">케이스를 읽는 중입니다…</p>;

  const cases = file.cases ?? [];
  const one = cases[at];

  return (
    <div className="flex h-full min-h-0 bg-bg-surface">
      <aside className="w-52 shrink-0 overflow-y-auto border-r border-border-default p-3">
        <h2 className="mb-2 text-caption font-semibold text-text-muted">케이스</h2>
        {cases.length === 0 ? <p className="text-caption text-text-muted">없습니다.</p> : null}
        <ul>
          {cases.map((each, i) => (
            <li key={i}>
              <button
                onClick={() => setAt(i)}
                className={
                  i === at
                    ? "w-full rounded-md bg-primary-subtle px-2 py-1 text-left text-body-sm font-semibold"
                    : "w-full rounded-md px-2 py-1 text-left text-body-sm hover:bg-bg-subtle"
                }
              >
                {each.name || "(이름 없음)"}
              </button>
            </li>
          ))}
        </ul>
        {canWrite ? (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              change({ ...file, cases: [...cases, { name: freshName(cases), inputs: {}, expected: {} }] });
              setAt(cases.length);
            }}
          >
            케이스 더하기
          </Button>
        ) : null}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {failure ? <ErrorBanner message={failure} /> : null}
        {!one ? (
          <p className="text-body-sm text-text-muted">
            케이스가 없습니다. 「케이스 더하기」로 만드세요 — 케이스를 비우면 시험 실행이 비교하지 않습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-caption text-text-muted">
                이름
                <input
                  className={INPUT}
                  value={one.name}
                  onChange={(e) => changeCase({ ...one, name: e.target.value })}
                  disabled={!canWrite}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-caption text-text-muted">
                설명
                <input
                  className={INPUT}
                  value={one.description ?? ""}
                  onChange={(e) => changeCase({ ...one, description: e.target.value })}
                  disabled={!canWrite}
                />
              </label>
              <label className="flex items-center gap-2 text-body-sm" title="사람이 답할 결재를 케이스가 대신 답하지 않습니다">
                <input
                  type="checkbox"
                  checked={one.manual === true}
                  onChange={(e) => changeCase({ ...one, manual: e.target.checked })}
                  disabled={!canWrite}
                />
                사람이 답한다
              </label>
              {canWrite ? (
                <>
                  <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>
                    저장
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`케이스 「${one.name}」을 지울까요?`)) return;
                      change({ ...file, cases: cases.filter((_, i) => i !== at) });
                      setAt(Math.max(0, at - 1));
                    }}
                  >
                    이 케이스 지우기
                  </Button>
                </>
              ) : null}
            </div>

            <ValueMap
              title="깔린 입력"
              help="BPM 프로세스가 시작할 때 받는 값입니다 (`bpm:process.inputs`)."
              map={(one.inputs ?? {}) as Record<string, unknown>}
              canWrite={canWrite}
              onChange={(made) => changeCase({ ...one, inputs: made })}
            />
            <ValueMap
              title="기대 결과"
              help="끝난 뒤 변수와 견줍니다. 비우면 판정이 「비교 안 함」입니다 (U6)."
              map={(one.expected ?? {}) as Record<string, unknown>}
              canWrite={canWrite}
              onChange={(made) => changeCase({ ...one, expected: made })}
            />

            <JsonPart
              title="결재 답"
              help="노드 id → 답한 폼 값. 비워 두면 그 결재는 **기다립니다**(기한 초과를 시험하는 길입니다)."
              value={one.approvals ?? {}}
              canWrite={canWrite}
              onChange={(made) => changeCase({ ...one, approvals: made as Case["approvals"] })}
            />
            <JsonPart
              title="맡기기 결과"
              help="맡긴 BPM 프로세스가 돌려줄 값입니다 (ADR-0082) — 적지 않으면 그 자리에서 업무 실패입니다."
              value={one.delegations ?? {}}
              canWrite={canWrite}
              onChange={(made) => changeCase({ ...one, delegations: made as Case["delegations"] })}
            />
            <JsonPart
              title="보낼 메시지"
              help="시작 뒤 `after_s`초에 보냅니다 — `[{name, after_s, correlation, payload}]`."
              value={one.messages ?? []}
              canWrite={canWrite}
              onChange={(made) => changeCase({ ...one, messages: made as Case["messages"] })}
            />
            <JsonPart
              title="답한 사람"
              help="노드 id → 이름. 그림이 `answered_by_as`를 적었을 때만 변수로 갑니다 (ADR-0096)."
              value={one.answered_by ?? {}}
              canWrite={canWrite}
              onChange={(made) => changeCase({ ...one, answered_by: made as Case["answered_by"] })}
            />
            <p className="text-caption text-text-muted">
              결재 답·맡기기 결과·메시지의 폼은 아직입니다 (M11 조각 4f) — 그림의 결재 칸을 알아야 짓습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** `{이름: 값}` 표 — **값마다 갈래를 고른다**. */
function ValueMap({
  title,
  help,
  map,
  canWrite,
  onChange,
}: {
  title: string;
  help: string;
  map: Record<string, unknown>;
  canWrite: boolean;
  onChange: (map: Record<string, unknown>) => void;
}) {
  const [problems, setProblems] = useState<Record<string, string>>({});
  const rows = Object.entries(map);
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-2 text-caption text-text-muted">{help}</p>
      <table className="w-full border-collapse text-body-sm">
        <tbody>
          {rows.map(([name, value]) => {
            const kind = kindOf(value);
            return (
              <tr key={name}>
                <td className="w-48 border border-border-default p-1">
                  <input
                    className={INPUT}
                    value={name}
                    onChange={(e) => onChange(withEntry(map, name, e.target.value, value))}
                    disabled={!canWrite}
                  />
                </td>
                <td className="w-28 border border-border-default p-1">
                  <select
                    className={INPUT}
                    value={kind}
                    onChange={(e) => {
                      const made = fromText(e.target.value as ValueKind, toText(value));
                      onChange(withEntry(map, name, name, made.error ? "" : made.value));
                    }}
                    disabled={!canWrite}
                  >
                    {VALUE_KINDS.map((each) => (
                      <option key={each} value={each}>
                        {each}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-border-default p-1">
                  {kind === "참거짓" ? (
                    <select
                      className={INPUT}
                      value={value ? "true" : "false"}
                      onChange={(e) => onChange(withEntry(map, name, name, e.target.value === "true"))}
                      disabled={!canWrite}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      className={INPUT}
                      value={toText(value)}
                      onChange={(e) => {
                        const made = fromText(kind, e.target.value);
                        setProblems({ ...problems, [name]: made.error ?? "" });
                        if (!made.error) onChange(withEntry(map, name, name, made.value));
                      }}
                      disabled={!canWrite}
                    />
                  )}
                  {problems[name] ? <span className="text-caption text-status-failed-fg">{problems[name]}</span> : null}
                </td>
                {canWrite ? (
                  <td className="w-10 border border-border-default p-1 text-center">
                    <Button size="sm" variant="ghost" onClick={() => onChange(withEntry(map, name, "", null))}>
                      ✕
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {canWrite ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => onChange(withEntry(map, "", `값${rows.length + 1}`, ""))}
        >
          줄 더하기
        </Button>
      ) : null}
    </section>
  );
}

/** 아직 폼이 없는 것 — JSON으로 적는다. **고치는 중인 글을 버리지 않는다.** */
function JsonPart({
  title,
  help,
  value,
  canWrite,
  onChange,
}: {
  title: string;
  help: string;
  value: unknown;
  canWrite: boolean;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-2 text-caption text-text-muted">{help}</p>
      <textarea
        className={`${INPUT} font-mono`}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value || "null"));
            setProblem(null);
          } catch {
            // 고치는 중인 글은 그대로 둔다 — 저장은 마지막으로 읽힌 값으로 간다.
            setProblem("JSON이 아닙니다 — 고치는 중이면 그대로 두세요.");
          }
        }}
        disabled={!canWrite}
      />
      {problem ? <p className="text-caption text-status-failed-fg">{problem}</p> : null}
    </section>
  );
}
