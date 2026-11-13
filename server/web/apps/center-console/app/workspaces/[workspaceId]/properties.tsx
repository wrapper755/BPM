"use client";

import { useEffect, useState } from "react";
import { Button } from "@bpm/ui";
import { ELEMENT_FORMS } from "@bpm/bpmn-canvas";
import type { ElementField, NodeProperties, PropertyPatch } from "@bpm/bpmn-canvas";
import { parseBody, strayKeys, toInput, withField, writeBody, type Body } from "@/lib/element-values";

/**
 * CON-20b 상세 패널 — 고른 요소 하나를 고친다 (STU-04가 하던 일).
 *
 * **`bpm:*` 폼은 C14 모델에서 생성한 명세로 짓는다** (`ELEMENT_FORMS`) — 칸을 손으로 적지 않으므로
 * 모델에 칸이 늘면 폼에 저절로 생긴다. 폼이 그리지 못하는 모양(안쪽 모델·섞인 목록)은 JSON 칸
 * 하나이고, **모델에 없는데 파일에 있는 칸은 그대로 들고 간다** (C14 호환 규칙).
 *
 * 고친 것은 「적용」을 눌러야 그림에 들어간다 (U11) — 한 번이 **실행 취소 한 걸음**이다.
 */

/** 그 종류의 노드에만 있는 표준 칸. 없는 칸을 보내면 엉뚱한 속성이 생긴다. */
const isActivity = (type: string) => /Task$/.test(type) || type === "CallActivity" || type === "SubProcess";

const INPUT = "w-full border border-border-strong bg-bg-surface px-2 py-1 text-body-sm";

export function Properties({
  node,
  canWrite,
  flows,
  onApply,
}: {
  node: NodeProperties;
  canWrite: boolean;
  /** 게이트웨이의 기본 흐름으로 고를 거리 (그 노드에서 나가는 흐름). */
  flows: { id: string; label: string }[];
  onApply: (patch: PropertyPatch) => void;
}) {
  const [name, setName] = useState(node.name);
  const [documentation, setDocumentation] = useState(node.documentation);
  const [condition, setCondition] = useState(node.condition);
  const [script, setScript] = useState(node.script);
  const [calledElement, setCalledElement] = useState(node.calledElement);
  const [multiInstance, setMultiInstance] = useState(node.multiInstance);
  const [fallback, setFallback] = useState(node.gateway?.default ?? "");
  const [bpm, setBpm] = useState<Record<string, Body>>(() =>
    Object.fromEntries(Object.entries(node.bpm).map(([key, body]) => [key, parseBody(body)])),
  );
  const [dropped, setDropped] = useState<string[]>([]);
  const [adding, setAdding] = useState("");

  // 다른 요소를 고르면 **그 요소의 값으로 갈아 끼운다** — 앞 요소의 편집이 따라오지 않게.
  useEffect(() => {
    setName(node.name);
    setDocumentation(node.documentation);
    setCondition(node.condition);
    setScript(node.script);
    setCalledElement(node.calledElement);
    setMultiInstance(node.multiInstance);
    setFallback(node.gateway?.default ?? "");
    setBpm(Object.fromEntries(Object.entries(node.bpm).map(([key, body]) => [key, parseBody(body)])));
    setDropped([]);
    setAdding("");
  }, [node]);

  const apply = () => {
    const patch: PropertyPatch = { name, documentation };
    if (node.type === "SequenceFlow") patch.condition = condition;
    if (node.type === "ScriptTask") patch.script = script;
    if (node.type === "CallActivity") patch.calledElement = calledElement;
    if (isActivity(node.type)) patch.multiInstance = multiInstance;
    if (node.gateway) patch.default = fallback;
    const bodies: Record<string, string | null> = {};
    for (const [key, body] of Object.entries(bpm)) bodies[key] = writeBody(body);
    for (const key of dropped) bodies[key] = null;
    if (Object.keys(bodies).length) patch.bpm = bodies;
    onApply(patch);
  };

  const spare = Object.keys(ELEMENT_FORMS)
    .filter((one) => !(one in bpm))
    .sort();

  return (
    <div className="flex flex-col gap-3 text-body-sm">
      <div>
        <p className="text-caption text-text-muted">{node.type}</p>
        <p className="font-mono text-caption break-all text-text-muted" title="요소 id">
          {node.id}
        </p>
      </div>

      <Labelled label="이름">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
      </Labelled>
      <Labelled label="설명">
        <textarea
          className={INPUT}
          rows={2}
          value={documentation}
          onChange={(e) => setDocumentation(e.target.value)}
          disabled={!canWrite}
        />
      </Labelled>

      {node.type === "SequenceFlow" ? (
        <Labelled label="조건식" help="`${…}` 꼴의 bpm-expr입니다.">
          <input
            className={INPUT}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            disabled={!canWrite}
          />
        </Labelled>
      ) : null}

      {node.type === "ScriptTask" ? (
        <Labelled label="스크립트">
          <textarea
            className={`${INPUT} font-mono`}
            rows={4}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={!canWrite}
          />
        </Labelled>
      ) : null}

      {node.type === "CallActivity" ? (
        <Labelled label="부르는 것" help="공유 BPM 프로세스의 정의 id입니다.">
          <input
            className={INPUT}
            value={calledElement}
            onChange={(e) => setCalledElement(e.target.value)}
            disabled={!canWrite}
          />
        </Labelled>
      ) : null}

      {isActivity(node.type) ? (
        <Labelled label="반복">
          <select
            className={INPUT}
            value={multiInstance}
            onChange={(e) => setMultiInstance(e.target.value as NodeProperties["multiInstance"])}
            disabled={!canWrite}
          >
            <option value="">없음</option>
            <option value="sequential">하나씩 (sequential)</option>
            <option value="parallel">한꺼번에 (parallel)</option>
          </select>
        </Labelled>
      ) : null}

      {node.gateway ? (
        <Labelled label="기본 흐름" help="어느 조건도 맞지 않을 때 가는 길입니다.">
          <select className={INPUT} value={fallback} onChange={(e) => setFallback(e.target.value)} disabled={!canWrite}>
            <option value="">없음</option>
            {flows.map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
        </Labelled>
      ) : null}

      {node.event ? <EventView event={node.event} /> : null}

      {Object.entries(bpm).map(([key, body]) => (
        <ElementBlock
          key={key}
          name={key}
          body={body}
          canWrite={canWrite}
          onChange={(made) => setBpm({ ...bpm, [key]: made })}
          onDrop={() => {
            const rest = { ...bpm };
            delete rest[key];
            setBpm(rest);
            setDropped([...dropped, key]);
          }}
        />
      ))}

      {canWrite && spare.length ? (
        <div className="flex gap-2">
          <select className={INPUT} value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">설정 더하기…</option>
            {spare.map((one) => (
              <option key={one} value={one}>
                {ELEMENT_FORMS[one]?.label ?? one} (bpm:{one})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!adding}
            onClick={() => {
              setBpm({ ...bpm, [adding]: {} });
              setDropped(dropped.filter((one) => one !== adding));
              setAdding("");
            }}
          >
            더하기
          </Button>
        </div>
      ) : null}

      {canWrite ? (
        <Button variant="primary" size="sm" onClick={apply}>
          적용
        </Button>
      ) : (
        <p className="text-caption text-text-muted">보기 전용 계정이라 고칠 수 없습니다.</p>
      )}
    </div>
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
  return (
    <section className="border-t border-border-default pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {form?.label ?? name} <span className="text-caption text-text-muted">bpm:{name}</span>
        </h3>
        {canWrite ? (
          <Button size="sm" variant="ghost" onClick={onDrop}>
            빼기
          </Button>
        ) : null}
      </div>
      {form ? (
        <div className="flex flex-col gap-2">
          {form.fields.map((field) => (
            <FieldView
              key={field.name}
              field={field}
              body={body}
              canWrite={canWrite}
              onChange={(text) => onChange(withField(body, field, text))}
            />
          ))}
        </div>
      ) : (
        // 모델에 없는 요소 — 그래도 **고칠 수 있게** 한다 (확장이 더한 것일 수 있다).
        <textarea
          className={`${INPUT} font-mono`}
          rows={6}
          value={writeBody(body)}
          onChange={(e) => onChange(parseBody(e.target.value))}
          disabled={!canWrite}
        />
      )}
      {stray.length ? (
        <p className="mt-2 text-caption text-text-muted">
          폼이 모르는 칸도 그대로 둡니다: {stray.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

function FieldView({
  field,
  body,
  canWrite,
  onChange,
}: {
  field: ElementField;
  body: Body;
  canWrite: boolean;
  onChange: (text: string) => void;
}) {
  const value = toInput(field, body[field.name]);
  const label = `${field.name}${field.required ? " *" : ""}`;
  if (field.kind === "bool") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          disabled={!canWrite}
        />
        {label}
      </label>
    );
  }
  if (field.kind === "choice") {
    return (
      <Labelled label={label} help={field.help}>
        <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} disabled={!canWrite}>
          <option value="">(없음)</option>
          {(field.choices ?? []).map((one) => (
            <option key={one} value={one}>
              {one}
            </option>
          ))}
        </select>
      </Labelled>
    );
  }
  const rows = field.kind === "json" ? 4 : field.kind === "list-text" || field.kind === "map-text" ? 3 : 0;
  const help =
    field.help ??
    (field.kind === "list-text"
      ? "한 줄에 하나씩."
      : field.kind === "map-text"
        ? "한 줄에 `이름=값`."
        : field.kind === "json"
          ? "JSON으로 적습니다 (폼이 그리지 못하는 모양입니다)."
          : undefined);
  return (
    <Labelled label={label} help={help}>
      {rows ? (
        <textarea
          className={`${INPUT} font-mono`}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canWrite}
        />
      ) : (
        <input
          className={INPUT}
          type={field.kind === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canWrite}
        />
      )}
    </Labelled>
  );
}

/** 이벤트 칸은 **보기만** 한다 — 정의 수준 요소를 만드는 일이라 조각 4f에서 폼이 온다. */
function EventView({ event }: { event: NonNullable<NodeProperties["event"]> }) {
  return (
    <section className="border-t border-border-default pt-3">
      <h3 className="mb-2 font-semibold">이벤트</h3>
      <dl className="flex flex-col gap-1">
        {event.definition ? <Row label="종류" value={event.definition} /> : null}
        {event.timer ? <Row label="타이머" value={`${event.timer.kind} · ${event.timer.value}`} /> : null}
        {event.message ? <Row label="메시지" value={event.message} /> : null}
        {event.signal ? <Row label="신호" value={event.signal} /> : null}
        {event.error ? <Row label="오류 코드" value={event.error} /> : null}
        {event.attachedTo ? <Row label="붙은 곳" value={event.attachedTo} /> : null}
      </dl>
      <p className="mt-2 text-caption text-text-muted">이벤트 칸을 고치는 폼은 아직입니다 (M11 조각 4f).</p>
    </section>
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

function Labelled({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-text-muted">{label}</span>
      {children}
      {help ? <span className="text-caption text-text-muted">{help}</span> : null}
    </label>
  );
}
