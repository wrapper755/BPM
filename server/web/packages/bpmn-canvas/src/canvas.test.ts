/**
 * 캔버스 중 **화면을 모르는 부분**을 잰다 — 자동 배치와 노드 읽기.
 *
 * 모델러·뷰어 자체는 DOM 위에서만 사는 것이라 여기서 띄우지 않는다 (vitest는 브라우저를 띄우지
 * 않는다). 그 둘은 콘솔 화면(CON-20)에서 사람이 본다.
 */

import { describe, expect, it } from "vitest";

import { laidOut, needsLayout } from "./auto-layout";
import { BPM_MODDLE } from "./moddle";
import { readApprovals } from "./approvals";
import { EVENT_KINDS, eventOf, gatewayOf, multiInstanceOf, propertiesOf } from "./read";
import type { BusinessObject, ExtensionElement, ExtensionElements, Flow } from "./types";

/** 그림 좌표(DI)가 없는 정의 — 「자리를 지어 줘야 하는 것」의 본보기다. */
const WITHOUT_DI = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_1" targetNamespace="urn:test">
  <bpmn:process id="P1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:serviceTask id="Task_1" name="값 읽기" />
    <bpmn:endEvent id="End_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe("자동 배치", () => {
  it("그림 좌표가 없으면 배치해야 한다고 말한다", async () => {
    expect(await needsLayout(WITHOUT_DI)).toBe(true);
  });

  it("배치하면 DI가 생기고 흐름도 함께 그려진다", async () => {
    const made = await laidOut(WITHOUT_DI);
    expect(made.laidOut).toBe(true);
    expect(made.xml).toContain("BPMNDiagram");
    // 선이 그어졌는가 — `incoming`·`outgoing`을 채우지 않으면 도형만 놓이고 선이 하나도 없다.
    expect(made.xml).toContain("BPMNEdge");
  });

  it("사람이 놓은 자리는 덮지 않는다", async () => {
    const once = await laidOut(WITHOUT_DI);
    const twice = await laidOut(once.xml);
    expect(twice.laidOut).toBe(false);
    expect(twice.xml).toBe(once.xml);
  });

  it("읽지 못하는 글은 그대로 넘긴다 — bpmn-js가 제 말로 거부하게", async () => {
    const found = await laidOut("<이건 BPMN이 아니다");
    expect(found.laidOut).toBe(false);
    expect(found.xml).toBe("<이건 BPMN이 아니다");
  });
});

describe("bpm: 요소 설명", () => {
  it("C14 요소마다 본문 하나를 둔다", () => {
    expect(BPM_MODDLE.prefix).toBe("bpm");
    expect(BPM_MODDLE.xml.tagAlias).toBe("lowerCase");
    for (const type of BPM_MODDLE.types) {
      const body = type.properties.filter((one) => "isBody" in one && one.isBody);
      expect(body).toHaveLength(1);
    }
  });

  it("`bpm:task`만 XML 속성 둘을 더 쓴다 (C14)", () => {
    const attrs = (name: string): string[] => {
      const found = BPM_MODDLE.types.find((one) => one.name === name);
      return (found?.properties ?? [])
        .filter((one) => "isAttr" in one && one.isAttr)
        .map((one) => one.name);
    };
    expect(attrs("Task")).toEqual(["type", "extension"]);
    expect(attrs("AiTask")).toEqual([]);
  });
});

/** businessObject 하나를 손으로 짓는다 — 모델러 없이 읽는 쪽만 잰다. */
const bo = (over: Partial<BusinessObject> & { $type: string; id: string }): BusinessObject =>
  ({ ...over }) as BusinessObject;

/** `bpm:*`를 담는 그릇. */
const extensions = (values: ExtensionElement[]): ExtensionElements => ({
  $type: "bpmn:ExtensionElements",
  id: "Ext_1",
  values,
});

describe("노드 읽기", () => {
  it("`bpm:*` 본문을 요소 이름으로 담는다", () => {
    const found = propertiesOf(
      bo({
        $type: "bpmn:ServiceTask",
        id: "Task_1",
        name: "값 읽기",
        documentation: [{ text: "설명" }],
        extensionElements: extensions([{ $type: "bpm:aiTask", id: "a", value: '{"goal":"읽기"}' }]),
      }),
    );
    expect(found.type).toBe("ServiceTask");
    expect(found.documentation).toBe("설명");
    expect(found.bpm.aiTask).toBe('{"goal":"읽기"}');
  });

  it("`bpm:task`는 속성과 본문을 한 JSON으로 합쳐 준다 (C14)", () => {
    const found = propertiesOf(
      bo({
        $type: "bpmn:ServiceTask",
        id: "Task_1",
        extensionElements: extensions([
          { $type: "bpm:task", id: "t", type: "excel.read", extension: "office", value: '{"path":"a.xlsx"}' },
        ]),
      }),
    );
    expect(JSON.parse(found.bpm.task ?? "{}")).toEqual({
      type: "excel.read",
      extension: "office",
      data: { path: "a.xlsx" },
    });
  });

  it("반복 표시는 엔진과 같게 읽는다", () => {
    const of = (isSequential?: boolean): string =>
      multiInstanceOf(
        bo({
          $type: "bpmn:ServiceTask",
          id: "Task_1",
          loopCharacteristics: { $type: "bpmn:MultiInstanceLoopCharacteristics", isSequential },
        }),
      );
    expect(of(true)).toBe("sequential");
    expect(of(false)).toBe("parallel");
    expect(multiInstanceOf(bo({ $type: "bpmn:ServiceTask", id: "Task_1" }))).toBe("");
  });

  it("게이트웨이는 기본 흐름과 조건식을 함께 보여 준다", () => {
    const yes: Flow = {
      $type: "bpmn:SequenceFlow",
      id: "Flow_yes",
      name: "승인",
      conditionExpression: { body: "${금액 < 100}" },
      targetRef: bo({ $type: "bpmn:Task", id: "Task_pay", name: "지급" }),
    };
    const found = gatewayOf(
      bo({ $type: "bpmn:ExclusiveGateway", id: "Gw_1", outgoing: [yes], default: yes }),
    );
    expect(found?.default).toBe("Flow_yes");
    expect(found?.outgoing).toEqual([
      { id: "Flow_yes", name: "승인", to: "지급", condition: "${금액 < 100}" },
    ]);
    expect(gatewayOf(bo({ $type: "bpmn:ServiceTask", id: "Task_1" }))).toBeNull();
  });

  it("타이머는 종류 하나와 값을 읽는다", () => {
    const found = eventOf(
      bo({
        $type: "bpmn:IntermediateCatchEvent",
        id: "Ev_1",
        eventDefinitions: [
          { $type: "bpmn:TimerEventDefinition", id: "t", timeDuration: { body: "PT1H" } },
        ],
      }),
    );
    // **쓰는 쪽이 견주는 그 값이다** — 속성 패널이 이것으로 타이머 칸을 그린다.
    expect(found?.definition).toBe(EVENT_KINDS.timer);
    expect(found?.timer).toEqual({ kind: "timeDuration", value: "PT1H" });
  });

  it("받기 태스크는 메시지 이름을 이벤트처럼 읽는다 (C12)", () => {
    const found = eventOf(
      bo({
        $type: "bpmn:ReceiveTask",
        id: "Recv_1",
        messageRef: { $type: "bpmn:Message", id: "m", name: "승인됨" },
      }),
    );
    expect(found?.definition).toBe(EVENT_KINDS.message);
    expect(found?.message).toBe("승인됨");
  });
});

/** 결재 둘 — 하나는 폼이 있고 하나는 하위 프로세스 안의 확인이다. */
const WITH_APPROVALS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpm="urn:chaeksas:bpmn:1" id="Definitions_1" targetNamespace="urn:test">
  <bpmn:process id="P1" isExecutable="true">
    <bpmn:userTask id="Approve_Hold" name="보류 건 확인">
      <bpmn:extensionElements>
        <bpm:approval>{"title":"보류 건을 확인하세요","fields":[
          {"key":"지급진행","label":"지급 진행","type":"text","required":true},
          {"key":"승인","label":"승인","type":"bool","default":true},
          {"key":"등급","label":"등급","type":"choice","choices":["상","중","하"]}]}</bpm:approval>
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:subProcess id="Sub_1">
      <bpmn:manualTask id="Check_Site">
        <bpmn:extensionElements>
          <bpm:approval>{"title":"현장을 확인하세요"}</bpm:approval>
        </bpmn:extensionElements>
      </bpmn:manualTask>
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>`;

describe("그림이 묻는 결재", () => {
  it("노드 id와 폼 칸을 읽는다 — 케이스가 답을 적을 자리다 (C14 approvals)", async () => {
    const found = await readApprovals(WITH_APPROVALS);
    const ask = found.find((one) => one.nodeId === "Approve_Hold");
    expect(ask?.label).toBe("보류 건 확인");
    expect(ask?.confirmation).toBe(false);
    expect(ask?.fields.map((one) => [one.key, one.type, one.required])).toEqual([
      ["지급진행", "text", true],
      ["승인", "bool", false],
      ["등급", "choice", false],
    ]);
    expect(ask?.fields[2]?.choices).toEqual(["상", "중", "하"]);
    expect(ask?.fields[1]?.default).toBe(true);
  });

  it("하위 프로세스 안도 훑고 확인(manualTask)을 가른다 — 답하는 자리는 같아도 글이 다르다", async () => {
    const found = await readApprovals(WITH_APPROVALS);
    const ask = found.find((one) => one.nodeId === "Check_Site");
    expect(ask?.confirmation).toBe(true);
    expect(ask?.title).toBe("현장을 확인하세요");
    expect(ask?.fields).toEqual([]);
  });

  it("읽지 못하는 그림이면 빈 목록이다 — 케이스 편집기가 뜨지 못하면 안 된다", async () => {
    expect(await readApprovals("이건 BPMN이 아니다")).toEqual([]);
  });
});
