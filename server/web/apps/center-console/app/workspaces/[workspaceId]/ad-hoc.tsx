"use client";

import { useId, useState, type ReactNode } from "react";
import { Button, Dialog, InfoTip } from "@bpm/ui";
import type { AdHocInfo } from "@bpm/bpmn-canvas";

import {
  adHocMode,
  aiProblems,
  readAi,
  REPLAY_LABELS,
  summarizeAi,
  switchMode,
  VALUE_TYPES,
  writeAi,
  type AdHocAiForm,
} from "@/lib/ad-hoc";
import type { Body } from "@/lib/element-values";
import { VALUE_TYPE_LABELS } from "@/lib/inner-fields";
import { MapTable } from "./map-table";

/**
 * Ad Hoc 하위 프로세스의 「기본」 묶음 (CON-20b 상세 패널, C14 §Ad Hoc 하위 프로세스, ADR-0190).
 *
 * 표준 칸 셋(켜는 차례·완료 조건·남은 것 걷기)과 `bpm:adHoc`의 **고르는 방식**(식 또는 AI 하나)을 한 자리에
 * 둔다. AI 설정은 칸이 여럿이라 **패널은 요약, 고치는 것은 팝업**이다(결재의 답 칸과 같은 결 — 팝업의
 * 「적용」은 바로 그림에 넣는다). 「한 번의 결과」·「모을 변수」는 「입력·출력」 탭의 생성된 폼이 그린다.
 * 셈은 `lib/ad-hoc.ts`이고 vitest가 잰다. 원문 이름은 말풍선이다.
 */

const INPUT = "w-full rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-body-sm";

export function AdHocSection({
  info,
  body,
  canWrite,
  onInfo,
  onBody,
  onApplyNow,
}: {
  info: AdHocInfo;
  /** `bpm:adHoc` 본문 — 아직 없으면 `undefined`. */
  body: Body | undefined;
  canWrite: boolean;
  onInfo: (made: AdHocInfo) => void;
  onBody: (made: Body) => void;
  /** 팝업의 「적용」 — 곧바로 그림에 넣는다. */
  onApplyNow: (made: Body) => void;
}) {
  const given = body ?? {};
  const mode = adHocMode(given);
  const [editing, setEditing] = useState(false);
  const summary = mode === "ai" ? summarizeAi(given.ai) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex min-h-6 items-center gap-1.5">
          <span className="text-body-sm font-medium text-text-primary" title="bpm:adHoc">
            고르는 방식 *
          </span>
          <InfoTip label="고르는 방식 설명" className="ml-auto">
            {"안의 활동을 무엇이 골라 켤지 정합니다 — 식 하나 또는 AI 하나입니다.\n바꾸면 다른 쪽 설정은 빠집니다."}
          </InfoTip>
        </div>
        <div role="radiogroup" aria-label="고르는 방식" className="flex gap-0.5 rounded-md border border-border-default bg-bg-canvas p-0.5">
          {(
            [
              ["activate", "식", "activate"],
              ["ai", "AI", "ai"],
            ] as const
          ).map(([value, label, code]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              title={code}
              disabled={!canWrite}
              onClick={() => onBody(switchMode(given, value))}
              className={
                mode === value
                  ? "flex-1 rounded-sm bg-bg-surface px-2 py-1 text-caption font-semibold text-text-primary shadow-sm"
                  : "flex-1 rounded-sm px-2 py-1 text-caption text-text-muted hover:text-text-primary disabled:hover:text-text-muted"
              }
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "" ? (
          <span className="text-caption text-status-warning-fg">고르는 방식을 정합니다 — 식이나 AI 중 하나입니다.</span>
        ) : null}
      </div>

      {mode === "activate" ? (
        <Row
          label="켤 활동 *"
          code="activate"
          help={"식 — 켤 활동의 id 또는 이름 목록입니다. 들어갈 때 한 번 봅니다.\n빈 목록이면 곧바로 끝납니다."}
          problem={String(given.activate ?? "").trim() ? undefined : "필수 칸이 비어 있습니다."}
        >
          {(id) => (
            <input
              id={id}
              className={`${INPUT} font-mono`}
              value={String(given.activate ?? "")}
              onChange={(e) => onBody({ ...given, activate: e.target.value })}
              disabled={!canWrite}
            />
          )}
        </Row>
      ) : null}

      {mode === "ai" ? (
        <div className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-text-primary" title="ai">
            AI 설정
          </span>
          {summary ? (
            <div className="rounded-md border border-border-default px-2 py-1.5">
              <span className="block truncate">{summary.goal || "(목표 없음)"}</span>
              <span className="block text-caption text-text-muted">{summary.facts}</span>
            </div>
          ) : (
            <p className="text-caption text-text-muted">읽지 못하는 모양이라 아래 JSON 칸으로 고칩니다.</p>
          )}
          {summary ? (
            <Button size="sm" variant="secondary" className="self-start" onClick={() => setEditing(true)}>
              {canWrite ? "AI 설정 편집..." : "AI 설정 보기..."}
            </Button>
          ) : null}
          {editing ? (
            <AiDialog
              form={readAi(given.ai)!}
              canWrite={canWrite}
              onClose={() => setEditing(false)}
              onApply={(made) => {
                setEditing(false);
                onApplyNow({ ...given, ai: writeAi(made) });
              }}
            />
          ) : null}
        </div>
      ) : null}

      <Row label="켜는 차례" code="ordering" help={"함께: 켠 활동이 함께 돕니다 (기본).\n차례로: 적힌 차례로 하나씩 돕니다."}>
        {(id) => (
          <select
            id={id}
            className={INPUT}
            value={info.ordering}
            onChange={(e) => onInfo({ ...info, ordering: e.target.value === "Sequential" ? "Sequential" : "Parallel" })}
            disabled={!canWrite}
          >
            <option value="Parallel">함께</option>
            <option value="Sequential">차례로</option>
          </select>
        )}
      </Row>

      <Row
        label="완료 조건"
        code="completionCondition"
        help="bpm-expr 식 — 활동 흐름이 끝날 때마다 봅니다. 비우면 켠 것이 다 끝날 때 끝납니다."
      >
        {(id) => (
          <input
            id={id}
            className={`${INPUT} font-mono`}
            value={info.completion}
            onChange={(e) => onInfo({ ...info, completion: e.target.value })}
            disabled={!canWrite}
          />
        )}
      </Row>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={info.cancelRemaining}
            onChange={(e) => onInfo({ ...info, cancelRemaining: e.target.checked })}
            disabled={!canWrite}
          />
          <span title="cancelRemainingInstances">완료 때 남은 것 걷기</span>
        </label>
        <InfoTip label="완료 때 남은 것 걷기 설명">
          {"완료 조건이 참이 되면 아직 도는 활동을 걷습니다 (기본).\n끄면 다 끝나기를 기다립니다 — 아직 켜지 않은 차례는 켜지 않습니다."}
        </InfoTip>
      </div>
    </section>
  );
}

/** AI 설정 팝업 — 고치는 것은 **사본**이고 「적용」에서만 나간다. AI 태스크와 같은 칸이고 제한 시간은 없다. */
function AiDialog({
  form: given,
  canWrite,
  onClose,
  onApply,
}: {
  form: AdHocAiForm;
  canWrite: boolean;
  onClose: () => void;
  onApply: (form: AdHocAiForm) => void;
}) {
  const [form, setForm] = useState(given);
  const put = (made: Partial<AdHocAiForm>) => setForm((before) => ({ ...before, ...made }));
  const problems = aiProblems(form);
  const typeHelp = `타입은 ${VALUE_TYPES.map((one) => `${one}(${VALUE_TYPE_LABELS[one] ?? one})`).join(" · ")}입니다.`;
  const rows = (value: Record<string, string> | undefined) => Object.entries(value ?? {});

  return (
    <Dialog
      open
      title="AI 설정"
      width={760}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {canWrite ? "취소" : "닫기"}
          </Button>
          {canWrite ? (
            <Button variant="primary" onClick={() => onApply(form)}>
              적용
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1 text-body-sm">
        <Row
          label="목표 *"
          code="goal"
          help="Markdown — 이름으로 가리킨 변수만 모델에게 갑니다. 도구는 들어오는 흐름이 없는 안쪽 활동입니다."
          problem={problems.goal}
        >
          {(id) => (
            <textarea
              id={id}
              className={INPUT}
              rows={6}
              value={form.goal}
              onChange={(e) => put({ goal: e.target.value })}
              disabled={!canWrite}
            />
          )}
        </Row>

        <div className="flex flex-col gap-1">
          <MapTable
            label="입력"
            code="inputs"
            help={`\`이름=타입\` — 모델이 활동을 켤 때 함께 줄 수 있는 값입니다. 켜기 전에 그 변수에 담습니다.\n${typeHelp}`}
            rows={form.inputs}
            canWrite={canWrite}
            onChange={(value) => put({ inputs: rows(value) })}
            onApplyNow={(value) => put({ inputs: rows(value) })}
          />
          {problems.inputs ? <span className="text-caption text-status-warning-fg">{problems.inputs}</span> : null}
        </div>

        <div className="flex flex-col gap-1">
          <MapTable
            label="결과 필드"
            code="results"
            help={`\`이름=타입\` — 모델의 마지막 답입니다. 완료 조건으로 끝나면 비어 있습니다.\n${typeHelp}`}
            rows={form.results}
            canWrite={canWrite}
            onChange={(value) => put({ results: rows(value) })}
            onApplyNow={(value) => put({ results: rows(value) })}
          />
          {problems.results ? <span className="text-caption text-status-warning-fg">{problems.results}</span> : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Row label="재생" code="replay" help="결정 수행에서 무엇을 다시 쓰나 — 기본은 「계획만 되밟기」입니다.">
            {(id) => (
              <select
                id={id}
                className={INPUT}
                value={form.replay || "plan"}
                onChange={(e) => put({ replay: e.target.value })}
                disabled={!canWrite}
              >
                {Object.entries(REPLAY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Row>
          <Row
            label="최대 차례"
            code="limits.max_steps"
            help="모델에 묻는 횟수입니다. 비우면 기본(8)입니다. 시간은 경계 타이머로 겁니다."
            problem={problems.maxSteps}
          >
            {(id) => (
              <input
                id={id}
                className={INPUT}
                inputMode="numeric"
                value={form.maxSteps}
                onChange={(e) => put({ maxSteps: e.target.value })}
                disabled={!canWrite}
              />
            )}
          </Row>
        </div>

        <Row label="금지 동작" code="forbidden_actions" help="한 줄에 하나씩 — 모델에게 주는 지시문입니다.">
          {(id) => (
            <textarea
              id={id}
              className={INPUT}
              rows={3}
              value={form.forbidden}
              onChange={(e) => put({ forbidden: e.target.value })}
              disabled={!canWrite}
            />
          )}
        </Row>
      </div>
    </Dialog>
  );
}

/** 이름(원문은 말풍선) + 「?」 + 칸 + 말할 것. */
function Row({
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
        <label htmlFor={id} className="text-body-sm font-medium text-text-primary" title={code}>
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
