/**
 * 읽기 전용 다이어그램 보기 ([ADR-0051](../../../../../docs/decisions/0051-shared-process-conveniences.md)).
 *
 * **모델러가 아니라 뷰어다** — 팔레트를 가린 편집기가 아니라 편집 기능이 **그 배포본에 아예 없다**.
 * 끌어 옮기기·라벨 고치기·삭제가 되는 화면에 「읽기 전용」이라 적는 것은 거짓이다.
 */

import BpmnNavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import { laidOut } from "./auto-layout";
import { BPM_MODDLE } from "./moddle";
import { RENDERER, markerNames } from "./shared";
import { propertiesOf } from "./read";
import type { ImportResult, NodeProperties, NodeState } from "./types";

export class CanvasViewer {
  private readonly viewer: BpmnNavigatedViewer;

  constructor(container: HTMLElement) {
    this.viewer = new BpmnNavigatedViewer({
      container,
      ...RENDERER,
      // `bpm:*`를 타입으로 읽는다 — 없으면 우리 요소가 「모르는 것」 경고로 쏟아진다.
      moddleExtensions: { bpm: BPM_MODDLE },
    });
  }

  destroy(): void {
    this.viewer.destroy();
  }

  async importXML(xml: string): Promise<ImportResult> {
    const laid = await laidOut(xml);
    const found = await this.viewer.importXML(laid.xml);
    this.viewer.get("canvas").zoom("fit-viewport");
    return {
      warnings: (found.warnings ?? []).map((one) => String(one.message ?? one)),
      laidOut: laid.laidOut,
    };
  }

  /** 고른 노드가 담은 것 — 보기만 하는 화면도 속을 읽는다 (고치지는 못한다). */
  properties(id: string): NodeProperties | null {
    const element = this.viewer.get("elementRegistry").get(id);
    return element ? propertiesOf(element.businessObject) : null;
  }

  /** 노드에 상태 색을 입힌다 (실행 표시, STU-09) — 모델러 쪽과 같은 표식이다. */
  mark(states: Record<string, NodeState>): void {
    const canvas = this.viewer.get("canvas");
    const registry = this.viewer.get("elementRegistry");
    for (const element of registry.getAll()) {
      for (const name of markerNames()) canvas.removeMarker(element.id, name);
    }
    for (const [id, state] of Object.entries(states)) {
      if (registry.get(id)) canvas.addMarker(id, `bpm-${state}`);
    }
  }

  /** 시험이 「정말 그 그림이 떴나」를 보는 자리 (모델러 쪽과 같은 이름이다). */
  stats(): { elements: number; dirty: boolean } {
    return { elements: this.viewer.get("elementRegistry").getAll().length, dirty: false };
  }
}
