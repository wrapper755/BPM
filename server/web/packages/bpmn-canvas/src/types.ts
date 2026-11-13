/**
 * 캔버스가 만지는 BPMN 모델의 칸 — **C14가 쓰는 것만** 적는다.
 *
 * bpmn-js에는 타입 선언이 없어(`vendor.d.ts`가 모듈만 알린다) 모델 쪽은 우리가 적는다.
 * 전부 적지 않는다 — 여기 있는 칸이 곧 **캔버스가 읽고 쓰는 칸의 목록**이고, 새 칸을 만지려면
 * 여기 먼저 더해야 하므로 C14와 어긋나는 것이 타입 검사에서 드러난다.
 */

/** 식 하나 (`bpmn:FormalExpression`) — 본문만 본다. */
export interface Expression {
  body?: string;
}

/** 정의 수준 요소(`bpmn:Message`·`bpmn:Signal`·`bpmn:Error`)가 이름을 담는 꼴. */
export interface NamedRoot extends BusinessObject {
  name?: string;
  errorCode?: string;
}

/** 이벤트 정의 하나 — 엔진처럼 **첫 번째만** 본다. */
export interface EventDefinition extends BusinessObject {
  timeDate?: Expression;
  timeDuration?: Expression;
  timeCycle?: Expression;
  messageRef?: NamedRoot;
  signalRef?: NamedRoot;
  errorRef?: NamedRoot;
}

/** `bpm:*` 확장 요소 하나 — 본문 JSON 글 하나이고, `bpm:task`만 속성 둘을 더 쓴다 (C14). */
export interface ExtensionElement extends BusinessObject {
  value?: string;
  type?: string;
  extension?: string;
}

/** 흐름 하나 (`bpmn:SequenceFlow`). */
export interface Flow extends BusinessObject {
  sourceRef?: BusinessObject;
  targetRef?: BusinessObject;
  conditionExpression?: Expression;
}

/** 요소 하나의 의미 모델 (businessObject). */
export interface BusinessObject {
  $type: string;
  $parent?: BusinessObject;
  id: string;
  name?: string;
  documentation?: { text?: string }[];
  conditionExpression?: Expression;
  script?: string;
  /** 호출(`bpmn:CallActivity`)이 부르는 것. */
  calledElement?: string;
  loopCharacteristics?: { $type: string; isSequential?: boolean };
  /** 게이트웨이의 기본 흐름. */
  default?: Flow;
  incoming?: Flow[];
  outgoing?: Flow[];
  extensionElements?: ExtensionElements;
  eventDefinitions?: EventDefinition[];
  /** 경계 이벤트가 붙은 것. */
  attachedToRef?: BusinessObject;
  cancelActivity?: boolean;
  /** 받기 태스크의 메시지. */
  messageRef?: NamedRoot;
  /** `bpmn:Definitions`의 정의 수준 요소들. */
  rootElements?: BusinessObject[];
}

export interface ExtensionElements extends BusinessObject {
  values?: ExtensionElement[];
}

/** 그림 위의 도형 하나 — 자리와 크기, 그리고 그 의미 모델. */
export interface Shape {
  id: string;
  type: string;
  businessObject: BusinessObject;
  parent?: Shape;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 게이트웨이가 보는 것 (STU-04 「게이트웨이」) — 조건식은 **읽기만** 한다. */
export interface GatewayInfo {
  default: string;
  incoming: { id: string; from: string }[];
  outgoing: { id: string; name: string; to: string; condition: string }[];
}

/** 타이머의 종류 — 엔진이 보는 셋뿐이다. */
export type TimerKind = "timeDate" | "timeDuration" | "timeCycle";

/** 이벤트·받기 태스크가 보는 것 (STU-04 「이벤트」·「받기」). */
export interface EventInfo {
  definition: string;
  attachedTo: string;
  cancelActivity: boolean;
  timer: { kind: string; value: string } | null;
  message: string;
  signal: string;
  error: string;
}

/** 속성 패널이 읽는 것 (STU-04). `bpm`은 `{요소 이름: JSON 글}`이다. */
export interface NodeProperties {
  id: string;
  type: string;
  name: string;
  documentation: string;
  condition: string;
  script: string;
  calledElement: string;
  multiInstance: MultiInstance;
  gateway: GatewayInfo | null;
  event: EventInfo | null;
  bpm: Record<string, string>;
}

/** 반복 표시 — `""`(없음·표준 loop) | `sequential` | `parallel`. 엔진(`is_sequential`)과 같은 읽기. */
export type MultiInstance = "" | "sequential" | "parallel";

/** 속성 패널의 「적용」 — **바뀐 칸만** 담는다. `bpm`의 `null`은 그 요소를 뗀다. */
export interface PropertyPatch {
  name?: string;
  documentation?: string;
  condition?: string;
  script?: string;
  calledElement?: string;
  multiInstance?: MultiInstance;
  default?: string;
  event?: EventPatch;
  bpm?: Record<string, string | null>;
}

export interface EventPatch {
  cancelActivity?: boolean;
  message?: string;
  signal?: string;
  error?: string;
  timer?: { kind: string; value: string };
}

/** 노드 하나를 만들라는 말 — 리소스 탐색기·시작 도우미가 쓴다 (STU-03·STU-06a). */
export interface TaskSpec {
  /** BPMN 타입. 없으면 `bpmn:ServiceTask`. */
  bpmn?: string;
  name?: string;
  /** 요소 자신의 BPMN 속성 (`calledElement` 같은 것) — 글만 받는다. */
  attrs?: Record<string, string>;
  /** `bpm:*` 확장 — `{요소 이름: JSON 글}`. */
  bpm?: Record<string, string>;
  /** 끌어다 놓은 **화면 자리**(캔버스의 CSS 픽셀). 없으면 보이는 자리의 빈 곳. */
  at?: { x: number; y: number };
}

/** 위임 호출로 바꾸라는 말 (STU-06a, ADR-0071). */
export interface DelegateSpec {
  name?: string;
  calledElement?: string;
  bpm?: Record<string, string>;
}

/** 그림을 들인 결과. */
export interface ImportResult {
  warnings: string[];
  /** 그림 좌표(DI)가 없어 **우리가 배치했다** — 디스크와 다르므로 「저장 안 한 변경」이다. */
  laidOut: boolean;
}

/** 시험이 「정말 그 그림이 떴나」를 보는 자리. */
export interface CanvasStats {
  elements: number;
  dirty: boolean;
  scale: number;
  view: { x: number; y: number; width: number; height: number };
  inner: { x: number; y: number; width: number; height: number };
}

/** 실행 표시의 상태 (STU-09) — 노드에 색을 입힌다. */
export type NodeState = "running" | "done" | "failed" | "waiting";
