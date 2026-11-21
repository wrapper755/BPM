"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button, Dialog } from "@bpm/ui";

import {
  ANSWER_TYPES,
  ANSWER_TYPE_LABELS,
  answerProblems,
  answerSummary,
  choicesFromText,
  choicesToText,
  conditionSources,
  conditionValues,
  moveField,
  newAnswerField,
  renameKey,
  withType,
  writeAssignees,
  type AnswerField,
  type Assignees,
} from "@/lib/answer-fields";

/**
 * 결재 「답 칸」 — 패널에는 **요약**, 고치는 것은 **팝업**이다 (CON-20b 상세 패널, C6 `FormField`).
 * 속성이 일곱인 것을 좁은 패널에서 다 펴면 칸이 묻힌다. 팝업은 왼쪽 목록 + 오른쪽 상세이고
 * 「적용」이 **바로 그림에 넣는다**(실행 취소 한 걸음).
 * 셈(읽기·종류 바꾸기·차례·조건이 볼 칸·말할 것)은 `lib/answer-fields.ts`에 있고 vitest가 잰다.
 * 말할 것은 **막지 않는다** — 판정은 C14 B12다.
 */

const INPUT = "w-full rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-body-sm";

/** 패널 쪽 — 칸마다 한 줄 요약과 「답 칸 편집...」. */
export function AnswerFieldsEditor({
  fields,
  canWrite,
  onApply,
}: {
  fields: AnswerField[];
  canWrite: boolean;
  /** 팝업의 「적용」 — 빈 목록은 `undefined`(칸을 뺀다). 받는 쪽이 곧바로 그림에 넣는다. */
  onApply: (fields: AnswerField[] | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const problems = answerProblems(fields);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm font-medium text-text-primary" title="fields">
        답 칸
      </span>
      {fields.length ? (
        <ul className="m-0 flex list-none flex-col rounded-md border border-border-default p-0">
          {fields.map((field, at) => (
            <li key={at} className="border-b border-border-default px-2 py-1.5 last:border-b-0">
              <span className="block truncate">
                <span className="font-mono">{field.key || "(키 없음)"}</span>{" "}
                <span className="text-text-secondary">{field.label}</span>
              </span>
              <span className="block text-caption text-text-muted">{answerSummary(field)}</span>
              {problems[at]?.length ? (
                <span className="block text-caption text-status-warning-fg">{problems[at]?.[0]}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-text-muted">칸이 없으면 「승인 / 반려」 두 단추로 답합니다.</p>
      )}
      <Button size="sm" variant="secondary" className="self-start" onClick={() => setEditing(true)}>
        {canWrite ? "답 칸 편집..." : "답 칸 보기..."}
      </Button>
      {editing ? (
        <AnswerFieldsDialog
          fields={fields}
          canWrite={canWrite}
          onClose={() => setEditing(false)}
          onApply={(made) => {
            setEditing(false);
            onApply(made.length ? made : undefined);
          }}
        />
      ) : null}
    </div>
  );
}

/** 팝업 — 왼쪽 목록 + 오른쪽 상세. 고치는 것은 **사본**이고 「적용」에서만 나간다. */
function AnswerFieldsDialog({
  fields: given,
  canWrite,
  onClose,
  onApply,
}: {
  fields: AnswerField[];
  canWrite: boolean;
  onClose: () => void;
  onApply: (fields: AnswerField[]) => void;
}) {
  const [fields, setFields] = useState(given);
  const [at, setAt] = useState(0);
  const problems = answerProblems(fields);
  const picked = fields[at];
  const move = (by: -1 | 1) => {
    const made = moveField(fields, at, by);
    if (made === fields) return;
    setFields(made);
    setAt(at + by);
  };

  return (
    <Dialog
      open
      title="답 칸 편집"
      description="결재하는 사람이 채울 칸입니다. 조건은 앞에 오는 칸만 볼 수 있어 차례가 뜻이 있습니다."
      width={880}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {canWrite ? "취소" : "닫기"}
          </Button>
          {canWrite ? (
            <Button variant="primary" onClick={() => onApply(fields)}>
              적용
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex h-[min(28rem,60vh)] gap-4 text-body-sm">
        <div className="flex w-64 shrink-0 flex-col rounded-md border border-border-default">
          <ul role="listbox" aria-label="답 칸" className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
            {fields.map((field, i) => (
              <li key={i} role="option" aria-selected={i === at}>
                <button
                  type="button"
                  onClick={() => setAt(i)}
                  className={`block w-full border-b border-border-default px-3 py-2 text-left ${
                    i === at ? "bg-bg-subtle font-semibold" : "hover:bg-bg-subtle"
                  }`}
                >
                  <span className="block truncate">
                    <span className="font-mono">{field.key || "(키 없음)"}</span>{" "}
                    <span className="font-normal text-text-secondary">{field.label}</span>
                  </span>
                  <span className="block text-caption font-normal text-text-muted">
                    {answerSummary(field)}
                    {problems[i]?.length ? <span className="text-status-warning-fg"> · 확인 필요</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {canWrite ? (
            <div className="flex items-center gap-1 border-t border-border-default p-1">
              <button
                type="button"
                onClick={() => {
                  setFields([...fields, newAnswerField(fields)]);
                  setAt(fields.length);
                }}
                className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-bg-subtle"
              >
                <Plus size={16} aria-hidden />칸 더하기
              </button>
              <IconButton label="위로" disabled={!picked || at === 0} onClick={() => move(-1)}>
                <ChevronUp size={16} aria-hidden />
              </IconButton>
              <IconButton label="아래로" disabled={!picked || at === fields.length - 1} onClick={() => move(1)}>
                <ChevronDown size={16} aria-hidden />
              </IconButton>
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          {picked ? (
            <FieldRow
              key={at}
              field={picked}
              sources={conditionSources(fields, at)}
              problems={problems[at] ?? []}
              canWrite={canWrite}
              onRename={(key) => setFields(renameKey(fields, at, key))}
              onChange={(made) => setFields(fields.map((one, i) => (i === at ? made : one)))}
              onDrop={() => {
                setFields(fields.filter((_, i) => i !== at));
                setAt(Math.max(0, at - 1));
              }}
            />
          ) : (
            <p className="text-text-muted">칸이 없습니다. 「칸 더하기」로 만드세요 — 칸이 없으면 「승인 / 반려」 두 단추로 답합니다.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** 오른쪽 상세 — 칸 하나의 모든 것. */
function FieldRow({
  field,
  sources,
  problems,
  canWrite,
  onRename,
  onChange,
  onDrop,
}: {
  field: AnswerField;
  /** 조건이 볼 수 있는 앞 칸들. */
  sources: AnswerField[];
  problems: string[];
  canWrite: boolean;
  onRename: (key: string) => void;
  onChange: (field: AnswerField) => void;
  onDrop: () => void;
}) {
  const id = useId();
  const source = sources.find((one) => one.key === field.when?.field);
  return (
    <div className="flex flex-col gap-3">
      <Line id={`${id}-key`} label="키" code="key">
        <input
          id={`${id}-key`}
          className={`${INPUT} font-mono`}
          value={field.key}
          onChange={(e) => onRename(e.target.value)}
          disabled={!canWrite}
        />
      </Line>
      <Line id={`${id}-label`} label="이름" code="label">
        <input
          id={`${id}-label`}
          className={INPUT}
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          disabled={!canWrite}
        />
      </Line>
      <Line id={`${id}-type`} label="종류" code="type">
        {/* 넷뿐이라 단추로 다 보인다 — 고르기 상자는 한 번 더 눌러야 무엇이 있는지 안다. */}
        <div id={`${id}-type`} role="radiogroup" aria-label="종류" className="flex flex-wrap gap-1">
          {[...ANSWER_TYPES, ...((ANSWER_TYPES as readonly string[]).includes(field.type) ? [] : [field.type])].map((one) => (
            <label
              key={one}
              className={`inline-flex h-8 cursor-pointer items-center rounded-md border px-3 ${
                field.type === one
                  ? "border-primary bg-bg-surface font-semibold text-text-primary"
                  : "border-border-default text-text-secondary hover:bg-bg-subtle"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={`${id}-type`}
                checked={field.type === one}
                onChange={() => onChange(withType(field, one))}
                disabled={!canWrite}
              />
              {ANSWER_TYPE_LABELS[one as keyof typeof ANSWER_TYPE_LABELS] ?? one}
            </label>
          ))}
        </div>
      </Line>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(field.required)}
          onChange={(e) => {
            const made = { ...field };
            if (e.target.checked) made.required = true;
            else delete made.required;
            onChange(made);
          }}
          disabled={!canWrite}
        />
        <span title="required">필수</span>
      </label>
      {field.type === "choice" ? (
        <Line id={`${id}-choices`} label="고를 거리" code="choices" note="한 줄에 하나">
          <ChoicesText
            id={`${id}-choices`}
            choices={field.choices}
            canWrite={canWrite}
            onChange={(choices) => onChange({ ...field, choices })}
          />
        </Line>
      ) : null}
      <Line id={`${id}-default`} label="기본값" code="default">
        <DefaultInput id={`${id}-default`} field={field} canWrite={canWrite} onChange={onChange} />
      </Line>
      <Line id={`${id}-when`} label="조건" code="when" note="앞 칸의 값이 이것일 때만 보이고 필수">
        <select
          id={`${id}-when`}
          className={INPUT}
          value={field.when?.field ?? ""}
          onChange={(e) => {
            const made = { ...field };
            if (e.target.value) made.when = { field: e.target.value, in: [] };
            else delete made.when;
            onChange(made);
          }}
          disabled={!canWrite}
        >
          <option value="">늘 보인다</option>
          {sources.map((one) => (
            <option key={one.key} value={one.key}>
              {one.key}
              {one.label ? ` (${one.label})` : ""}
            </option>
          ))}
          {field.when && !source ? <option value={field.when.field}>{field.when.field} (앞에 없음)</option> : null}
        </select>
        {field.when && source ? (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {conditionValues(source).map((value) => {
              const checked = field.when?.in.some((one) => one === value) ?? false;
              return (
                <label key={String(value)} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const now = field.when?.in ?? [];
                      const values = e.target.checked ? [...now, value] : now.filter((one) => one !== value);
                      onChange({ ...field, when: { field: source.key, in: values } });
                    }}
                    disabled={!canWrite}
                  />
                  {value === true ? "참" : value === false ? "거짓" : String(value)}
                </label>
              );
            })}
          </div>
        ) : null}
      </Line>
      {problems.map((one) => (
        <span key={one} className="text-caption text-status-warning-fg">
          {one}
        </span>
      ))}
      {canWrite ? (
        <Button size="sm" variant="danger-quiet" className="self-start" onClick={onDrop}>
          칸 지우기
        </Button>
      ) : null}
    </div>
  );
}

function Line({
  id,
  label,
  code,
  note,
  children,
}: {
  id: string;
  label: string;
  code: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <label htmlFor={id} className="text-body-sm font-medium text-text-primary" title={code}>
          {label}
        </label>
        {note ? <span className="ml-auto text-caption text-text-muted">{note}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * 한 줄에 하나 — **치는 글을 따로 든다**. 값만 들면 줄을 바꾸는 순간 빈 줄이 버려져 다음 줄을 칠 수 없다.
 * 바깥에서 값이 바뀌면(「버리기」) 글을 다시 짓는다.
 */
function ChoicesText({
  id,
  choices,
  canWrite,
  onChange,
}: {
  id: string;
  choices: unknown[] | null | undefined;
  canWrite: boolean;
  onChange: (choices: unknown[]) => void;
}) {
  const [text, setText] = useState(() => choicesToText(choices));
  useEffect(() => {
    setText((now) =>
      JSON.stringify(choicesFromText(now, choices)) === JSON.stringify(choices ?? []) ? now : choicesToText(choices),
    );
  }, [choices]);
  return (
    <textarea
      id={id}
      className={INPUT}
      rows={3}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(choicesFromText(e.target.value, choices));
      }}
      disabled={!canWrite}
    />
  );
}

/** 기본값 — 종류에 맞는 칸이다. 비우면 칸을 뺀다. */
function DefaultInput({
  id,
  field,
  canWrite,
  onChange,
}: {
  id: string;
  field: AnswerField;
  canWrite: boolean;
  onChange: (field: AnswerField) => void;
}) {
  const put = (value: unknown) => {
    const made = { ...field };
    if (value === undefined) delete made.default;
    else made.default = value;
    onChange(made);
  };
  if (field.type === "bool" || field.type === "choice") {
    const options = field.type === "bool" ? [true, false] : (field.choices ?? []);
    const at = options.findIndex((one) => one === field.default);
    return (
      <select
        id={id}
        className={INPUT}
        value={at < 0 ? "" : String(at)}
        onChange={(e) => put(e.target.value === "" ? undefined : options[Number(e.target.value)])}
        disabled={!canWrite}
      >
        <option value="">없음</option>
        {options.map((one, i) => (
          <option key={i} value={String(i)}>
            {one === true ? "참" : one === false ? "거짓" : String(one)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      className={INPUT}
      type={field.type === "number" ? "number" : "text"}
      value={field.default === undefined || field.default === null ? "" : String(field.default)}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw) return put(undefined);
        if (field.type !== "number") return put(raw);
        const made = Number(raw);
        if (Number.isFinite(made)) put(made);
      }}
      disabled={!canWrite}
    />
  );
}

/** 「담당자」 — 이름 목록이거나 변수 이름 하나 (ADR-0080). */
export function AssigneesEditor({
  value,
  canWrite,
  onChange,
}: {
  value: Assignees;
  canWrite: boolean;
  onChange: (value: string[] | string | undefined) => void;
}) {
  const id = useId();
  const [text, setText] = useState(() => (value.mode === "names" ? value.names.join("\n") : ""));
  const names = value.mode === "names" ? value.names : [];
  // 빈 값은 칸을 빼므로 값만 보면 「변수에서」를 고른 것이 사라진다 — 빈 동안은 고른 길을 따로 든다.
  const empty = value.mode === "names" ? !value.names.length : !value.name;
  const [picked, setMode] = useState<Assignees["mode"]>(value.mode);
  const mode = empty ? picked : value.mode;
  // 바깥에서 값이 바뀌면(「버리기」) 글을 다시 짓는다. `names`는 렌더마다 새 배열이라 글로 견준다.
  const namesText = names.join("\n");
  useEffect(() => {
    setText((now) => {
      const typed = now.split("\n").map((one) => one.trim()).filter(Boolean);
      return typed.join("\n") === namesText ? now : namesText;
    });
  }, [namesText]);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <label htmlFor={id} className="text-body-sm font-medium text-text-primary" title="assignees">
          담당자
        </label>
      </div>
      <div className="flex gap-3" role="radiogroup" aria-label="담당자를 적는 길">
        {(
          [
            ["names", "이름 목록"],
            ["variable", "변수에서"],
          ] as const
        ).map(([one, label]) => (
          <label key={one} className="flex items-center gap-1">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === one}
              onChange={() => {
                // 길을 바꾸면 앞 값은 비운다 — 이름 목록이 변수 이름으로 읽히지 않게.
                setText("");
                setMode(one);
                onChange(undefined);
              }}
              disabled={!canWrite}
            />
            {label}
          </label>
        ))}
      </div>
      {mode === "names" ? (
        <textarea
          id={id}
          className={INPUT}
          rows={2}
          placeholder="한 줄에 한 사람"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(writeAssignees({ mode: "names", names: e.target.value.split("\n") }));
          }}
          disabled={!canWrite}
        />
      ) : (
        <input
          id={id}
          className={`${INPUT} font-mono`}
          placeholder="변수 이름"
          value={value.mode === "variable" ? value.name : ""}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
          disabled={!canWrite}
        />
      )}
    </div>
  );
}
