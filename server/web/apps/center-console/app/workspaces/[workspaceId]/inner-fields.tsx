"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, InfoTip } from "@bpm/ui";

import {
  numberProblem,
  retryProblems,
  writeDelegate,
  writeLimits,
  writeRetry,
  type DelegateForm,
  type InputLine,
  type LimitsForm,
  type RetryForm,
} from "@/lib/inner-fields";

/**
 * 안쪽 모델이 작은 칸 — **패널 안의 칸들**이다 (CON-20b 상세 패널). 다시 시도·한도·맡기기와
 * BPM 프로세스 입력의 요약. 셈(읽기·쓰기·말할 것)은 `lib/inner-fields.ts`에 있고 vitest가 잰다.
 * 말할 것은 **막지 않는다** — 수가 아닌 조각은 넣지 않고 그 칸 아래에 말한다.
 */

const INPUT = "w-full rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-body-sm";

/**
 * 폼은 **글 그대로** 따로 든다 — `503, `처럼 고치는 중인 글을 본문으로 거르면 잃는다.
 * 바깥에서 값이 바뀌면(「버리기」·다른 요소) 다시 짓는다 — 지금 글이 같은 값을 뜻하면 그대로 둔다.
 */
function useLocalForm<F>(given: F, write: (form: F) => unknown): [F, (form: F) => void] {
  const [form, setForm] = useState(given);
  const givenText = JSON.stringify(write(given) ?? null);
  useEffect(() => {
    setForm((now) => (JSON.stringify(write(now) ?? null) === givenText ? now : given));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenText]);
  return [form, setForm];
}

function Field({
  label,
  code,
  help,
  problem,
  children,
}: {
  label: string;
  code: string;
  help?: string;
  problem?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-1.5">
        <label htmlFor={id} className="text-body-sm text-text-primary" title={code}>
          {label}
        </label>
        {help ? (
          <InfoTip label={`${label.replace(/ \*$/, "")} 설명`} className="ml-auto">
            {help}
          </InfoTip>
        ) : null}
      </div>
      {children(id)}
      {problem ? <span className="text-caption text-status-warning-fg">{problem}</span> : null}
    </div>
  );
}

/** 칸 묶음의 머리 — 칸 이름(진한 글자)과 그 아래 작은 칸들. */
function Group({ label, code, help, children }: { label: string; code: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center gap-1.5">
        <span className="text-body-sm font-medium text-text-primary" title={code}>
          {label}
        </span>
        {help ? (
          <InfoTip label={`${label} 설명`} className="ml-auto">
            {help}
          </InfoTip>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 border-l-2 border-border-default pl-3">{children}</div>
    </div>
  );
}

/** 다시 시도 (`bpm:serviceCall` `retry`, C14 `Retry`). */
export function RetryEditor({
  value,
  canWrite,
  onChange,
}: {
  value: RetryForm;
  canWrite: boolean;
  onChange: (value: Record<string, unknown> | undefined) => void;
}) {
  const [form, setForm] = useLocalForm(value, writeRetry);
  const put = (made: Partial<RetryForm>) => {
    const next = { ...form, ...made };
    setForm(next);
    onChange(writeRetry(next));
  };
  const problems = retryProblems(form);
  return (
    <Group label="다시 시도" code="retry">
      <Field label="다시 시도 횟수" code="max" problem={problems.max} help="비우거나 0이면 다시 부르지 않습니다.">
        {(id) => (
          <input
            id={id}
            className={INPUT}
            inputMode="numeric"
            value={form.max}
            placeholder="0"
            onChange={(e) => put({ max: e.target.value })}
            disabled={!canWrite}
          />
        )}
      </Field>
      <Field
        label="다시 부를 상태 코드"
        code="on"
        problem={problems.on}
        help="쉼표로 여럿 적습니다 (예: 503, 429). 이 응답 코드가 오면 다시 부릅니다."
      >
        {(id) => (
          <input
            id={id}
            className={`${INPUT} font-mono`}
            value={form.on}
            placeholder="503, 429"
            onChange={(e) => put({ on: e.target.value })}
            disabled={!canWrite}
          />
        )}
      </Field>
    </Group>
  );
}

/** 한도 (`limits`, C14 `Limits`) — AI 태스크와 기본값이 같은 모양이다. */
export function LimitsEditor({
  value,
  canWrite,
  onChange,
}: {
  value: LimitsForm;
  canWrite: boolean;
  onChange: (value: Record<string, unknown> | undefined) => void;
}) {
  const [form, setForm] = useLocalForm(value, writeLimits);
  const put = (made: Partial<LimitsForm>) => {
    const next = { ...form, ...made };
    setForm(next);
    onChange(writeLimits(next));
  };
  const box = (key: "timeout_s" | "max_steps", label: string, help: string) => (
    <Field label={label} code={key} help={help} problem={numberProblem(form[key])}>
      {(id) => (
        <input
          id={id}
          className={INPUT}
          inputMode="numeric"
          value={form[key]}
          onChange={(e) => put({ [key]: e.target.value })}
          disabled={!canWrite}
        />
      )}
    </Field>
  );
  return (
    <Group label="한도" code="limits">
      {box("timeout_s", "제한 시간(초)", "이 시간이 지나면 멈춥니다. 비우면 기본값입니다.")}
      {box("max_steps", "최대 걸음 수", "모델이 도구를 부를 수 있는 횟수입니다. 비우면 기본값입니다.")}
    </Group>
  );
}

/** 맡기기 (`bpm:call` `delegate`, C14 `Delegate`, ADR-0082). */
export function DelegateEditor({
  value,
  help,
  canWrite,
  onChange,
}: {
  value: DelegateForm;
  help?: string;
  canWrite: boolean;
  onChange: (value: Record<string, unknown> | undefined) => void;
}) {
  const [form, setForm] = useLocalForm(value, writeDelegate);
  const put = (made: Partial<DelegateForm>) => {
    const next = { ...form, ...made };
    setForm(next);
    onChange(writeDelegate(next));
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.on} onChange={(e) => put({ on: e.target.checked })} disabled={!canWrite} />
          <span className="text-body-sm font-medium text-text-primary" title="delegate">
            다른 패키지에 맡기기
          </span>
        </label>
        {help ? (
          <InfoTip label="맡기기 설명" className="ml-auto">
            {help}
          </InfoTip>
        ) : null}
      </div>
      {form.on ? (
        <div className="flex flex-col gap-2 border-l-2 border-border-default pl-3">
          <Field
            label="패키지 id *"
            code="bpm_process_id"
            help="따로 올리고 배포한 BPM 프로세스 패키지의 id입니다."
            problem={canWrite && !form.bpm_process_id.trim() ? "필수 칸이 비어 있습니다." : undefined}
          >
            {(id) => (
              <input
                id={id}
                className={`${INPUT} font-mono`}
                value={form.bpm_process_id}
                onChange={(e) => put({ bpm_process_id: e.target.value })}
                disabled={!canWrite}
              />
            )}
          </Field>
          <Field label="판" code="version" help="비우면 배포된 판을 부릅니다.">
            {(id) => (
              <input
                id={id}
                className={`${INPUT} font-mono`}
                value={form.version}
                placeholder="(배포된 판)"
                onChange={(e) => put({ version: e.target.value })}
                disabled={!canWrite}
              />
            )}
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** BPM 프로세스 입력의 요약 (`bpm:process` `inputs`) — 고치는 자리는 아래 탭 「변수」 하나다. */
export function InputsSummary({ lines, onOpenVariables }: { lines: InputLine[]; onOpenVariables?: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm font-medium text-text-primary" title="inputs">
        입력
      </span>
      {lines.length ? (
        <ul className="flex flex-col gap-0.5">
          {lines.map((one, at) => (
            <li key={at} className="flex items-baseline gap-2 text-body-sm">
              <span className="font-mono">{one.name}</span>
              <span className="text-caption text-text-muted">{one.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-caption text-text-muted">선언한 입력이 없습니다.</span>
      )}
      {onOpenVariables ? (
        <Button size="sm" variant="secondary" className="self-start" onClick={onOpenVariables}>
          변수 탭에서 고치기
        </Button>
      ) : null}
    </div>
  );
}
