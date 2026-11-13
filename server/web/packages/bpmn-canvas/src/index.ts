/**
 * `@bpm/bpmn-canvas` — 콘솔 웹 편집기의 BPMN 캔버스 (CON-20, ADR-0143).
 *
 * bpmn-js를 **pnpm 의존으로 그대로 쓴다** — 웹에는 Node가 있어 배포본을 커밋하지 않는다
 * (ADR-0029는 ADR-0143이 대체했다).
 *
 * 색·크기는 `canvas.css`를 함께 들여야 쓴다 — `design/tokens.json`에서 온 토큰만 쓴다.
 */

export { CanvasEditor } from "./editor";
export type { EditorHandlers } from "./editor";
export { CanvasViewer } from "./viewer";
export { BpmnCanvas } from "./BpmnCanvas";
export type { BpmnCanvasHandle, BpmnCanvasProps } from "./BpmnCanvas";
export { layout, laidOut, needsLayout } from "./auto-layout";
export { propertiesOf, eventOf, gatewayOf, multiInstanceOf } from "./read";
export { BPM_MODDLE } from "./moddle";
export type {
  BusinessObject,
  CanvasStats,
  DelegateSpec,
  EventInfo,
  EventPatch,
  ExtensionElement,
  Flow,
  GatewayInfo,
  ImportResult,
  MultiInstance,
  NodeProperties,
  NodeState,
  PropertyPatch,
  Shape,
  TaskSpec,
  TimerKind,
} from "./types";
