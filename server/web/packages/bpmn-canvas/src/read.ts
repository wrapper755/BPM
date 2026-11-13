/**
 * 노드 하나를 **읽는** 쪽 (STU-04가 보는 것) — 모델러가 없어도 된다.
 *
 * 고치는 쪽(`editor.ts`)과 갈라 둔다. 읽기는 businessObject만 보므로 뷰어에서도, 시험에서도
 * 그대로 쓸 수 있다.
 */

import { toName } from "./shared";
import type {
  BusinessObject,
  EventDefinition,
  EventInfo,
  GatewayInfo,
  MultiInstance,
  NodeProperties,
  TimerKind,
} from "./types";

export const TIMER_KINDS: TimerKind[] = ["timeDate", "timeDuration", "timeCycle"];

/**
 * `EventInfo.definition`에 담기는 값 — **짧은 이름**이다 (`bpmn:TimerEventDefinition` → `Timer`).
 *
 * 쓰는 쪽이 글자를 적지 않게 여기 둔다 — 속성 패널이 `"bpmn:TimerEventDefinition"`과 견주다가
 * 타이머 칸을 하나도 그리지 못했다. 짧게 만드는 자리(`eventOf`)와 **같은 파일**이다.
 */
export const EVENT_KINDS = {
  timer: "Timer",
  message: "Message",
  signal: "Signal",
  error: "Error",
} as const;

/** 반복 표시 — 엔진(`is_sequential`)과 같은 읽기. */
export const multiInstanceOf = (bo: BusinessObject): MultiInstance => {
  const found = bo.loopCharacteristics;
  if (!found || found.$type !== "bpmn:MultiInstanceLoopCharacteristics") return "";
  return found.isSequential ? "sequential" : "parallel";
};

/** 노드를 사람이 읽는 말로 — 이름, 없으면 id. */
const labelOf = (bo: BusinessObject | undefined): string => bo?.name ?? bo?.id ?? "";

/** 첫 이벤트 정의 — 엔진처럼 하나만 본다. */
export const definitionOf = (bo: BusinessObject): EventDefinition | undefined =>
  (bo.eventDefinitions ?? [])[0];

/**
 * 게이트웨이가 보는 것 (STU-04 「게이트웨이」) — 기본 흐름과 들어오고 나가는 흐름.
 * 조건식은 **읽기만** 한다 — 고치는 자리는 그 흐름의 「폼」 탭 하나다.
 */
export const gatewayOf = (bo: BusinessObject): GatewayInfo | null => {
  if (!/Gateway$/.test(bo.$type)) return null;
  return {
    default: bo.default?.id ?? "",
    incoming: (bo.incoming ?? []).map((flow) => ({ id: flow.id, from: labelOf(flow.sourceRef) })),
    outgoing: (bo.outgoing ?? []).map((flow) => ({
      id: flow.id,
      name: flow.name ?? "",
      to: labelOf(flow.targetRef),
      condition: flow.conditionExpression?.body ?? "",
    })),
  };
};

/**
 * 이벤트·받기 태스크가 보는 것 (STU-04 「이벤트」·「받기」). 이름은 **정의 수준 요소의 이름**이다
 * (`bpmn:message name` 등 — 엔진·매니페스트가 그것을 쓴다, C12).
 */
export const eventOf = (bo: BusinessObject): EventInfo | null => {
  const type = bo.$type;
  if (!/Event$/.test(type) && type !== "bpmn:ReceiveTask") return null;
  const found = definitionOf(bo);
  const out: EventInfo = {
    definition: found ? found.$type.replace("bpmn:", "").replace("EventDefinition", "") : "",
    attachedTo: bo.attachedToRef ? labelOf(bo.attachedToRef) : "",
    cancelActivity: bo.cancelActivity !== false,
    timer: null,
    message: "",
    signal: "",
    error: "",
  };
  if (type === "bpmn:ReceiveTask") {
    out.definition = "Message";
    out.message = bo.messageRef?.name ?? "";
    return out;
  }
  if (!found) return out;
  if (found.$type === "bpmn:TimerEventDefinition") {
    const kind = TIMER_KINDS.find((one) => found[one]) ?? "";
    out.timer = { kind, value: kind ? (found[kind]?.body ?? "") : "" };
  }
  if (found.messageRef) out.message = found.messageRef.name ?? "";
  if (found.signalRef) out.signal = found.signalRef.name ?? "";
  if (found.errorRef) out.error = found.errorRef.errorCode ?? "";
  return out;
};

/** 속성 패널이 읽는 것 한 벌 — `bpm`은 `{요소 이름: JSON 글}`이다. */
export const propertiesOf = (bo: BusinessObject): NodeProperties => {
  const bpm: Record<string, string> = {};
  for (const one of bo.extensionElements?.values ?? []) {
    if (!one.$type.startsWith("bpm:")) continue;
    const name = toName(one.$type);
    if (name === "task") {
      // `bpm:task`만 `type`·`extension`이 XML 속성이다 (C14) — 본문과 함께 싣는다.
      let data: unknown = {};
      try {
        data = JSON.parse(one.value ?? "{}");
      } catch {
        data = one.value ?? {};
      }
      bpm[name] = JSON.stringify({ type: one.type ?? "", extension: one.extension ?? "", data }, null, 2);
    } else {
      bpm[name] = one.value ?? "";
    }
  }
  return {
    id: bo.id,
    type: bo.$type.replace("bpmn:", ""),
    name: bo.name ?? "",
    documentation: (bo.documentation ?? []).map((one) => one.text ?? "").join("\n"),
    condition: bo.conditionExpression?.body ?? "",
    script: bo.script ?? "",
    calledElement: bo.calledElement ?? "",
    multiInstance: multiInstanceOf(bo),
    gateway: gatewayOf(bo),
    event: eventOf(bo),
    bpm,
  };
};
