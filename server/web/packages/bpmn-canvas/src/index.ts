/// <reference path="./vendor.d.ts" />

/**
 * `@bpm/bpmn-canvas` — 콘솔 웹 편집기의 BPMN 캔버스 (CON-20, ADR-0143).
 *
 * 맨 위의 `reference`는 **지우면 쓰는 쪽이 깨진다** — bpmn-js의 모듈 선언이 `vendor.d.ts`에
 * 있는데, 그 파일은 우리 tsconfig의 `include`에만 들어 있어 콘솔이 이 패키지를 컴파일할 때는
 * 따라오지 않는다 (전역 선언은 import로 끌려오지 않는다).
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
export { propertiesOf, eventOf, gatewayOf, multiInstanceOf, EVENT_KINDS } from "./read";
// 케이스 편집기가 답 폼을 짓는 자리 — **캔버스가 떠 있지 않아도** 읽는다 (DOM이 없다).
export { readApprovals } from "./approvals";
export type { ApprovalAsk, ApprovalField } from "./approvals";
export { BPM_MODDLE } from "./moddle";
// C14 모델에서 **생성한** 폼 명세 — 상세 패널이 칸을 손으로 적지 않는다 (scripts/gen_moddle.py).
export { ELEMENT_FORMS } from "./element-forms";
export type { ElementField, ElementForm, FieldKind } from "./element-forms";
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
