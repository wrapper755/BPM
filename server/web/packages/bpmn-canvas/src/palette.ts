/**
 * 팔레트에 더하는 칸 — **Ad Hoc 하위 프로세스** 하나 (C14 §Ad Hoc, ADR-0190).
 *
 * bpmn-js의 팔레트는 하위 프로세스만 만든다(Ad Hoc은 렌치 메뉴로 바꿔야 나온다). 같은 「활동」 묶음에
 * 한 칸을 더한다 — diagram-js가 묶음 이름으로 모으므로 「하위 프로세스」 바로 뒤에 선다.
 *
 * 하위 프로세스와 달리 **안에 시작 이벤트를 넣지 않는다** — Ad Hoc 안에는 시작·끝 이벤트를 두지 않는다
 * (C14 B18). 말풍선은 한글이다 (화면에 영어를 쓰지 않는다).
 */

import type { Shape } from "./types";

interface Palette {
  registerProvider(provider: { getPaletteEntries(): Record<string, PaletteEntry> }): void;
}

interface PaletteEntry {
  group: string;
  className: string;
  title: string;
  action: { dragstart: (event: Event) => void; click: (event: Event) => void };
}

interface ElementFactory {
  createShape(attrs: { type: string; isExpanded?: boolean }): Shape;
}

interface Create {
  start(event: Event, shape: Shape): void;
}

/** 팔레트 칸의 id·말풍선 — 시험이 같은 값을 본다. */
export const AD_HOC_ENTRY = { id: "create.adhoc-subprocess-expanded", title: "Ad Hoc 하위 프로세스 만들기" } as const;

class AdHocPaletteProvider {
  static $inject = ["palette", "create", "elementFactory"];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly elementFactory: ElementFactory,
  ) {
    palette.registerProvider(this);
  }

  getPaletteEntries(): Record<string, PaletteEntry> {
    const start = (event: Event): void => {
      const shape = this.elementFactory.createShape({ type: "bpmn:AdHocSubProcess", isExpanded: true });
      this.create.start(event, shape);
    };
    return {
      [AD_HOC_ENTRY.id]: {
        group: "activity",
        className: "bpmn-icon-ad-hoc-subprocess",
        title: AD_HOC_ENTRY.title,
        action: { dragstart: start, click: start },
      },
    };
  }
}

/** diagram-js 모듈 — 모델러의 `additionalModules`에 넣는다. */
export const adHocPaletteModule = {
  __init__: ["bpmAdHocPalette"],
  bpmAdHocPalette: ["type", AdHocPaletteProvider],
};
