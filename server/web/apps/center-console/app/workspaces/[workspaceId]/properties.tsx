"use client";

import { useEffect, useId, useMemo, useState, type MutableRefObject, type ReactNode } from "react";
import { ArrowRight, Check, ChevronRight, Circle, Copy, Diamond, Plus, Square, SquarePlus } from "lucide-react";
import { ActionMenu, Button, InfoTip } from "@bpm/ui";
import { ELEMENT_FORMS, EVENT_KINDS } from "@bpm/bpmn-canvas";
import type { ElementField, NodeProperties, PropertyPatch } from "@bpm/bpmn-canvas";
import type { ServiceAppResource } from "@bpm/api-types/c7-service-app-resource";

import { loadWorkspaceResources } from "@/app/actions";
import { readAnswerFields, readAssignees } from "@/lib/answer-fields";
import { AnswerFieldsEditor, AssigneesEditor } from "./answer-fields";
import { MapTable } from "./map-table";
import { serviceCallHints, type Suggestion } from "@/lib/resources";
import {
  mapRows,
  eventFields,
  eventPatch,
  parseBody,
  strayKeys,
  toInput,
  withField,
  writeBody,
  type Body,
  type EventFieldValues,
} from "@/lib/element-values";

/**
 * CON-20b 상세 패널 — 고른 요소 하나를 고친다 (STU-04가 하던 일).
 *
 * **`bpm:*` 폼은 C14 모델에서 생성한 명세로 짓는다** (`ELEMENT_FORMS`) — 칸을 손으로 적지 않으므로
 * 모델에 칸이 늘면 폼에 저절로 생긴다(한글 이름도 생성기가 함께 싣는다). 폼이 그리지 못하는 모양(안쪽
 * 모델·섞인 목록)은 JSON 칸 하나이고, **모델에 없는데 파일에 있는 칸은 그대로 들고 간다** (C14 호환 규칙).
 *
 * 고친 것은 「적용」을 눌러야 그림에 들어간다 — 한 번이 **실행 취소 한 걸음**이다. 적용 안 한 편집은
 * `draft`에 올려 두어 편집기가 다른 요소로 넘어가기 전에 묻게 한다 (U11).
 */

/** 그 종류의 노드에만 있는 표준 칸. 없는 칸을 보내면 엉뚱한 속성이 생긴다. */
const isActivity = (type: string) => /Task$/.test(type) || type === "CallActivity" || type === "SubProcess";

const INPUT = "w-full rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-body-sm";

/** 머리의 이름 — `bpm:*` 폼이 그 요소가 **무엇을 하는지** 말하므로 먼저 본다 (`docs/02-glossary.md` §2). */
const ROLE_FORMS = ["aiTask", "serviceCall", "approval", "rule", "email", "webhook", "receive", "call", "fileList", "dataOutput", "task"];
const ROLE_NAMES: Record<string, string> = { serviceCall: "서비스 앱 태스크", rule: "규칙 태스크" };
const TYPE_NAMES: Record<string, string> = {
  StartEvent: "시작 이벤트",
  EndEvent: "끝 이벤트",
  IntermediateCatchEvent: "중간 잡기 이벤트",
  IntermediateThrowEvent: "중간 던지기 이벤트",
  BoundaryEvent: "경계 이벤트",
  ExclusiveGateway: "배타 게이트웨이",
  ParallelGateway: "병렬 게이트웨이",
  InclusiveGateway: "포함 게이트웨이",
  EventBasedGateway: "이벤트 기반 게이트웨이",
  Task: "태스크",
  UserTask: "사람 태스크",
  ServiceTask: "서비스 태스크",
  ScriptTask: "스크립트 태스크",
  BusinessRuleTask: "규칙 태스크",
  SendTask: "보내기 태스크",
  ReceiveTask: "받기 태스크",
  ManualTask: "수동 태스크",
  SubProcess: "하위 프로세스",
  CallActivity: "호출 활동",
  SequenceFlow: "흐름",
};

/** 이벤트 정의의 화면 이름 — `eventOf`가 남긴 짧은 이름(`Timer`)을 한글로. 모르는 것은 그대로. */
const EVENT_NAMES: Record<string, string> = {
  Timer: "타이머",
  Message: "메시지",
  Signal: "신호",
  Error: "오류",
  Escalation: "전환",
  Conditional: "조건",
  Terminate: "종료",
  Compensate: "보상",
  Link: "링크",
};

function kindOf(node: NodeProperties): { name: string; icon: ReactNode } {
  const role = ROLE_FORMS.find((one) => one in node.bpm);
  const name = role ? (ROLE_NAMES[role] ?? ELEMENT_FORMS[role]?.label ?? role) : (TYPE_NAMES[node.type] ?? node.type);
  const shape =
    node.type === "SequenceFlow"
      ? ArrowRight
      : /Event$/.test(node.type)
        ? Circle
        : /Gateway$/.test(node.type)
          ? Diamond
          : node.type === "SubProcess" || node.type === "CallActivity"
            ? SquarePlus
            : Square;
  const Icon = shape;
  return { name, icon: <Icon size={18} aria-hidden /> };
}

/**
 * 서비스 앱 목록 — 편집기를 띄운 동안 **한 번만** 읽는다. 요소를 고를 때마다 Center에 묻지 않는다.
 * 못 읽으면 빈 목록이고, 빈 목록이면 고를 거리도 경고도 없다 (`serviceCallHints`).
 */
let serviceApps: Promise<ServiceAppResource[]> | null = null;

function useServiceApps(wanted: boolean): ServiceAppResource[] {
  const [apps, setApps] = useState<ServiceAppResource[]>([]);
  useEffect(() => {
    if (!wanted) return;
    serviceApps ??= loadWorkspaceResources()
      .then((found) => found.apps)
      .catch(() => []);
    let live = true;
    void serviceApps.then((found) => live && setApps(found));
    return () => {
      live = false;
    };
  }, [wanted]);
  return apps;
}

/** 패널이 들고 있는 편집 — 요소에서 읽은 것과 견주어 「적용 안 한 변경」을 가른다. */
interface Form {
  name: string;
  documentation: string;
  condition: string;
  script: string;
  calledElement: string;
  multiInstance: NodeProperties["multiInstance"];
  fallback: string;
  bpm: Record<string, Body>;
  dropped: string[];
  event: EventFieldValues;
}

function formOf(node: NodeProperties): Form {
  return {
    name: node.name,
    documentation: node.documentation,
    condition: node.condition,
    script: node.script,
    calledElement: node.calledElement,
    multiInstance: node.multiInstance,
    fallback: node.gateway?.default ?? "",
    bpm: Object.fromEntries(Object.entries(node.bpm).map(([key, body]) => [key, parseBody(body)])),
    dropped: [],
    event: eventFields(node.event),
  };
}

function patchOf(node: NodeProperties, form: Form): PropertyPatch {
  const patch: PropertyPatch = { name: form.name, documentation: form.documentation };
  if (node.type === "SequenceFlow") patch.condition = form.condition;
  if (node.type === "ScriptTask") patch.script = form.script;
  if (node.type === "CallActivity") patch.calledElement = form.calledElement;
  if (isActivity(node.type)) patch.multiInstance = form.multiInstance;
  if (node.gateway) patch.default = form.fallback;
  const bodies: Record<string, string | null> = {};
  for (const [key, body] of Object.entries(form.bpm)) bodies[key] = writeBody(body);
  for (const key of form.dropped) bodies[key] = null;
  if (Object.keys(bodies).length) patch.bpm = bodies;
  if (node.event) patch.event = eventPatch(node.event, form.event);
  return patch;
}

export function Properties({
  node,
  canWrite,
  flows,
  onApply,
  draft,
  onDraft,
}: {
  node: NodeProperties;
  canWrite: boolean;
  /** 게이트웨이의 기본 흐름으로 고를 거리 (그 노드에서 나가는 흐름). */
  flows: { id: string; label: string }[];
  onApply: (patch: PropertyPatch) => void;
  /** 적용 안 한 편집 — 있으면 그 패치, 없으면 `null`. 편집기가 다른 요소로 가기 전에 본다 (U11). */
  draft: MutableRefObject<PropertyPatch | null>;
  /** 적용 안 한 편집이 생기고 없어질 때 — 편집기가 「저장」 단추를 켠다. */
  onDraft?: (changed: boolean) => void;
}) {
  const start = useMemo(() => formOf(node), [node]);
  const [form, setForm] = useState(start);
  const set = (made: Partial<Form>) => setForm((before) => ({ ...before, ...made }));

  // 다른 요소를 고르거나 적용한 뒤 다시 읽으면 **그 값으로 갈아 끼운다** — 앞 편집이 따라오지 않게.
  useEffect(() => setForm(start), [start]);

  const changed = JSON.stringify(form) !== JSON.stringify(start);
  useEffect(() => {
    draft.current = changed ? patchOf(node, form) : null;
  }, [changed, draft, form, node]);
  useEffect(() => onDraft?.(changed), [changed, onDraft]);
  useEffect(
    () => () => {
      draft.current = null;
      onDraft?.(false);
    },
    [draft, onDraft],
  );

  const kind = kindOf(node);
  const spare = Object.keys(ELEMENT_FORMS)
    .filter((one) => !(one in form.bpm))
    .sort((a, b) => (ELEMENT_FORMS[a]?.label ?? a).localeCompare(ELEMENT_FORMS[b]?.label ?? b, "ko"));
  const hasBehaviour =
    node.type === "SequenceFlow" ||
    node.type === "ScriptTask" ||
    node.type === "CallActivity" ||
    isActivity(node.type) ||
    Boolean(node.gateway) ||
    Boolean(node.event);

  return (
    <div className="flex min-h-0 flex-1 flex-col text-body-sm">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Header id={node.id} type={node.type} name={kind.name} icon={kind.icon} />

        <Group title="일반">
          <Labelled label="이름">
            {(id) => (
              <input id={id} className={INPUT} value={form.name} onChange={(e) => set({ name: e.target.value })} disabled={!canWrite} />
            )}
          </Labelled>
          <Labelled label="설명">
            {(id) => (
              <textarea
                id={id}
                className={INPUT}
                rows={2}
                value={form.documentation}
                onChange={(e) => set({ documentation: e.target.value })}
                disabled={!canWrite}
              />
            )}
          </Labelled>
        </Group>

        {hasBehaviour ? (
          <Group title="동작">
            {node.type === "SequenceFlow" ? (
              <Labelled label="조건식" help="`${…}` 꼴의 bpm-expr입니다.">
                {(id) => (
                  <input
                    id={id}
                    className={`${INPUT} font-mono`}
                    value={form.condition}
                    onChange={(e) => set({ condition: e.target.value })}
                    disabled={!canWrite}
                  />
                )}
              </Labelled>
            ) : null}

            {node.type === "ScriptTask" ? (
              <Labelled label="스크립트">
                {(id) => (
                  <textarea
                    id={id}
                    className={`${INPUT} font-mono`}
                    rows={4}
                    value={form.script}
                    onChange={(e) => set({ script: e.target.value })}
                    disabled={!canWrite}
                  />
                )}
              </Labelled>
            ) : null}

            {node.type === "CallActivity" ? (
              <Labelled label="부르는 것" help="공유 BPM 프로세스의 정의 id입니다.">
                {(id) => (
                  <input
                    id={id}
                    className={INPUT}
                    value={form.calledElement}
                    onChange={(e) => set({ calledElement: e.target.value })}
                    disabled={!canWrite}
                  />
                )}
              </Labelled>
            ) : null}

            {isActivity(node.type) ? (
              <Labelled label="반복">
                {(id) => (
                  <select
                    id={id}
                    className={INPUT}
                    value={form.multiInstance}
                    onChange={(e) => set({ multiInstance: e.target.value as NodeProperties["multiInstance"] })}
                    disabled={!canWrite}
                  >
                    <option value="">없음</option>
                    <option value="sequential">하나씩</option>
                    <option value="parallel">한꺼번에</option>
                  </select>
                )}
              </Labelled>
            ) : null}

            {node.gateway ? (
              <Labelled label="기본 흐름" help="어느 조건도 맞지 않을 때 가는 길입니다.">
                {(id) => (
                  <select
                    id={id}
                    className={INPUT}
                    value={form.fallback}
                    onChange={(e) => set({ fallback: e.target.value })}
                    disabled={!canWrite}
                  >
                    <option value="">없음</option>
                    {flows.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.label}
                      </option>
                    ))}
                  </select>
                )}
              </Labelled>
            ) : null}

            {node.event ? (
              <EventFields
                event={node.event}
                fields={form.event}
                canWrite={canWrite}
                onChange={(made) => set({ event: { ...form.event, ...made } })}
              />
            ) : null}
          </Group>
        ) : null}

        {Object.entries(form.bpm).map(([key, body]) => (
          <ElementBlock
            key={key}
            name={key}
            body={body}
            canWrite={canWrite}
            onChange={(made) => set({ bpm: { ...form.bpm, [key]: made } })}
            onDrop={() => {
              const rest = { ...form.bpm };
              delete rest[key];
              set({ bpm: rest, dropped: [...form.dropped, key] });
            }}
          />
        ))}

        {canWrite && spare.length ? (
          <div className="px-3 py-3">
            <ActionMenu
              label="설정 더하기"
              items={spare.map((one) => ({
                label: ELEMENT_FORMS[one]?.label ?? one,
                onSelect: () =>
                  set({ bpm: { ...form.bpm, [one]: {} }, dropped: form.dropped.filter((gone) => gone !== one) }),
              }))}
            >
              <Plus size={16} aria-hidden />
              설정 더하기
            </ActionMenu>
          </div>
        ) : null}
      </div>

      {/* 패널 바닥에 붙는다 — 폼이 길어도 「적용」이 늘 보인다. */}
      <div className="flex items-center gap-2 border-t border-border-default bg-bg-subtle px-3 py-2">
        {canWrite ? (
          <>
            <span className="mr-auto text-caption text-text-muted" aria-live="polite">
              {changed ? "적용 안 한 변경" : "변경 없음"}
            </span>
            <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setForm(start)}>
              버리기
            </Button>
            <Button size="sm" variant="primary" disabled={!changed} onClick={() => onApply(patchOf(node, form))}>
              적용
            </Button>
          </>
        ) : (
          <span className="text-caption text-text-muted">보기 전용이라 고칠 수 없습니다.</span>
        )}
      </div>
    </div>
  );
}

/** 머리 — 갈래 아이콘 + 한글 종류와 「id 복사」. 요소 id·원문 타입은 **말풍선**이다 (화면에 영어를 쓰지 않는다). */
function Header({ id, type, name, icon }: { id: string; type: string; name: string; icon: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 border-b border-border-default px-3 py-3">
      <span className="text-text-secondary">{icon}</span>
      <p className="min-w-0 flex-1 font-semibold text-text-primary" title={`${id} · ${type}`}>
        {name}
      </p>
      <button
        type="button"
        aria-label={`요소 id 복사 (${id})`}
        title={`요소 id 복사 — ${id}`}
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text-primary"
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </div>
  );
}

/** 접는 무리 — 새로 고른 요소는 다 펴진 채다 (기억하지 않는다). */
function Group({
  title,
  note,
  action,
  children,
}: {
  title: string;
  /** 제목의 말풍선 (`bpm:aiTask`) — 원문 이름은 화면에 쓰지 않는다. */
  note?: string;
  /** 제목 오른쪽 — 그 무리에만 영향을 주는 것 (U14). */
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-border-default">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          title={note}
          className="flex min-w-0 flex-1 items-center gap-1 px-3 py-2 text-left hover:bg-bg-subtle"
        >
          <ChevronRight size={14} aria-hidden className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="font-semibold text-text-primary">{title}</span>
        </button>
        {action}
      </div>
      {open ? <div className="flex flex-col gap-3 px-3 pt-1 pb-3">{children}</div> : null}
    </section>
  );
}

/** `bpm:*` 하나 — 폼은 **생성된 명세**가 정한다. 명세가 없는 요소는 JSON 칸 하나다. */
function ElementBlock({
  name,
  body,
  canWrite,
  onChange,
  onDrop,
}: {
  name: string;
  body: Body;
  canWrite: boolean;
  onChange: (body: Body) => void;
  onDrop: () => void;
}) {
  const form = ELEMENT_FORMS[name];
  const stray = strayKeys(body, form?.fields ?? []);
  // 서비스 앱 태스크만 — 앱·작업 칸에 등록된 것을 띄우고, 없는 이름이면 그 자리에서 한 줄 말한다.
  const isServiceCall = name === "serviceCall";
  const apps = useServiceApps(isServiceCall);
  const hints = isServiceCall
    ? serviceCallHints(apps, String(body.app_id ?? ""), String(body.operation ?? ""))
    : null;
  const extra = (field: string): { suggestions?: Suggestion[]; warning?: string } =>
    !hints
      ? {}
      : field === "app_id"
        ? { suggestions: hints.apps, warning: hints.appWarning }
        : field === "operation"
          ? { suggestions: hints.operations, warning: hints.operationWarning }
          : {};
  return (
    <Group
      title={form?.label ?? name}
      note={`bpm:${name}`}
      action={
        canWrite ? (
          <ActionMenu label={`${form?.label ?? name} 설정 동작`} items={[{ label: "설정 빼기", onSelect: onDrop }]} />
        ) : null
      }
    >
      {form ? (
        form.fields.map((field) => {
          // 결재의 답 칸·담당자는 **제 편집기**가 있다 — 읽지 못하는 모양이면 JSON 칸으로 남는다.
          const put = (value: unknown) => {
            const made = { ...body };
            if (value === undefined) delete made[field.name];
            else made[field.name] = value;
            onChange(made);
          };
          if (name === "approval" && field.name === "fields") {
            const answers = readAnswerFields(body.fields);
            if (answers) return <AnswerFieldsEditor key={field.name} fields={answers} canWrite={canWrite} onChange={put} />;
          }
          // `이름=값`은 두 열의 표다 — 객체가 아닌 값(반쯤 적은 글)은 글 칸으로 남는다.
          if (field.kind === "map-text") {
            const rows = mapRows(body[field.name]);
            if (rows)
              return (
                <MapTable
                  key={field.name}
                  label={`${field.label}${field.required ? " *" : ""}`}
                  code={field.name}
                  help={field.help}
                  rows={rows}
                  canWrite={canWrite}
                  onChange={put}
                />
              );
          }
          if (name === "approval" && field.name === "assignees") {
            const who = readAssignees(body.assignees);
            if (who) return <AssigneesEditor key={field.name} value={who} canWrite={canWrite} onChange={put} />;
          }
          return (
          <FieldView
            key={field.name}
            field={field}
            body={body}
            canWrite={canWrite}
            onChange={(text) => onChange(withField(body, field, text))}
            {...extra(field.name)}
          />
          );
        })
      ) : (
        // 모델에 없는 요소 — 그래도 **고칠 수 있게** 한다 (확장이 더한 것일 수 있다).
        <textarea
          aria-label={`bpm:${name} 본문 (JSON)`}
          className={`${INPUT} font-mono`}
          rows={6}
          value={writeBody(body)}
          onChange={(e) => onChange(parseBody(e.target.value))}
          disabled={!canWrite}
        />
      )}
      {stray.length ? (
        <p className="text-caption text-text-muted">폼이 모르는 칸도 그대로 둡니다: {stray.join(", ")}</p>
      ) : null}
    </Group>
  );
}

function FieldView({
  field,
  body,
  canWrite,
  onChange,
  suggestions,
  warning,
}: {
  field: ElementField;
  body: Body;
  canWrite: boolean;
  onChange: (text: string) => void;
  /** 칸에 띄울 고를 거리 (`<datalist>`) — 고르지 않고 쳐도 된다. */
  suggestions?: Suggestion[];
  /** 적은 값이 등록된 것에 없다는 한 줄. 저장은 막지 않는다. */
  warning?: string;
}) {
  const listId = useId();
  const value = toInput(field, body[field.name]);
  const label = `${field.label}${field.required ? " *" : ""}`;
  // 비어 있는 필수 칸은 그 자리에서 말한다 — **막지는 않는다**(검사는 쓰기를 막지 않는다, CON-20b).
  const missing = canWrite && field.required && field.kind !== "bool" && value.trim() === "";
  const missingLine = missing ? <span className="text-caption text-status-warning-fg">필수 칸이 비어 있습니다.</span> : null;
  if (field.kind === "bool") {
    return (
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            disabled={!canWrite}
          />
          <span title={field.name}>{label}</span>
        </label>
        {field.help ? <InfoTip label={`${field.label} 설명`}>{field.help}</InfoTip> : null}
      </div>
    );
  }
  if (field.kind === "choice") {
    return (
      <Labelled label={label} code={field.name} help={field.help}>
        {(id) => (
          <>
            <select
              id={id}
              className={INPUT}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={!canWrite}
              aria-invalid={missing ? true : undefined}
            >
              <option value="">(없음)</option>
              {(field.choices ?? []).map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
            {missingLine}
          </>
        )}
      </Labelled>
    );
  }
  const rows = field.kind === "json" ? 4 : field.kind === "list-text" || field.kind === "map-text" ? 3 : 0;
  // 모양 안내는 칸의 설명 뒤에 붙인다 — 둘 다 「?」 하나에 편다.
  const shape =
    field.kind === "list-text"
      ? "한 줄에 하나씩."
      : field.kind === "map-text"
        ? "한 줄에 `이름=값`."
        : field.kind === "json"
          ? "JSON으로 적습니다 (폼이 그리지 못하는 모양입니다)."
          : undefined;
  const help = [field.help, shape].filter(Boolean).join("\n") || undefined;
  return (
    <Labelled label={label} code={field.name} help={help}>
      {(id) => (
        <>
          {rows ? (
            <textarea
              id={id}
              className={`${INPUT} font-mono`}
              rows={rows}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={!canWrite}
              aria-invalid={missing ? true : undefined}
            />
          ) : (
            <input
              id={id}
              className={INPUT}
              type={field.kind === "number" ? "number" : "text"}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={!canWrite}
              list={suggestions?.length ? listId : undefined}
              aria-invalid={warning || missing ? true : undefined}
            />
          )}
          {suggestions?.length ? (
            <datalist id={listId}>
              {suggestions.map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))}
            </datalist>
          ) : null}
          {missingLine}
          {warning ? <span className="text-caption text-status-warning-fg">{warning}</span> : null}
        </>
      )}
    </Labelled>
  );
}

/**
 * 이벤트 칸 — **정의 수준 요소를 만드는 일이라 캔버스가 한다** (`setProperties`의 `event`).
 * 메시지·신호·오류는 이름/코드로 **같은 것을 다시 쓰고**(`rootNamed`), 타이머는 식 하나다.
 *
 * 그 이벤트가 쓰지 않는 칸은 **보이지 않는다** — 적어도 그림에 들어가지 않고, 보이면 사람이
 * 적어 놓고 왜 안 되는지 묻게 된다.
 */
function EventFields({
  event,
  fields,
  canWrite,
  onChange,
}: {
  event: NonNullable<NodeProperties["event"]>;
  fields: EventFieldValues;
  canWrite: boolean;
  onChange: (made: Partial<EventFieldValues>) => void;
}) {
  // **짧은 이름이다** — `eventOf`가 `bpmn:TimerEventDefinition`에서 `Timer`만 남긴다. 글자를
  // 적지 않고 `EVENT_KINDS`를 쓴다 (`"bpmn:…"`과 견주다가 칸을 하나도 그리지 못했다).
  const kind = event.definition;
  return (
    <>
      <dl className="flex flex-col gap-1">
        <Row label="이벤트 종류" value={kind ? (EVENT_NAMES[kind] ?? kind) : "(없음 — 그냥 시작·끝)"} />
        {event.attachedTo ? <Row label="붙은 곳" value={event.attachedTo} /> : null}
      </dl>

      {kind === EVENT_KINDS.timer ? (
        <>
          <Labelled label="타이머">
            {(id) => (
              <select
                id={id}
                className={INPUT}
                value={fields.timerKind}
                onChange={(e) => onChange({ timerKind: e.target.value })}
                disabled={!canWrite}
              >
                <option value="timeDate">그 시각에</option>
                <option value="timeDuration">그만큼 뒤에</option>
                <option value="timeCycle">되풀이</option>
              </select>
            )}
          </Labelled>
          {/* 되풀이는 **cron도 받는다** (`contracts.schedule`) — 업무 예제가 그것으로 적혀 있다. */}
          <Labelled
            label="값"
            help={"그 시각: 2026-11-13T09:00:00+09:00\n그만큼 뒤: PT30M\n되풀이: 0 9 1 * * 또는 R/PT1H"}
          >
            {(id) => (
              <input
                id={id}
                className={`${INPUT} font-mono`}
                value={fields.timerValue}
                onChange={(e) => onChange({ timerValue: e.target.value })}
                disabled={!canWrite}
              />
            )}
          </Labelled>
        </>
      ) : null}

      {kind === EVENT_KINDS.message || event.message ? (
        <Labelled label="메시지 이름" help="Center 메시지 API가 이 이름으로 찾습니다 (C12).">
          {(id) => (
            <input
              id={id}
              className={INPUT}
              value={fields.message}
              onChange={(e) => onChange({ message: e.target.value })}
              disabled={!canWrite}
            />
          )}
        </Labelled>
      ) : null}

      {kind === EVENT_KINDS.signal ? (
        <Labelled label="신호 이름">
          {(id) => (
            <input
              id={id}
              className={INPUT}
              value={fields.signal}
              onChange={(e) => onChange({ signal: e.target.value })}
              disabled={!canWrite}
            />
          )}
        </Labelled>
      ) : null}

      {kind === EVENT_KINDS.error ? (
        <Labelled label="오류 코드" help="비우면 코드 없는 경계입니다 — 모든 업무 실패를 받습니다 (C14).">
          {(id) => (
            <input
              id={id}
              className={INPUT}
              value={fields.error}
              onChange={(e) => onChange({ error: e.target.value })}
              disabled={!canWrite}
            />
          )}
        </Labelled>
      ) : null}

      {event.attachedTo ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fields.cancelActivity}
            onChange={(e) => onChange({ cancelActivity: e.target.checked })}
            disabled={!canWrite}
          />
          <span title="cancelActivity">받으면 하던 일을 걷는다</span>
        </label>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

/**
 * 이름 + (원문 칸 이름) + 「?」 + 칸. 「?」 단추가 `<label>` 안에 들면 그 단추가 라벨의 짝이 되어
 * 버리므로 라벨은 `htmlFor`로 잇고 칸은 그 id를 받는다.
 */
function Labelled({
  label,
  code,
  help,
  children,
}: {
  label: string;
  /** 원문 칸 이름 — 이름의 **말풍선**이다 (화면에 쓰지 않는다). */
  code?: string;
  help?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-1.5">
        <label htmlFor={id} className="text-caption text-text-secondary" title={code}>
          {label}
        </label>
        {help ? (
          <InfoTip label={`${label.replace(/ \*$/, "")} 설명`} className="ml-auto">
            {help}
          </InfoTip>
        ) : null}
      </div>
      {children(id)}
    </div>
  );
}
