"use client";

import { useEffect, useState } from "react";
import { Button } from "@bpm/ui";
import type { BpmnCanvasHandle } from "@bpm/bpmn-canvas";

/**
 * CON-20b 아래 탭 「변수」 — 이 BPM 프로세스의 **입력·출력 선언**이다 (STU-01 [L], C14 `bpm:process`).
 *
 * 그림의 `bpm:process`라 STU-06(작업공간 정보)이 아니라 **캔버스 쪽**에 있다. 「적용」은 그
 * 요소를 통째로 캔버스에 넘긴다 — **실행 취소 한 걸음**이다 (ADR-0022).
 */

/** C14 `InputDecl`. `type`은 `VALUE_TYPES`다. */
interface InputDecl {
  name: string;
  type: string;
  required?: boolean;
  description?: string | null;
  default?: unknown;
  source?: string | null;
  [key: string]: unknown;
}

const TYPES = ["string", "int", "number", "bool", "list", "dict", "date"];
const INPUT = "w-full border border-border-default bg-bg-surface px-2 py-1 text-body-sm";

export function Variables({
  canvas,
  canWrite,
  onApplied,
}: {
  canvas: React.RefObject<BpmnCanvasHandle | null>;
  canWrite: boolean;
  onApplied: () => void;
}) {
  const [inputs, setInputs] = useState<InputDecl[]>([]);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [rest, setRest] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);

  /** 그림에서 다시 읽는다 — 다른 자리에서 고쳤을 수 있다. */
  const reload = () => {
    const editor = canvas.current?.editor;
    const id = editor?.processId();
    if (!editor || !id) {
      setReady(false);
      return;
    }
    const found = editor.properties(id);
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(found?.bpm.process ?? "{}") as Record<string, unknown>;
    } catch {
      body = {};
    }
    const { inputs: gotInputs, outputs: gotOutputs, ...others } = body;
    setInputs(Array.isArray(gotInputs) ? (gotInputs as InputDecl[]) : []);
    setOutputs(Array.isArray(gotOutputs) ? (gotOutputs as string[]) : []);
    // **모르는 칸은 그대로 들고 간다** (C14 호환 규칙) — `extensions`가 여기 산다.
    setRest(others);
    setReady(true);
  };

  // 그림이 바뀌면(파일을 갈아 끼우면) 캔버스가 다시 지어지므로 한 박자 뒤에 읽는다.
  useEffect(() => {
    const timer = setTimeout(reload, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = () => {
    const editor = canvas.current?.editor;
    const id = editor?.processId();
    if (!editor || !id) return;
    const body = { ...rest, inputs, outputs };
    editor.setProperties(id, { bpm: { process: JSON.stringify(body, null, 2) } });
    onApplied();
  };

  if (!ready) {
    return (
      <div className="flex items-center gap-3 p-3 text-body-sm text-text-muted">
        그림을 읽는 중입니다…
        <Button size="sm" variant="ghost" onClick={reload}>
          다시 읽기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-body-sm font-semibold">입력</h3>
        <span className="text-caption text-text-muted">
          시작할 때 받는 값입니다. 출처가 `company.*`·`department.*`·`staff.*`면 **Center가 넣습니다** (ADR-0099).
        </span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={reload}>
            다시 읽기
          </Button>
          {canWrite ? (
            <Button size="sm" variant="primary" onClick={apply}>
              적용
            </Button>
          ) : null}
        </span>
      </div>

      <table className="w-full border-collapse text-body-sm">
        <thead>
          <tr className="text-caption text-text-muted">
            <th className="border border-border-default p-1 text-left">이름</th>
            <th className="w-28 border border-border-default p-1 text-left">타입</th>
            <th className="w-20 border border-border-default p-1 text-left">필수</th>
            <th className="w-32 border border-border-default p-1 text-left">기본값</th>
            <th className="w-32 border border-border-default p-1 text-left">출처</th>
            <th className="border border-border-default p-1 text-left">설명</th>
            {canWrite ? <th className="w-10 border border-border-default p-1" /> : null}
          </tr>
        </thead>
        <tbody>
          {inputs.map((one, i) => {
            const put = (made: Partial<InputDecl>) =>
              setInputs(inputs.map((each, n) => (n === i ? { ...each, ...made } : each)));
            return (
              <tr key={i}>
                <td className="border border-border-default p-1">
                  <input className={INPUT} value={one.name} onChange={(e) => put({ name: e.target.value })} disabled={!canWrite} />
                </td>
                <td className="border border-border-default p-1">
                  <select className={INPUT} value={one.type} onChange={(e) => put({ type: e.target.value })} disabled={!canWrite}>
                    {TYPES.map((each) => (
                      <option key={each} value={each}>
                        {each}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-border-default p-1 text-center">
                  <input
                    type="checkbox"
                    checked={one.required === true}
                    onChange={(e) => put({ required: e.target.checked })}
                    disabled={!canWrite}
                  />
                </td>
                <td className="border border-border-default p-1">
                  <input
                    className={INPUT}
                    value={one.default === undefined || one.default === null ? "" : String(one.default)}
                    onChange={(e) => put({ default: e.target.value || null })}
                    disabled={!canWrite}
                  />
                </td>
                <td className="border border-border-default p-1">
                  <input
                    className={INPUT}
                    value={one.source ?? ""}
                    placeholder="(부르는 쪽)"
                    onChange={(e) => put({ source: e.target.value || null })}
                    disabled={!canWrite}
                  />
                </td>
                <td className="border border-border-default p-1">
                  <input
                    className={INPUT}
                    value={one.description ?? ""}
                    onChange={(e) => put({ description: e.target.value || null })}
                    disabled={!canWrite}
                  />
                </td>
                {canWrite ? (
                  <td className="border border-border-default p-1 text-center">
                    <Button size="sm" variant="ghost" onClick={() => setInputs(inputs.filter((_, n) => n !== i))}>
                      ✕
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canWrite ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => setInputs([...inputs, { name: "", type: "string" }])}
        >
          입력 더하기
        </Button>
      ) : null}

      <label className="flex flex-col gap-1 text-body-sm">
        <span className="font-semibold">출력</span>
        <span className="text-caption text-text-muted">
          한 줄에 하나. 호출·맡기기가 **이 이름으로** 값을 받습니다 (B14가 이것과 맞춰 봅니다).
        </span>
        <textarea
          className={`${INPUT} font-mono`}
          rows={3}
          value={outputs.join("\n")}
          onChange={(e) => setOutputs(e.target.value.split("\n").map((one) => one.trim()).filter(Boolean))}
          disabled={!canWrite}
        />
      </label>
    </div>
  );
}
