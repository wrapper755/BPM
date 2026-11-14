// 생성 파일: C14 모델(`contracts.bpmn_ext.ELEMENT_MODELS`)에서 만든다.
// 직접 고치지 말고 `uv run python scripts/gen_moddle.py` (ADR-0022).

/** 폼이 그릴 줄 아는 칸의 갈래. `json`은 **그리지 못하는 모양**이라 JSON 칸 하나로 보인다. */
export type FieldKind = "text" | "number" | "bool" | "choice" | "list-text" | "map-text" | "json";

export interface ElementField {
  name: string;
  kind: FieldKind;
  required: boolean;
  choices?: string[];
  help?: string;
}

export interface ElementForm {
  /** 화면 이름 (데스크톱 Studio의 탭 이름 그대로). */
  label: string;
  fields: ElementField[];
}

/** `bpm:*` 요소 이름 → 그 폼. 모델에 칸을 더하면 여기 저절로 생긴다. */
export const ELEMENT_FORMS: Record<string, ElementForm> = {
  "aiTask": {
    "label": "AI 태스크",
    "fields": [
      {
        "name": "goal",
        "kind": "text",
        "required": true
      },
      {
        "name": "domain",
        "kind": "choice",
        "required": true,
        "choices": [
          "api",
          "desktop",
          "doc",
          "llm",
          "web"
        ]
      },
      {
        "name": "tools",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "params",
        "kind": "json",
        "required": false
      },
      {
        "name": "results",
        "kind": "map-text",
        "required": false
      },
      {
        "name": "replay",
        "kind": "choice",
        "required": false,
        "choices": [
          "full",
          "none",
          "plan"
        ]
      },
      {
        "name": "limits",
        "kind": "json",
        "required": false
      },
      {
        "name": "forbidden_actions",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "confirm_triggers",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "web",
        "kind": "json",
        "required": false
      },
      {
        "name": "desktop",
        "kind": "json",
        "required": false
      }
    ]
  },
  "approval": {
    "label": "결재",
    "fields": [
      {
        "name": "title",
        "kind": "text",
        "required": true
      },
      {
        "name": "description",
        "kind": "text",
        "required": false
      },
      {
        "name": "show",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "fields",
        "kind": "json",
        "required": false
      },
      {
        "name": "expires",
        "kind": "text",
        "required": false
      },
      {
        "name": "assignees",
        "kind": "json",
        "required": false
      },
      {
        "name": "answered_by_as",
        "kind": "text",
        "required": false
      },
      {
        "name": "answered_via_as",
        "kind": "text",
        "required": false
      }
    ]
  },
  "call": {
    "label": "호출",
    "fields": [
      {
        "name": "input",
        "kind": "map-text",
        "required": false
      },
      {
        "name": "output",
        "kind": "map-text",
        "required": false
      },
      {
        "name": "delegate",
        "kind": "json",
        "required": false
      }
    ]
  },
  "dataOutput": {
    "label": "파일 출력",
    "fields": [
      {
        "name": "path",
        "kind": "text",
        "required": true
      },
      {
        "name": "format",
        "kind": "text",
        "required": true
      },
      {
        "name": "template",
        "kind": "text",
        "required": false
      },
      {
        "name": "variables",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "sheet",
        "kind": "text",
        "required": false
      },
      {
        "name": "append",
        "kind": "bool",
        "required": false
      },
      {
        "name": "store_as",
        "kind": "text",
        "required": false
      }
    ]
  },
  "defaults": {
    "label": "기본값",
    "fields": [
      {
        "name": "limits",
        "kind": "json",
        "required": false
      },
      {
        "name": "forbidden_actions",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "confirm_triggers",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "web",
        "kind": "json",
        "required": false
      },
      {
        "name": "desktop",
        "kind": "json",
        "required": false
      }
    ]
  },
  "email": {
    "label": "메일",
    "fields": [
      {
        "name": "to",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "cc",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "subject",
        "kind": "text",
        "required": false
      },
      {
        "name": "body",
        "kind": "text",
        "required": false
      },
      {
        "name": "attachments",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "store_as",
        "kind": "text",
        "required": false
      }
    ]
  },
  "fileList": {
    "label": "파일 목록",
    "fields": [
      {
        "name": "folder",
        "kind": "text",
        "required": true
      },
      {
        "name": "pattern",
        "kind": "text",
        "required": false
      },
      {
        "name": "recursive",
        "kind": "bool",
        "required": false
      },
      {
        "name": "sort",
        "kind": "text",
        "required": false
      },
      {
        "name": "limit",
        "kind": "number",
        "required": false
      },
      {
        "name": "store_as",
        "kind": "text",
        "required": false
      },
      {
        "name": "count_as",
        "kind": "text",
        "required": false
      }
    ]
  },
  "loop": {
    "label": "반복",
    "fields": [
      {
        "name": "collection",
        "kind": "text",
        "required": true
      },
      {
        "name": "item",
        "kind": "text",
        "required": true
      },
      {
        "name": "result",
        "kind": "text",
        "required": false
      },
      {
        "name": "collect_into",
        "kind": "text",
        "required": false
      }
    ]
  },
  "process": {
    "label": "프로세스",
    "fields": [
      {
        "name": "extensions",
        "kind": "json",
        "required": false
      },
      {
        "name": "inputs",
        "kind": "json",
        "required": false
      },
      {
        "name": "outputs",
        "kind": "list-text",
        "required": false
      }
    ]
  },
  "receive": {
    "label": "받기",
    "fields": [
      {
        "name": "correlation",
        "kind": "text",
        "required": false
      },
      {
        "name": "payload",
        "kind": "list-text",
        "required": false
      }
    ]
  },
  "rule": {
    "label": "규칙",
    "fields": [
      {
        "name": "decision",
        "kind": "text",
        "required": true
      },
      {
        "name": "input",
        "kind": "map-text",
        "required": false
      },
      {
        "name": "output",
        "kind": "map-text",
        "required": false
      }
    ]
  },
  "serviceCall": {
    "label": "서비스 앱",
    "fields": [
      {
        "name": "app_id",
        "kind": "text",
        "required": true
      },
      {
        "name": "operation",
        "kind": "text",
        "required": true
      },
      {
        "name": "input",
        "kind": "map-text",
        "required": false
      },
      {
        "name": "output",
        "kind": "map-text",
        "required": false
      },
      {
        "name": "timeout_s",
        "kind": "number",
        "required": false
      },
      {
        "name": "retry",
        "kind": "json",
        "required": false
      }
    ]
  },
  "task": {
    "label": "확장 태스크",
    "fields": [
      {
        "name": "type",
        "kind": "text",
        "required": true
      },
      {
        "name": "extension",
        "kind": "text",
        "required": true
      },
      {
        "name": "data",
        "kind": "json",
        "required": false
      }
    ]
  },
  "webhook": {
    "label": "웹훅",
    "fields": [
      {
        "name": "url",
        "kind": "text",
        "required": true
      },
      {
        "name": "method",
        "kind": "text",
        "required": false
      },
      {
        "name": "body",
        "kind": "text",
        "required": false
      },
      {
        "name": "timeout_s",
        "kind": "number",
        "required": false
      },
      {
        "name": "store_as",
        "kind": "text",
        "required": false
      }
    ]
  }
};
