"use client";

import { useEffect, useState } from "react";
import { Button, ErrorBanner } from "@bpm/ui";
import type { Case, CaseFile } from "@bpm/api-types/c14-case-file";
import { loadWorkspaceFile, saveWorkspaceFile } from "@/app/actions";
import type { ApprovalAsk } from "@bpm/bpmn-canvas";
import {
  VALUE_KINDS,
  definitionPath,
  duplicateNames,
  freshName,
  fromText,
  kindOf,
  kindOfField,
  parseCases,
  strayApprovals,
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
 * **결재 답은 그림을 읽어 폼으로 짓는다** — 케이스를 고칠 때 캔버스가 떠 있지 않으므로 짝이 되는
 * 정의(`process/<이름>.bpmn`)를 글자로 읽는다 (`readApprovals` — DOM이 없어도 돈다). 읽지 못하면
 * 그 자리에 JSON 칸을 둔다: 폼을 짓지 못한다고 답을 못 적게 하면 안 된다.
 *
 * 맡기기 결과·메시지는 **JSON으로 적는다** — 맡길 패키지의 그림이 여기 없고(ADR-0082), 메시지는
 * 보내는 쪽의 모양이라 그림이 말해 주지 않는다.
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
  const [asks, setAsks] = useState<ApprovalAsk[] | null>(null);

  /**
   * 짝이 되는 정의를 읽어 **그림이 묻는 결재**를 꺼낸다 (STU-07이 보던 것).
   * **읽지 못해도 편집기는 뜬다** — 그러면 결재 답이 JSON 칸으로 보인다.
   */
  useEffect(() => {
    const definition = definitionPath(path);
    if (!definition) {
      setAsks([]);
      return;
    }
    let alive = true;
    void (async () => {
      const found = await loadWorkspaceFile(workspaceId, definition);
      if (!alive) return;
      if (!found.text) {
        setAsks([]);
        return;
      }
      const { readApprovals } = await import("@bpm/bpmn-canvas");
      const read = await readApprovals(found.text);
      if (alive) setAsks(read);
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId, path]);

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

            {asks && asks.length > 0 ? (
              <Approvals
                asks={asks}
                answers={(one.approvals ?? {}) as Record<string, Record<string, unknown>>}
                answeredBy={one.answered_by ?? {}}
                canWrite={canWrite}
                onChange={(approvals, answeredBy) =>
                  changeCase({
                    ...one,
                    approvals: approvals as Case["approvals"],
                    answered_by: answeredBy,
                  })
                }
              />
            ) : (
              <JsonPart
                title="결재 답"
                help="노드 id → 답한 폼 값. 비워 두면 그 결재는 **기다립니다**(기한 초과를 시험하는 길입니다)."
                value={one.approvals ?? {}}
                canWrite={canWrite}
                onChange={(made) => changeCase({ ...one, approvals: made as Case["approvals"] })}
              />
            )}
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
            {asks && asks.length > 0 ? null : (
              <JsonPart
                title="답한 사람"
                help="노드 id → 이름. 그림이 `answered_by_as`를 적었을 때만 변수로 갑니다 (ADR-0096)."
                value={one.answered_by ?? {}}
                canWrite={canWrite}
                onChange={(made) => changeCase({ ...one, answered_by: made as Case["answered_by"] })}
              />
            )}
            <p className="text-caption text-text-muted">
              맡기기 결과·메시지는 JSON으로 적습니다 — 맡길 패키지의 그림이 여기 없고, 메시지는 보내는
              쪽의 모양이라 그림이 말해 주지 않습니다.
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

/**
 * 결재 답 — **그림이 묻는 것마다 한 칸**이다 (STU-07이 하던 일).
 *
 * **비워 두는 것과 빈 답은 다르다** (C14): 적지 않은 결재는 **기다리고**(기한 초과를 시험하는
 * 길이다), 빈 답은 「폼을 비워 답했다」는 뜻이다. 그래서 「답한다」를 먼저 켠다.
 */
function Approvals({
  asks,
  answers,
  answeredBy,
  canWrite,
  onChange,
}: {
  asks: ApprovalAsk[];
  answers: Record<string, Record<string, unknown>>;
  answeredBy: Record<string, string>;
  canWrite: boolean;
  onChange: (answers: Record<string, Record<string, unknown>>, answeredBy: Record<string, string>) => void;
}) {
  const stray = strayApprovals(answers, asks.map((one) => one.nodeId));

  const setAnswer = (nodeId: string, made: Record<string, unknown> | null) => {
    const next = { ...answers };
    if (made === null) delete next[nodeId];
    else next[nodeId] = made;
    onChange(next, answeredBy);
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">결재 답</h3>
        <p className="text-caption text-text-muted">
          그림이 묻는 것마다 한 칸입니다. 「답한다」를 켜지 않으면 그 결재는 **기다립니다** — 기한
          초과를 시험하는 길입니다.
        </p>
      </div>

      {asks.map((ask) => {
        const answer = answers[ask.nodeId];
        return (
          <div key={ask.nodeId} className="rounded-md border border-border-default p-3">
            <label className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={answer !== undefined}
                onChange={(e) => setAnswer(ask.nodeId, e.target.checked ? {} : null)}
                disabled={!canWrite}
              />
              <span className="font-semibold">{ask.label}</span>
              <span className="text-caption text-text-muted">
                {ask.confirmation ? "확인" : "결재"} · <span className="font-mono">{ask.nodeId}</span>
              </span>
            </label>
            {ask.title ? <p className="mt-1 text-caption text-text-muted">{ask.title}</p> : null}

            {answer === undefined ? null : (
              <div className="mt-2 flex flex-col gap-2">
                {ask.fields.length === 0 ? (
                  <p className="text-caption text-text-muted">
                    폼 칸이 없습니다 — 「승인 / 반려」 두 단추입니다 (빈 답으로 승인합니다).
                  </p>
                ) : (
                  ask.fields.map((field) => (
                    <AnswerField
                      key={field.key}
                      field={field}
                      value={answer[field.key]}
                      canWrite={canWrite}
                      onChange={(made) => setAnswer(ask.nodeId, { ...answer, [field.key]: made })}
                    />
                  ))
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-text-muted">
                    답한 사람 — 그림이 `answered_by_as`를 적었을 때만 변수로 갑니다 (ADR-0096).
                  </span>
                  <input
                    className={INPUT}
                    value={answeredBy[ask.nodeId] ?? ""}
                    onChange={(e) => {
                      const next = { ...answeredBy };
                      if (e.target.value) next[ask.nodeId] = e.target.value;
                      else delete next[ask.nodeId];
                      onChange(answers, next);
                    }}
                    disabled={!canWrite}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}

      {stray.length > 0 ? (
        // **지우지 않고 보인다** — 조용히 버리면 적어 둔 답이 사라진다 (U8).
        <p className="text-caption text-status-warning-fg">
          그림에 없는 결재의 답이 남아 있습니다: {stray.join(", ")} — 노드를 지웠거나 id가 바뀐
          것입니다. 그대로 저장되지만 쓰이지 않습니다.
        </p>
      ) : null}
    </section>
  );
}

/** 폼 칸 하나 — **갈래는 그림이 정한다** (C6 `FormField.type`). */
function AnswerField({
  field,
  value,
  canWrite,
  onChange,
}: {
  field: ApprovalAsk["fields"][number];
  value: unknown;
  canWrite: boolean;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <span className="text-caption text-text-muted">
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );

  if (field.type === "bool") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          disabled={!canWrite}
        />
        {label}
      </label>
    );
  }

  if (field.type === "choice" && field.choices) {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select
          className={INPUT}
          value={toText(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canWrite}
        >
          <option value="">(고르지 않음)</option>
          {field.choices.map((one) => (
            <option key={String(one)} value={String(one)}>
              {String(one)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const kind = kindOfField(field.type);
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        className={INPUT}
        type={kind === "수" ? "number" : "text"}
        value={toText(value)}
        onChange={(e) => {
          const made = fromText(kind, e.target.value);
          // 갈래가 받아들이지 못하는 글은 **그대로 글로 담는다** — 고치는 중인 글을 버리지 않는다.
          onChange(made.error ? e.target.value : made.value);
        }}
        disabled={!canWrite}
      />
    </label>
  );
}
