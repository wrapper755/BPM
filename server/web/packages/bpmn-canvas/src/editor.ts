/**
 * BPMN 모델러 하나 — 콘솔 웹 편집기의 캔버스 속살 (CON-20, ADR-0143).
 *
 * Qt Studio의 캔버스 페이지(`studio/app/.../web/index.html`)를 옮겨 온 것이다. 바뀐 것은
 * **다리가 없어진 것**뿐이다 — QWebChannel로 요청 id를 맞추던 자리에 그냥 메서드가 있다.
 * 화면(React)은 `BpmnCanvas`가 씌우고, 이 파일은 **화면을 모른다**.
 *
 * 지키는 규칙 둘:
 * - **고치는 길은 bpmn-js의 `modeling`뿐이다.** XML을 직접 만지면 실행 취소와 「저장 안 한 변경」이
 *   함께 깨진다.
 * - **`bpm:*`는 노드를 만들 때 함께 단다.** 만든 뒤에 고치면 실행 취소가 두 걸음이 된다.
 */

import BpmnModeler from "bpmn-js/lib/Modeler";

import { laidOut } from "./auto-layout";
import { BPM_MODDLE } from "./moddle";
import { TIMER_KINDS, definitionOf, multiInstanceOf, propertiesOf } from "./read";
import { RENDERER, attributesOf, centerAtNormalZoom, freeSpot, markerNames, spotAt, toType } from "./shared";
import type {
  BusinessObject,
  CanvasStats,
  DelegateSpec,
  EventPatch,
  ExtensionElement,
  ExtensionElements,
  ImportResult,
  NamedRoot,
  NodeProperties,
  NodeState,
  PropertyPatch,
  Shape,
  TaskSpec,
} from "./types";

/** 캔버스가 바깥에 알리는 것 — 「저장 안 한 변경」과 고른 노드. */
export interface EditorHandlers {
  onChanged?: (dirty: boolean) => void;
  onPicked?: (id: string) => void;
}

export class CanvasEditor {
  private readonly modeler: BpmnModeler;
  private readonly container: HTMLElement;
  private changed = false;

  constructor(container: HTMLElement, handlers: EditorHandlers = {}) {
    this.container = container;
    this.modeler = new BpmnModeler({
      container,
      ...RENDERER,
      // `bpm:*`를 타입으로 다룬다 — 설명은 C14 모델에서 생성한다 (scripts/gen_moddle.py).
      moddleExtensions: { bpm: BPM_MODDLE },
    });
    this.modeler.on("commandStack.changed", () => {
      this.changed = true;
      handlers.onChanged?.(true);
    });
    this.modeler.on("selection.changed", (event) => {
      const picked = event.newSelection ?? [];
      handlers.onPicked?.(picked.length === 1 ? (picked[0]?.id ?? "") : "");
    });
    this.registerDelegate();
  }

  /** 「저장 안 한 변경」이 있는가. */
  get dirty(): boolean {
    return this.changed;
  }

  destroy(): void {
    this.modeler.destroy();
  }

  async importXML(xml: string): Promise<ImportResult> {
    const laid = await laidOut(xml);
    const found = await this.modeler.importXML(laid.xml);
    centerAtNormalZoom(this.modeler.get("canvas"));
    // 배치했으면 디스크와 다르다 — 「저장 안 한 변경」으로 둔다.
    this.changed = laid.laidOut;
    return {
      warnings: (found.warnings ?? []).map((one) => String(one.message ?? one)),
      laidOut: laid.laidOut,
    };
  }

  async saveXML(): Promise<string> {
    const { xml } = await this.modeler.saveXML({ format: true });
    this.changed = false;
    return xml ?? "";
  }

  async createEmpty(processId: string, name: string): Promise<void> {
    await this.modeler.createDiagram();
    const process = this.modeler.get("elementRegistry").find((one) => one.type === "bpmn:Process");
    if (process) {
      this.modeler.get("modeling").updateProperties(process, { id: processId, name });
    }
    this.changed = false;
  }

  /** 「BPM 프로세스 닫기」 — 그림을 내린다 (다음 `importXML`·`createEmpty`가 다시 채운다). */
  clear(): void {
    this.modeler.clear();
    this.changed = false;
  }

  undo(): void {
    this.modeler.get("commandStack").undo();
  }

  redo(): void {
    this.modeler.get("commandStack").redo();
  }

  select(id: string): boolean {
    const found = this.modeler.get("elementRegistry").get(id);
    if (found) this.modeler.get("selection").select(found);
    return Boolean(found);
  }

  stats(): CanvasStats {
    const box = this.modeler.get("canvas").viewbox();
    return {
      elements: this.modeler.get("elementRegistry").getAll().length,
      dirty: this.changed,
      scale: box.scale,
      view: { x: box.x, y: box.y, width: box.width, height: box.height },
      inner: { x: box.inner.x, y: box.inner.y, width: box.inner.width, height: box.inner.height },
    };
  }

  /** 노드에 상태 색을 입힌다 (실행 표시, STU-09). 적지 않은 노드의 색은 지운다. */
  mark(states: Record<string, NodeState>): void {
    const canvas = this.modeler.get("canvas");
    const registry = this.modeler.get("elementRegistry");
    for (const element of registry.getAll()) {
      for (const name of markerNames()) canvas.removeMarker(element.id, name);
    }
    for (const [id, state] of Object.entries(states)) {
      if (registry.get(id)) canvas.addMarker(id, `bpm-${state}`);
    }
  }

  /** 속성 패널이 읽는 것 (STU-04) — 없는 노드면 `null`. */
  properties(id: string): NodeProperties | null {
    const element = this.modeler.get("elementRegistry").get(id);
    return element ? propertiesOf(element.businessObject) : null;
  }

  /**
   * 속성 패널의 「적용」. **bpmn-js의 modeling으로 고친다** — 그래야 실행 취소와
   * 「저장 안 한 변경」이 함께 움직인다 (XML을 우리가 직접 만지면 둘 다 깨진다).
   */
  setProperties(id: string, patch: PropertyPatch): boolean {
    const element = this.modeler.get("elementRegistry").get(id);
    if (!element) return false;
    const modeling = this.modeler.get("modeling");
    const moddle = this.modeler.get("moddle");
    const bo = element.businessObject;

    // 표준 속성은 **한 번에** 바꾼다 — 실행 취소가 한 걸음이 되게.
    const plain: Record<string, unknown> = {};
    if ("name" in patch) plain.name = patch.name;
    if ("documentation" in patch) {
      const text = patch.documentation ?? "";
      plain.documentation = text ? [moddle.create("bpmn:Documentation", { text })] : [];
    }
    if ("condition" in patch) {
      const body = patch.condition ?? "";
      plain.conditionExpression = body ? moddle.create("bpmn:FormalExpression", { body }) : undefined;
    }
    if ("script" in patch) plain.script = patch.script ?? "";
    if ("calledElement" in patch) plain.calledElement = (patch.calledElement ?? "") || undefined;
    if ("multiInstance" in patch) {
      const mode = patch.multiInstance ?? "";
      const had = bo.loopCharacteristics;
      if (!mode) {
        plain.loopCharacteristics = undefined;
      } else if (had && had.$type === "bpmn:MultiInstanceLoopCharacteristics") {
        // 있던 표시는 갈아 끼우지 않는다 — 안쪽에 적힌 것이 있으면 남긴다.
        if (multiInstanceOf(bo) !== mode) {
          modeling.updateModdleProperties(element, had as BusinessObject, {
            isSequential: mode === "sequential",
          });
        }
      } else {
        plain.loopCharacteristics = moddle.create("bpmn:MultiInstanceLoopCharacteristics", {
          isSequential: mode === "sequential",
        });
      }
    }
    if ("default" in patch) {
      // 게이트웨이의 기본 흐름 — 흐름 id로 오고 그 흐름을 가리킨다 (빈 글이면 기본 없음).
      const flow = this.modeler.get("elementRegistry").get(patch.default ?? "");
      plain.default = flow ? flow.businessObject : undefined;
    }
    if (Object.keys(plain).length) modeling.updateProperties(element, plain);
    if (patch.event) this.setEvent(element, patch.event);
    if (patch.bpm) this.setExtensions(element, patch.bpm);
    return true;
  }

  /**
   * STU-03 「캔버스에 추가」 — 리소스 탐색기가 고른 것으로 노드 하나를 만든다.
   * 가운데를 함께 돌려준다 — 끌어다 놓은 자리에 **정말** 생겼는지 시험이 본다.
   */
  createTask(spec: TaskSpec): { id: string; x: number; y: number } {
    const type = spec.bpmn ?? "bpmn:ServiceTask";
    const canvas = this.modeler.get("canvas");
    const shape = this.modeler
      .get("elementFactory")
      .createShape({ type, businessObject: this.makeBusinessObject(spec) });
    const at = spec.at
      ? spotAt(canvas, this.container, spec.at)
      : freeSpot(canvas, this.modeler.get("elementRegistry"), shape);
    const made = this.modeler.get("modeling").createShape(shape, at, canvas.getRootElement());
    this.modeler.get("selection").select(made);
    return { id: made.id, x: made.x + made.width / 2, y: made.y + made.height / 2 };
  }

  /**
   * STU-06a — 빈 그림의 시작 이벤트 뒤에 노드들을 **이어 붙인다** (ADR-0071).
   * `autoPlace`가 자리와 흐름을 함께 만든다 — 우리가 XML을 짓지 않는다.
   */
  appendChain(specs: TaskSpec[]): string[] {
    const registry = this.modeler.get("elementRegistry");
    const autoPlace = this.modeler.get("autoPlace");
    const factory = this.modeler.get("elementFactory");
    let at = registry.find((one) => one.type === "bpmn:StartEvent");
    if (!at) throw new Error("시작 이벤트가 없다");
    const ids: string[] = [];
    for (const spec of specs) {
      const type = spec.bpmn ?? "bpmn:ServiceTask";
      at = autoPlace.append(at, factory.createShape({ type, businessObject: this.makeBusinessObject(spec) }));
      ids.push(at.id);
    }
    return ids;
  }

  /**
   * STU-06a — 노드 하나를 **위임 호출로 바꾼다** (ADR-0071). 흐름·경계 이벤트는 그대로다
   * (`bpmnReplace`). 명령 하나로 묶어 **실행 취소가 한 걸음**이다.
   */
  delegateNode(id: string, spec: DelegateSpec): string | null {
    const element = this.modeler.get("elementRegistry").get(id);
    if (!element) return null;
    const context: { element: Shape; spec: DelegateSpec; made?: Shape } = { element, spec };
    this.modeler.get("commandStack").execute("bpm.delegateNode", context);
    return context.made?.id ?? null;
  }

  /** 위임 호출로 바꾸기를 **명령 하나로** 등록한다 — 안쪽 명령들이 하나의 실행 취소로 묶인다. */
  private registerDelegate(): void {
    const modeler = this.modeler;
    const extensionsOf = (bo: BusinessObject, bpm: Record<string, string>): ExtensionElements | null =>
      this.extensionsOf(bo, bpm);
    this.modeler.get("commandStack").registerHandler(
      "bpm.delegateNode",
      class DelegateNode {
        preExecute(context: { element: Shape; spec: DelegateSpec; made?: Shape }): void {
          const spec = context.spec;
          const made = modeler
            .get("bpmnReplace")
            .replaceElement(context.element, { type: "bpmn:CallActivity" });
          const holder = extensionsOf(made.businessObject, spec.bpm ?? {});
          const patch: Record<string, unknown> = {
            name: spec.name ?? "",
            extensionElements: holder ?? undefined,
          };
          if (spec.calledElement) patch.calledElement = spec.calledElement;
          modeler.get("modeling").updateProperties(made, patch);
          context.made = made;
        }
      },
    );
  }

  /** 노드 하나의 businessObject — `bpm:*`를 **만들 때 함께** 단다. */
  private makeBusinessObject(spec: TaskSpec): BusinessObject {
    const factory = this.modeler.get("bpmnFactory");
    const type = spec.bpmn ?? "bpmn:ServiceTask";
    // `attrs`는 **그냥 BPMN 속성**이다 (`calledElement` 같은 것, ADR-0051) — `bpm:*`가 아니라
    // 요소 자신의 칸이라 만들 때 함께 넣는다. 글만 받는다.
    const attrs: Record<string, string> = {};
    for (const [name, value] of Object.entries(spec.attrs ?? {})) {
      if (value) attrs[name] = value;
    }
    const bo = factory.create(type, { name: spec.name ?? "", ...attrs });
    const holder = this.extensionsOf(bo, spec.bpm ?? {});
    if (holder) bo.extensionElements = holder;
    return bo;
  }

  /** `{요소 이름: JSON 글}` → `bpmn:ExtensionElements` (비면 `null`). */
  private extensionsOf(bo: BusinessObject, bpm: Record<string, string>): ExtensionElements | null {
    const entries = Object.entries(bpm);
    if (!entries.length) return null;
    const factory = this.modeler.get("bpmnFactory");
    const values = entries.map(
      ([name, text]) => factory.create(toType(name), attributesOf(name, text)) as ExtensionElement,
    );
    const holder = factory.create("bpmn:ExtensionElements", { values }) as ExtensionElements;
    for (const one of values) one.$parent = holder;
    holder.$parent = bo;
    return holder;
  }

  /** `setProperties`의 `bpm` — 값이 `null`이면 그 요소를 뗀다. */
  private setExtensions(element: Shape, bpm: Record<string, string | null>): void {
    const modeling = this.modeler.get("modeling");
    const moddle = this.modeler.get("moddle");
    const bo = element.businessObject;
    let holder = bo.extensionElements;
    if (!holder) {
      holder = moddle.create("bpmn:ExtensionElements", { values: [] }) as ExtensionElements;
      modeling.updateProperties(element, { extensionElements: holder });
    }
    for (const [name, text] of Object.entries(bpm)) {
      const type = toType(name);
      const values = holder.values ?? [];
      const found = values.find((one) => one.$type === type);
      if (text === null) {
        if (found) {
          modeling.updateModdleProperties(element, holder, {
            values: values.filter((one) => one !== found),
          });
        }
        continue;
      }
      // `bpm:task`는 속성과 본문으로 갈라 쓴다 (C14).
      const attrs = attributesOf(name, text);
      if (found) {
        modeling.updateModdleProperties(element, found, attrs);
      } else {
        modeling.updateModdleProperties(element, holder, {
          values: [...values, moddle.create(type, attrs)],
        });
      }
    }
  }

  /**
   * 그 이름의 정의 수준 요소(`bpmn:Message` 등) — **있으면 가리키고 없으면 만든다**. 다른 이벤트와
   * 함께 쓰던 요소의 이름을 바꾸면 그쪽까지 바뀌므로 이름을 고치지 않는다.
   */
  private rootNamed(
    element: Shape,
    type: string,
    prefix: string,
    key: "name" | "errorCode",
    value: string,
    extra: Record<string, string>,
  ): BusinessObject {
    const modeling = this.modeler.get("modeling");
    const moddle = this.modeler.get("moddle");
    const definitions = this.modeler.getDefinitions();
    const roots = definitions.rootElements ?? [];
    const found = roots.find((one) => one.$type === type && (one as NamedRoot)[key] === value);
    if (found) return found;
    const id = moddle.ids
      ? moddle.ids.nextPrefixed(prefix)
      : `${prefix}${Math.random().toString(36).slice(2, 9)}`;
    const made = moddle.create(type, { id, ...extra });
    made.$parent = definitions;
    modeling.updateModdleProperties(element, definitions, { rootElements: [...roots, made] });
    return made;
  }

  /** `setProperties`의 `event` — 바뀐 칸만 온다. */
  private setEvent(element: Shape, patch: EventPatch): void {
    const modeling = this.modeler.get("modeling");
    const moddle = this.modeler.get("moddle");
    const bo = element.businessObject;
    const found = definitionOf(bo);
    if ("cancelActivity" in patch && bo.$type === "bpmn:BoundaryEvent") {
      modeling.updateProperties(element, { cancelActivity: Boolean(patch.cancelActivity) });
    }
    if ("message" in patch) {
      const name = patch.message ?? "";
      const ref = name
        ? this.rootNamed(element, "bpmn:Message", "Message_", "name", name, { name })
        : undefined;
      if (bo.$type === "bpmn:ReceiveTask") modeling.updateProperties(element, { messageRef: ref });
      else if (found) modeling.updateModdleProperties(element, found, { messageRef: ref });
    }
    if (!found) return;
    if (patch.timer) {
      const kind = patch.timer.kind;
      const props: Record<string, unknown> = {};
      for (const one of TIMER_KINDS) props[one] = undefined;
      if ((TIMER_KINDS as string[]).includes(kind)) {
        props[kind] = moddle.create("bpmn:FormalExpression", { body: patch.timer.value });
      }
      modeling.updateModdleProperties(element, found, props);
    }
    if ("signal" in patch) {
      const name = patch.signal ?? "";
      const ref = name
        ? this.rootNamed(element, "bpmn:Signal", "Signal_", "name", name, { name })
        : undefined;
      modeling.updateModdleProperties(element, found, { signalRef: ref });
    }
    if ("error" in patch) {
      // 코드가 비면 **코드 없는 경계** — 모든 업무 실패를 받는다 (C14).
      const code = patch.error ?? "";
      const ref = code
        ? this.rootNamed(element, "bpmn:Error", "Error_", "errorCode", code, {
            name: code,
            errorCode: code,
          })
        : undefined;
      modeling.updateModdleProperties(element, found, { errorRef: ref });
    }
  }
}
