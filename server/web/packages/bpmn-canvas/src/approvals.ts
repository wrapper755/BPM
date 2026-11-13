/**
 * 그림이 묻는 결재·확인을 **글자에서** 읽는다 — 케이스 편집기가 답 폼을 짓는 자리 (STU-07).
 *
 * **DOM이 없어도 돈다** — bpmn-moddle만 쓰므로 vitest에서도 재고, 케이스 파일을 열어 둔 화면
 * (캔버스가 떠 있지 않다)에서도 쓸 수 있다. 그래서 `read.ts`와 같은 결로 여기 둔다.
 *
 * 읽는 것은 **폼의 모양뿐**이다 — 값이 맞는지는 돌려 볼 때 엔진이 본다
 * (`core.testrun.cases`의 `validate_answer`). 여기서 그 판정을 베끼면 두 벌이 된다.
 */

import { BpmnModdle } from "bpmn-moddle";

import { BPM_MODDLE } from "./moddle";
import type { BusinessObject, ExtensionElement } from "./types";

/** 결재 폼의 칸 하나 (C6 `FormField` — C14 `bpm:approval.fields`와 같은 모양). */
export interface ApprovalField {
  key: string;
  label: string;
  /** `bool` · `number` · `text` · `choice` (C6 `KNOWN_FIELD_TYPES`). 모르는 값은 그대로 온다. */
  type: string;
  required: boolean;
  choices: unknown[] | null;
  default: unknown;
}

/** 그림이 묻는 결재·확인 하나. */
export interface ApprovalAsk {
  /** 노드 id — 케이스의 `approvals` 열쇠다 (C14). */
  nodeId: string;
  /** 노드 이름, 없으면 결재 제목. */
  label: string;
  title: string;
  /** `userTask`(결재)인가 `manualTask`(확인)인가 — 답하는 자리가 같아도 글이 다르다 (U16). */
  confirmation: boolean;
  fields: ApprovalField[];
}

/**
 * `bpm:*` 확장 요소의 본문(JSON 글). **칸 이름은 `value`다** — moddle 설명이 그렇게 적는다
 * (`moddle.ts`), 그래서 읽는 쪽(`read.ts`)과 같은 칸을 본다.
 */
function bodyOf(bo: BusinessObject, name: string): string | null {
  const found = (bo.extensionElements?.values ?? []).find(
    (one: ExtensionElement) => one.$type === name,
  );
  return typeof found?.value === "string" ? found.value : null;
}

function fieldsOf(raw: unknown): ApprovalField[] {
  if (!Array.isArray(raw)) return [];
  const out: ApprovalField[] = [];
  for (const one of raw) {
    if (!one || typeof one !== "object") continue;
    const field = one as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key : "";
    if (!key) continue;
    out.push({
      key,
      label: typeof field.label === "string" ? field.label : key,
      type: typeof field.type === "string" ? field.type : "text",
      required: field.required === true,
      choices: Array.isArray(field.choices) ? field.choices : null,
      default: field.default,
    });
  }
  return out;
}

/** 흐름 요소를 **하위 프로세스 안까지** 훑는다 — 결재가 거기 있을 수 있다. */
function* walk(parent: BusinessObject): Generator<BusinessObject> {
  for (const one of parent.flowElements ?? []) {
    yield one;
    if (one.flowElements) yield* walk(one);
  }
}

/**
 * 그 그림이 묻는 결재·확인 — 케이스가 답을 적을 자리다 (C14 `approvals`).
 *
 * **읽지 못하는 그림이면 빈 목록이다** — 케이스 편집기가 뜨지 못하면 안 된다. 폼을 짓지 못하면
 * JSON 칸으로 적게 두는 쪽이 낫다.
 */
export async function readApprovals(xml: string): Promise<ApprovalAsk[]> {
  const moddle = new BpmnModdle({ bpm: BPM_MODDLE });
  let root: BusinessObject;
  try {
    ({ rootElement: root } = await moddle.fromXML(xml));
  } catch {
    return [];
  }
  const out: ApprovalAsk[] = [];
  for (const process of (root.rootElements ?? []) as BusinessObject[]) {
    if (process.$type !== "bpmn:Process") continue;
    for (const node of walk(process)) {
      const body = bodyOf(node, "bpm:Approval");
      if (body === null) continue;
      let read: Record<string, unknown>;
      try {
        read = JSON.parse(body) as Record<string, unknown>;
      } catch {
        continue; // 반쯤 적은 본문 — 그 결재만 건너뛴다
      }
      const title = typeof read.title === "string" ? read.title : "";
      out.push({
        nodeId: node.id,
        label: node.name || title || node.id,
        title,
        confirmation: node.$type === "bpmn:ManualTask",
        fields: fieldsOf(read.fields),
      });
    }
  }
  return out;
}
