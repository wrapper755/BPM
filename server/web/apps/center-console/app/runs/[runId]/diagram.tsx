"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@bpm/ui";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "./diagram.css";

/** 노드 하나의 그림 상태 — 색 토큰(`status_map` 「실행·노드」)과 기다리는 중인가. */
export type DiagramState = { token: string; waiting: boolean };

type Canvas = {
  zoom: (level: "fit-viewport") => void;
  resized: () => void;
  viewbox: () => { inner: { width: number; height: number } };
  addMarker: (id: string, marker: string) => void;
};
type Shape = { id: string; type: string; labelTarget?: unknown };
type Registry = { getAll: () => Shape[]; getGraphics: (id: string) => SVGElement | undefined };
type EventBus = { on: (event: string, callback: (event: { element: Shape }) => void) => void };

/** 상태를 얹을 BPMN 도형 — 흐름에 놓이는 노드만 (선·레인·참가자·라벨은 뺀다). */
const NOT_A_NODE = new Set([
  "bpmn:Process",
  "bpmn:Collaboration",
  "bpmn:Participant",
  "bpmn:Lane",
  "bpmn:SequenceFlow",
  "bpmn:MessageFlow",
  "bpmn:Association",
  "bpmn:TextAnnotation",
  "bpmn:DataObjectReference",
  "bpmn:DataStoreReference",
  "bpmn:Group",
  "label",
]);

/**
 * CON-01 「다이어그램」 — 그 판의 진입 정의를 **Studio와 같은 bpmn-js 뷰어**로 그린다 (ADR-0136).
 *
 * XML은 서버 쪽이 Center에서 받아 건넨다(브라우저는 Center를 부르지 않는다). 노드마다 상태 색
 * 테두리, 기다리는 중은 점선, 지나지 않은 노드는 흐리게. 도형을 누르면 타임라인의 그 줄로 간다.
 * 뜻은 아래 타임라인·표가 글로 말한다 — 색만으로 전하지 않는다 (스타일 가이드 §7).
 */
export function Diagram({ xml, states }: { xml: string; states: Record<string, DiagramState> }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<Canvas | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let viewer: { destroy: () => void } | null = null;
    let gone = false;
    (async () => {
      const { default: NavigatedViewer } = await import("bpmn-js/lib/NavigatedViewer");
      if (gone || !box.current) return;
      const made = new NavigatedViewer({ container: box.current });
      viewer = made;
      try {
        await made.importXML(xml);
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : "정의를 그리지 못했습니다");
        return;
      }
      const found = made.get<Canvas>("canvas");
      const registry = made.get<Registry>("elementRegistry");
      canvas.current = found;
      // 높이는 그림 비율을 따른다 — 가로로 긴 흐름이 아래를 비워 두지 않게. CSS 높이가 위 끝이다.
      const { width, height } = found.viewbox().inner;
      const most = box.current.clientHeight;
      if (width > 0) box.current.style.height = `${Math.min(most, Math.ceil((box.current.clientWidth * height) / width) + 48)}px`;
      found.resized();
      found.zoom("fit-viewport");
      for (const shape of registry.getAll()) {
        if (shape.labelTarget || NOT_A_NODE.has(shape.type)) continue;
        const state = states[shape.id];
        if (!state) {
          found.addMarker(shape.id, "run-unvisited");
          continue;
        }
        registry.getGraphics(shape.id)?.style.setProperty("--run-color", `var(--status-${state.token}-solid)`);
        found.addMarker(shape.id, state.waiting ? "run-waiting" : "run-state");
      }
      made.get<EventBus>("eventBus").on("element.click", ({ element }) => {
        document.getElementById(`node-${element.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    })();
    return () => {
      gone = true;
      viewer?.destroy();
    };
  }, [xml, states]);

  if (failure) return <p className="text-body-sm text-text-muted">다이어그램을 읽지 못했습니다 — {failure}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm text-text-muted">
          끌어 옮기고 휠로 확대합니다. 도형을 누르면 아래 「노드 타임라인」의 그 줄로 갑니다.
        </p>
        <Button size="sm" variant="secondary" onClick={() => canvas.current?.zoom("fit-viewport")}>
          맞추기
        </Button>
      </div>
      <div
        ref={box}
        className="run-diagram rounded-md border border-border-default bg-bg-surface"
        aria-label="BPM 다이어그램"
      />
    </div>
  );
}
