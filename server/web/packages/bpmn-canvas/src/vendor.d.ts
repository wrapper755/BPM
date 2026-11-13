/**
 * bpmn-js·bpmn-moddle·bpmn-auto-layout의 모듈 선언 — **타입 선언을 주지 않는 패키지들이다.**
 *
 * 전부 적지 않는다. 캔버스가 **정말 부르는 것만** 적어, 새 서비스를 쓰려면 여기 먼저 더하게 한다.
 * 모델 쪽 칸은 `types.ts`에 있다 (import 없이 `import("./types")`로 가리킨다 — 이 파일은 전역
 * 선언이라 top-level import를 두면 모듈이 되어 선언이 「있는 모듈 보태기」로 바뀐다).
 */

/** `modeler.get(이름)`이 주는 것 — 이름과 타입의 표. */
interface BpmnServices {
  bpmnFactory: {
    create(type: string, attrs?: Record<string, unknown>): import("./types").BusinessObject;
  };
  elementFactory: {
    createShape(attrs: {
      type: string;
      businessObject?: import("./types").BusinessObject;
    }): import("./types").Shape;
  };
  elementRegistry: {
    get(id: string): import("./types").Shape | undefined;
    getAll(): import("./types").Shape[];
    find(
      match: (element: import("./types").Shape) => boolean,
    ): import("./types").Shape | undefined;
  };
  canvas: {
    zoom(level?: number | string): number;
    viewbox(box?: { x: number; y: number; width: number; height: number }): {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
      inner: { x: number; y: number; width: number; height: number };
      outer: { width: number; height: number };
    };
    getRootElement(): import("./types").Shape;
    /** 담은 자리의 크기를 다시 잰다 — 숨겼다 다시 보인 캔버스가 이것을 불러야 한다. */
    resized(): void;
    addMarker(id: string, marker: string): void;
    removeMarker(id: string, marker: string): void;
  };
  modeling: {
    updateProperties(element: import("./types").Shape, properties: Record<string, unknown>): void;
    updateModdleProperties(
      element: import("./types").Shape,
      target: import("./types").BusinessObject,
      properties: Record<string, unknown>,
    ): void;
    createShape(
      shape: import("./types").Shape,
      position: { x: number; y: number },
      parent: import("./types").Shape,
    ): import("./types").Shape;
  };
  moddle: {
    create(type: string, attrs?: Record<string, unknown>): import("./types").BusinessObject;
    ids?: { nextPrefixed(prefix: string): string };
  };
  selection: { select(element: import("./types").Shape): void };
  commandStack: {
    undo(): void;
    redo(): void;
    execute(command: string, context: Record<string, unknown>): void;
    registerHandler(command: string, handler: new () => unknown): void;
  };
  bpmnReplace: {
    replaceElement(
      element: import("./types").Shape,
      target: { type: string },
    ): import("./types").Shape;
  };
  autoPlace: {
    append(
      source: import("./types").Shape,
      shape: import("./types").Shape,
    ): import("./types").Shape;
  };
}

/** 모델러·뷰어가 함께 주는 것. 뷰어에는 편집 서비스가 **아예 없다** (ADR-0051). */
declare class BpmnBase {
  constructor(options: Record<string, unknown>);
  get<K extends keyof BpmnServices>(name: K): BpmnServices[K];
  // 표에 없는 서비스는 쓰는 쪽이 제 타입을 적는다 — 이 선언은 **앱 전체에 걸리므로**(전역) 여기서
  // 막으면 bpmn-js를 제 손으로 쓰던 화면(CON-01의 다이어그램)이 깨진다.
  get<T>(name: string): T;
  on(
    event: string,
    handler: (payload: { newSelection?: import("./types").Shape[] }) => void,
  ): void;
  importXML(xml: string): Promise<{ warnings?: { message?: string }[] }>;
  clear(): void;
  destroy(): void;
  getDefinitions(): import("./types").BusinessObject;
}

declare module "bpmn-js/lib/Modeler" {
  export default class BpmnModeler extends BpmnBase {
    saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>;
    createDiagram(): Promise<unknown>;
  }
}

declare module "bpmn-js/lib/NavigatedViewer" {
  export default class BpmnNavigatedViewer extends BpmnBase {}
}

declare module "bpmn-moddle" {
  // **이름 있는 내보내기**다 (`export { SimpleBpmnModdle as BpmnModdle }`) — default가 아니다.
  export class BpmnModdle {
    fromXML(xml: string): Promise<{ rootElement: import("./types").BusinessObject }>;
    toXML(element: import("./types").BusinessObject): Promise<{ xml: string }>;
  }
}

declare module "bpmn-auto-layout" {
  export function layoutProcess(xml: string): Promise<string>;
}
