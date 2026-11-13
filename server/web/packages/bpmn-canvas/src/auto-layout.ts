/**
 * 그림 좌표(DI)가 없는 정의를 배치한다 ([ADR-0088](../../../../../docs/decisions/0088-auto-layout-for-definitions-without-di.md)).
 *
 * 웹 편집기는 이 모듈을 **그대로 import한다**. Qt Studio 쪽은 `copy.mjs`가 esbuild로 묶어
 * `vendor/bpmn-auto-layout.min.js`(전역 `ChkAutoLayout`)로 복사한다 — 걷힐 길이다 (M11 조각 5).
 */

import { BpmnModdle } from "bpmn-moddle";
import { layoutProcess } from "bpmn-auto-layout";

import type { BusinessObject, Flow } from "./types";

/** 그림 안에 담긴 요소들 — 하위 BPM 프로세스도 같은 꼴이라 되돌아 걷는다. */
interface Container extends BusinessObject {
  flowElements?: (BusinessObject & Partial<Flow> & { flowElements?: BusinessObject[] })[];
}

/**
 * 흐름의 `sourceRef`·`targetRef`로 노드의 `incoming`·`outgoing`을 채운다.
 * BPMN은 그 둘 없이도 올바르지만 배치기는 그것을 따라 걸어서, 없으면 선이 하나도 안 그어진다.
 */
function linkFlows(container: Container): void {
  for (const element of container.flowElements ?? []) {
    if (element.$type === "bpmn:SequenceFlow") {
      const flow = element as Flow;
      const source = flow.sourceRef;
      const target = flow.targetRef;
      if (source) {
        source.outgoing = source.outgoing ?? [];
        if (!source.outgoing.includes(flow)) source.outgoing.push(flow);
      }
      if (target) {
        target.incoming = target.incoming ?? [];
        if (!target.incoming.includes(flow)) target.incoming.push(flow);
      }
    }
    if ("flowElements" in element) linkFlows(element as Container);
  }
}

/** 다이어그램이 하나도 없는가 — **있으면 배치하지 않는다** (사람이 놓은 자리를 덮지 않는다). */
export async function needsLayout(xml: string): Promise<boolean> {
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const diagrams = (rootElement as { diagrams?: unknown[] }).diagrams;
  return !(diagrams && diagrams.length);
}

/** DI를 지어 붙인 XML. 의미 모델은 `incoming`·`outgoing` 말고 건드리지 않는다. */
export async function layout(xml: string): Promise<string> {
  const moddle = new BpmnModdle();
  const { rootElement } = await moddle.fromXML(xml);
  for (const root of rootElement.rootElements ?? []) {
    if (root.$type === "bpmn:Process") linkFlows(root as Container);
  }
  const { xml: linked } = await moddle.toXML(rootElement);
  return layoutProcess(linked);
}

/**
 * 그림 좌표가 없으면 배치한 XML을 준다. **있으면 그대로** — 사람이 놓은 자리를 덮지 않는다.
 * 읽지 못하는 XML은 그대로 넘겨 bpmn-js가 제 말로 거부하게 한다.
 */
export async function laidOut(xml: string): Promise<{ xml: string; laidOut: boolean }> {
  try {
    if (await needsLayout(xml)) return { xml: await layout(xml), laidOut: true };
  } catch {
    // 뒤따르는 importXML이 같은 까닭으로 실패하며 말한다.
  }
  return { xml, laidOut: false };
}
