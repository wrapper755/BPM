"use client";

/**
 * 캔버스를 화면에 붙이는 React 겉껍데기 — 속살은 `CanvasEditor`·`CanvasViewer`에 있다.
 *
 * **브라우저에서만 돈다** (`"use client"`). bpmn-js는 DOM 위에서 사는 것이라 서버 그리기(SSR)로는
 * 뜨지 않는다 — 쓰는 쪽은 `next/dynamic`의 `ssr: false`로 들인다.
 *
 * 손잡이(`ref`)로 **캔버스 자체를 내준다** — 메서드를 하나씩 다시 적어 두면 캔버스에 칸이 늘 때마다
 * 두 자리를 고쳐야 한다. 속성 패널·시험 실행 화면은 이 손잡이로 부른다 (M11 조각 4c·4e).
 */

import { useEffect, useImperativeHandle, useRef } from "react";
import type { Ref } from "react";

import { CanvasEditor } from "./editor";
import { CanvasViewer } from "./viewer";
import type { ImportResult } from "./types";

export interface BpmnCanvasHandle {
  /** 편집 모드일 때의 캔버스 (보기 모드면 `null`). */
  editor: CanvasEditor | null;
  /** 보기 모드일 때의 캔버스 (편집 모드면 `null`). */
  viewer: CanvasViewer | null;
}

export interface BpmnCanvasProps {
  /** `edit`는 모델러, `view`는 **정말 못 고치는** 뷰어다 (ADR-0051). 기본은 `edit`. */
  mode?: "edit" | "view";
  /** 들일 그림. 바뀌면 다시 들인다. 비우면 편집 모드는 빈 그림을 짓는다. */
  xml?: string;
  /** 빈 그림을 지을 때 쓸 BPM 프로세스 id·이름 (`xml`이 비고 편집 모드일 때만). */
  empty?: { processId: string; name: string };
  onChanged?: (dirty: boolean) => void;
  onPicked?: (id: string) => void;
  onImported?: (result: ImportResult) => void;
  onFailed?: (error: Error) => void;
  className?: string;
  ref?: Ref<BpmnCanvasHandle>;
}

export function BpmnCanvas({
  mode = "edit",
  xml,
  empty,
  onChanged,
  onPicked,
  onImported,
  onFailed,
  className,
  ref,
}: BpmnCanvasProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<CanvasEditor | null>(null);
  const viewer = useRef<CanvasViewer | null>(null);
  // 콜백은 그릴 때마다 새 함수가 온다 — 캔버스를 다시 짓지 않도록 여기 담아 둔다.
  const handlers = useRef({ onChanged, onPicked, onImported, onFailed });
  handlers.current = { onChanged, onPicked, onImported, onFailed };

  useImperativeHandle(ref, () => ({ editor: editor.current, viewer: viewer.current }), [mode]);

  // 캔버스를 짓는다 — 모드가 바뀌면 다시 짓는다 (모델러와 뷰어는 다른 배포본이다).
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    if (mode === "edit") {
      editor.current = new CanvasEditor(container, {
        onChanged: (dirty) => handlers.current.onChanged?.(dirty),
        onPicked: (id) => handlers.current.onPicked?.(id),
      });
    } else {
      viewer.current = new CanvasViewer(container);
    }
    return () => {
      editor.current?.destroy();
      viewer.current?.destroy();
      editor.current = null;
      viewer.current = null;
    };
  }, [mode]);

  // 그림을 들인다. 들이는 사이에 모드·그림이 바뀌면 **늦게 온 답을 버린다**.
  useEffect(() => {
    let alive = true;
    const run = async (): Promise<void> => {
      const canvas = mode === "edit" ? editor.current : viewer.current;
      if (!canvas) return;
      try {
        if (xml) {
          const found = await canvas.importXML(xml);
          if (alive) handlers.current.onImported?.(found);
          return;
        }
        if (canvas instanceof CanvasEditor) {
          if (empty) await canvas.createEmpty(empty.processId, empty.name);
          else canvas.clear();
        }
      } catch (error) {
        if (alive) handlers.current.onFailed?.(error instanceof Error ? error : new Error(String(error)));
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [mode, xml, empty]);

  return <div className={className} ref={host} />;
}
