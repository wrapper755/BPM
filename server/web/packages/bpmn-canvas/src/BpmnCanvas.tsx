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

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";

import { CanvasEditor } from "./editor";
import { CanvasViewer } from "./viewer";
import type { CanvasNavigation } from "./shared";
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

  // **읽을 때 꺼내 준다** — 캔버스는 effect에서 지어지는데 손잡이는 그보다 먼저 만들어져,
  // 값을 그때 담으면 늘 `null`이다.
  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return editor.current;
      },
      get viewer() {
        return viewer.current;
      },
    }),
    [],
  );

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
          // **들인 뒤에 사실대로 알린다** — bpmn-js가 들이면서 `commandStack.changed`를 한 번 내므로
          // 그 말만 들으면 **연 적밖에 없는 그림이 「저장 안 한 변경」**이 된다. 캔버스 자신은
          // 들인 뒤 그 표시를 바로잡으므로(자동 배치를 했을 때만 참) 그 값을 그대로 전한다.
          if (alive && canvas instanceof CanvasEditor) handlers.current.onChanged?.(canvas.dirty);
          return;
        }
        if (canvas instanceof CanvasEditor) {
          if (empty) await canvas.createEmpty(empty.processId, empty.name);
          else canvas.clear();
          if (alive) handlers.current.onChanged?.(canvas.dirty);
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

  const [minimap, setMinimap] = useState(false);
  const nav = (): CanvasNavigation | null => editor.current?.navigation ?? viewer.current?.navigation ?? null;

  // 모드가 바뀌면 캔버스를 새로 짓는다 — 미니맵도 접힌 채로 다시 난다.
  useEffect(() => setMinimap(false), [mode]);

  return (
    <div className={`bpm-canvas-frame ${className ?? ""}`}>
      <div className="bpm-canvas-host" ref={host} />
      {/* 둘러보기 도구 띠 — 왼쪽 아래(팔레트는 왼쪽 위, bpmn.io 표지는 오른쪽 아래다). */}
      <div className="bpm-canvas-tools" role="toolbar" aria-label="캔버스 보기">
        <ToolButton label="축소" onClick={() => nav()?.zoomOut()}>
          <path d="M5 12h14" />
        </ToolButton>
        <ToolButton label="확대" onClick={() => nav()?.zoomIn()}>
          <path d="M5 12h14M12 5v14" />
        </ToolButton>
        <span className="bpm-canvas-tools-gap" aria-hidden="true" />
        <ToolButton label="화면에 맞추기" onClick={() => nav()?.fit()}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </ToolButton>
        <ToolButton label="실제 크기로 가운데" onClick={() => nav()?.actualSize()}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </ToolButton>
        <span className="bpm-canvas-tools-gap" aria-hidden="true" />
        <ToolButton
          label={minimap ? "미니맵 접기" : "미니맵 펴기"}
          pressed={minimap}
          onClick={() => {
            const open = nav()?.toggleMinimap();
            if (open !== undefined) setMinimap(open);
          }}
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <rect x="12" y="11" width="6" height="5" />
        </ToolButton>
      </div>
    </div>
  );
}

/** 도구 띠의 단추 하나 — 이름은 말풍선과 보조 기술이 읽는다. 그림은 24 칸 안의 선이다. */
function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="bpm-canvas-tool"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
