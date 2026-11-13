/** 모델러와 뷰어가 함께 쓰는 것 — 그리는 색, 보이는 자리, `bpm:*` 이름 바꾸기. */

import type { NodeState, Shape } from "./types";

/**
 * 그림의 선·채움·글자를 **토큰 변수로** 그린다 (ADR-0101) — 테마를 바꿔도 다시 그리지 않는다.
 * 값을 코드에 적지 않는다 (CLAUDE.md §5): 이름은 `design/tokens.json`에서 온 `tokens.css`의 것이다.
 */
export const RENDERER = {
  bpmnRenderer: {
    defaultFillColor: "var(--bg-surface, white)",
    defaultStrokeColor: "var(--text-primary, black)",
    defaultLabelColor: "var(--text-primary, black)",
  },
} as const;

/** 실행 표시가 쓰는 표식들 (STU-09) — 색은 `canvas.css`에 있다. */
export const markerNames = (): string[] =>
  (["running", "done", "failed", "waiting"] satisfies NodeState[]).map((one) => `bpm-${one}`);

/** 왼쪽 팔레트가 가리는 너비 (그림을 그 옆에서 시작한다). */
const PALETTE_GAP = 120;

type CanvasApi = BpmnServices["canvas"];

/**
 * 열 때의 자리 — **보통 크기(100%)**, 그림이 화면 가운데에 온다. 그림이 화면보다 넓으면 가로는
 * 시작 쪽(왼쪽, 팔레트 옆)을 맞춘다 — 가운데를 맞추면 시작 이벤트가 밖에 있다.
 *
 * **담은 자리가 없으면 아무것도 하지 않고 거짓을 준다** — 숨겨 둔 패널(0×0)이나 아주 좁은 창에서
 * 자리를 맞추면 bpmn-js가 0으로 나누어 `SVGMatrix`에서 죽고, 화면은 「다이어그램을 읽지
 * 못했습니다」라고 거짓말을 한다. 부르는 쪽은 자리가 생겼을 때 다시 부른다 (`resized()`).
 */
export const centerAtNormalZoom = (canvas: CanvasApi): boolean => {
  const before = canvas.viewbox();
  if (before.outer.width <= 0 || before.outer.height <= 0) return false;
  canvas.zoom(1);
  const { inner, outer } = canvas.viewbox();
  const fits = inner.width + 2 * PALETTE_GAP <= outer.width;
  canvas.viewbox({
    x: fits ? inner.x + inner.width / 2 - outer.width / 2 : inner.x - PALETTE_GAP,
    y: inner.y + inner.height / 2 - outer.height / 2,
    width: outer.width,
    height: outer.height,
  });
  return true;
};

/**
 * 새 노드를 놓을 자리 — 보이는 자리의 가운데에서 시작해 **겹치지 않을 때까지** 비낀다.
 * 여러 개를 잇달아 더해도 한 점에 쌓이지 않는다.
 */
export const freeSpot = (
  canvas: CanvasApi,
  registry: BpmnServices["elementRegistry"],
  shape: Shape,
): { x: number; y: number } => {
  const box = canvas.viewbox();
  let x = Math.round(box.x + box.width / 2);
  let y = Math.round(box.y + box.height / 2);
  const taken = (px: number, py: number): boolean =>
    registry.getAll().some(
      (one) =>
        one.parent &&
        one.width &&
        one.height &&
        one.x < px + shape.width / 2 &&
        px - shape.width / 2 < one.x + one.width &&
        one.y < py + shape.height / 2 &&
        py - shape.height / 2 < one.y + one.height,
    );
  for (let step = 0; step < 40 && taken(x, y); step += 1) {
    x += 40;
    y += 40;
  }
  return { x, y };
};

/**
 * 끌어다 놓은 **화면 자리**(캔버스의 CSS 픽셀)를 다이어그램 좌표로 바꾼다 (ADR-0044).
 * 축척·스크롤을 아는 쪽이 하나여야 하므로 **여기서** 바꾼다. 놓은 점이 노드의 **가운데**가 된다 —
 * 사람이 그렇게 기대한다.
 */
export const spotAt = (
  canvas: CanvasApi,
  container: HTMLElement,
  at: { x: number; y: number },
): { x: number; y: number } => {
  const box = canvas.viewbox();
  const rect = container.getBoundingClientRect();
  return {
    x: Math.round(box.x + (at.x - rect.left) / box.scale),
    y: Math.round(box.y + (at.y - rect.top) / box.scale),
  };
};

/**
 * moddle 타입 이름은 대문자로 시작하고(`bpm:AiTask`), XML 태그는 `tagAlias: lowerCase`가
 * 되돌린다(`bpm:aiTask`). C14 모델의 이름은 뒤쪽이므로 경계에서 바꿔 준다.
 */
export const toName = (type: string): string => {
  const name = type.slice(4);
  return name.slice(0, 1).toLowerCase() + name.slice(1);
};

export const toType = (name: string): string =>
  `bpm:${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;

/**
 * `bpm:*` 하나의 속성 — `bpm:task`만 `type`·`extension`이 XML 속성이고 나머지는 본문뿐이다 (C14).
 * 만들 때와 고칠 때가 **같은 함수**를 써야 한쪽만 고쳐져 종류가 날아가는 일이 없다.
 */
export const attributesOf = (name: string, text: string): Record<string, string> => {
  if (name !== "task") return { value: text };
  let whole: { type?: string; extension?: string; data?: unknown } = {};
  try {
    whole = JSON.parse(text) as typeof whole;
  } catch {
    whole = {};
  }
  return {
    type: String(whole.type ?? ""),
    extension: String(whole.extension ?? ""),
    value: JSON.stringify(whole.data ?? {}, null, 2),
  };
};
