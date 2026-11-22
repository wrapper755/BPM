// 생성 파일: C14 모델(`contracts.bpmn_ext.ELEMENT_MODELS`)에서 만든다.
// 직접 고치지 말고 `uv run python scripts/gen_moddle.py` (ADR-0022).

/** 폼이 그릴 줄 아는 칸의 갈래. `json`은 **그리지 못하는 모양**이라 JSON 칸 하나로 보인다. */
export type FieldKind = "text" | "number" | "bool" | "choice" | "list-text" | "map-text" | "json";

/** 상세 패널의 탭 — 하는 일 차례 (CON-20b). */
export type FieldTab = "basic" | "io" | "advanced";

export interface ElementField {
  name: string;
  /** 화면 이름 (한글). 원문 칸 이름은 `name`이다. */
  label: string;
  /** CON-20b 상세 패널의 탭 — 「기본」·「입력·출력」·「고급」. */
  tab: FieldTab;
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
  "adHoc": {
    "label": "Ad Hoc",
    "fields": [
      {
        "name": "activate",
        "label": "켤 활동",
        "tab": "basic",
        "kind": "text",
        "required": false,
        "help": "식 — 켤 활동의 id 또는 이름 목록입니다. 들어갈 때 한 번 봅니다."
      },
      {
        "name": "ai",
        "label": "AI 설정",
        "tab": "basic",
        "kind": "json",
        "required": false,
        "help": "AI가 안쪽 활동을 도구로 골라 켭니다."
      },
      {
        "name": "result",
        "label": "한 번의 결과",
        "tab": "io",
        "kind": "text",
        "required": false,
        "help": "활동 흐름이 끝날 때마다 평가해 모을 변수에 붙이는 식입니다."
      },
      {
        "name": "collect_into",
        "label": "모을 변수",
        "tab": "io",
        "kind": "text",
        "required": false,
        "help": "한 번의 결과를 모은 목록입니다. 들어갈 때 비웁니다."
      }
    ]
  },
  "aiTask": {
    "label": "AI 태스크",
    "fields": [
      {
        "name": "goal",
        "label": "목표",
        "tab": "basic",
        "kind": "text",
        "required": true,
        "help": "AI가 이 태스크에서 이룰 것을 한 문장으로 적습니다."
      },
      {
        "name": "domain",
        "label": "영역",
        "tab": "basic",
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
        "label": "허용 도구",
        "tab": "basic",
        "kind": "list-text",
        "required": false,
        "help": "쓸 수 있는 도구 이름입니다."
      },
      {
        "name": "params",
        "label": "매개변수",
        "tab": "advanced",
        "kind": "json",
        "required": false,
        "help": "재생 때 `$param`으로 바뀌는 값입니다."
      },
      {
        "name": "results",
        "label": "결과 필드",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`이름=타입` — AI가 채워 돌려줄 칸입니다."
      },
      {
        "name": "replay",
        "label": "재생",
        "tab": "advanced",
        "kind": "choice",
        "required": false,
        "choices": [
          "full",
          "none",
          "plan"
        ],
        "help": "full: 모델 0회 · plan: 마지막 추출만 모델 · none: 매번 자율."
      },
      {
        "name": "limits",
        "label": "한도",
        "tab": "advanced",
        "kind": "json",
        "required": false
      },
      {
        "name": "forbidden_actions",
        "label": "금지 동작",
        "tab": "advanced",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "confirm_triggers",
        "label": "확인할 때",
        "tab": "advanced",
        "kind": "list-text",
        "required": false,
        "help": "이 말이 걸리면 사람에게 확인을 받습니다."
      },
      {
        "name": "web",
        "label": "웹 설정",
        "tab": "advanced",
        "kind": "json",
        "required": false
      },
      {
        "name": "desktop",
        "label": "데스크톱 설정",
        "tab": "advanced",
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
        "label": "제목",
        "tab": "basic",
        "kind": "text",
        "required": true
      },
      {
        "name": "description",
        "label": "설명",
        "tab": "basic",
        "kind": "text",
        "required": false
      },
      {
        "name": "show",
        "label": "보일 값",
        "tab": "io",
        "kind": "list-text",
        "required": false,
        "help": "결재하는 사람에게 보일 변수입니다."
      },
      {
        "name": "fields",
        "label": "답 칸",
        "tab": "io",
        "kind": "json",
        "required": false
      },
      {
        "name": "expires",
        "label": "기한",
        "tab": "basic",
        "kind": "text",
        "required": false,
        "help": "ISO 기간(`P3D`) 또는 변수 이름입니다."
      },
      {
        "name": "assignees",
        "label": "담당자",
        "tab": "basic",
        "kind": "json",
        "required": false
      },
      {
        "name": "answered_by_as",
        "label": "답한 사람 변수",
        "tab": "io",
        "kind": "text",
        "required": false,
        "help": "답한 사람을 담을 변수입니다."
      },
      {
        "name": "answered_via_as",
        "label": "답한 길 변수",
        "tab": "io",
        "kind": "text",
        "required": false,
        "help": "답이 들어온 길을 담을 변수입니다."
      }
    ]
  },
  "call": {
    "label": "호출",
    "fields": [
      {
        "name": "input",
        "label": "입력",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`호출 대상 변수=식`"
      },
      {
        "name": "output",
        "label": "출력",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`내 변수=호출 대상 변수`"
      },
      {
        "name": "delegate",
        "label": "맡기기",
        "tab": "advanced",
        "kind": "json",
        "required": false,
        "help": "켜면 따로 실행으로 맡깁니다 (일괄 기동)."
      }
    ]
  },
  "dataOutput": {
    "label": "파일 출력",
    "fields": [
      {
        "name": "path",
        "label": "경로",
        "tab": "basic",
        "kind": "text",
        "required": true
      },
      {
        "name": "format",
        "label": "형식",
        "tab": "basic",
        "kind": "text",
        "required": true
      },
      {
        "name": "template",
        "label": "템플릿",
        "tab": "basic",
        "kind": "text",
        "required": false
      },
      {
        "name": "variables",
        "label": "변수",
        "tab": "io",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "sheet",
        "label": "시트",
        "tab": "basic",
        "kind": "text",
        "required": false
      },
      {
        "name": "append",
        "label": "이어 쓰기",
        "tab": "advanced",
        "kind": "bool",
        "required": false
      },
      {
        "name": "store_as",
        "label": "경로를 담을 변수",
        "tab": "io",
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
        "label": "한도",
        "tab": "basic",
        "kind": "json",
        "required": false
      },
      {
        "name": "forbidden_actions",
        "label": "금지 동작",
        "tab": "basic",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "confirm_triggers",
        "label": "확인할 때",
        "tab": "basic",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "web",
        "label": "웹 설정",
        "tab": "basic",
        "kind": "json",
        "required": false
      },
      {
        "name": "desktop",
        "label": "데스크톱 설정",
        "tab": "basic",
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
        "label": "받는 사람",
        "tab": "basic",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "cc",
        "label": "참조",
        "tab": "basic",
        "kind": "list-text",
        "required": false
      },
      {
        "name": "subject",
        "label": "제목",
        "tab": "basic",
        "kind": "text",
        "required": false
      },
      {
        "name": "body",
        "label": "본문",
        "tab": "basic",
        "kind": "text",
        "required": false
      },
      {
        "name": "attachments",
        "label": "첨부",
        "tab": "io",
        "kind": "list-text",
        "required": false,
        "help": "파일 경로가 든 변수 이름입니다."
      },
      {
        "name": "store_as",
        "label": "결과를 담을 변수",
        "tab": "io",
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
        "label": "폴더",
        "tab": "basic",
        "kind": "text",
        "required": true,
        "help": "`{변수}`를 쓸 수 있습니다. 상대 경로는 출력 폴더 기준입니다."
      },
      {
        "name": "pattern",
        "label": "파일 이름 패턴",
        "tab": "basic",
        "kind": "text",
        "required": false,
        "help": "glob 한 조각(`*.pdf`) — 경로 구분자는 쓸 수 없습니다."
      },
      {
        "name": "recursive",
        "label": "하위 폴더까지",
        "tab": "basic",
        "kind": "bool",
        "required": false
      },
      {
        "name": "sort",
        "label": "정렬",
        "tab": "advanced",
        "kind": "text",
        "required": false
      },
      {
        "name": "limit",
        "label": "최대 개수",
        "tab": "advanced",
        "kind": "number",
        "required": false
      },
      {
        "name": "store_as",
        "label": "목록을 담을 변수",
        "tab": "io",
        "kind": "text",
        "required": false
      },
      {
        "name": "count_as",
        "label": "개수를 담을 변수",
        "tab": "io",
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
        "label": "돌 목록",
        "tab": "io",
        "kind": "text",
        "required": true
      },
      {
        "name": "item",
        "label": "항목 변수",
        "tab": "io",
        "kind": "text",
        "required": true
      },
      {
        "name": "result",
        "label": "한 번의 결과",
        "tab": "io",
        "kind": "text",
        "required": false,
        "help": "한 번 돈 결과로 쓰는 변수 — 그 태스크의 출력 중 하나입니다."
      },
      {
        "name": "collect_into",
        "label": "모을 변수",
        "tab": "io",
        "kind": "text",
        "required": false,
        "help": "한 번의 결과를 모은 목록입니다."
      }
    ]
  },
  "process": {
    "label": "프로세스",
    "fields": [
      {
        "name": "extensions",
        "label": "확장",
        "tab": "advanced",
        "kind": "json",
        "required": false
      },
      {
        "name": "inputs",
        "label": "입력",
        "tab": "io",
        "kind": "json",
        "required": false
      },
      {
        "name": "outputs",
        "label": "출력",
        "tab": "io",
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
        "label": "상관 변수",
        "tab": "basic",
        "kind": "text",
        "required": false,
        "help": "이 변수의 값이 같은 메시지만 받습니다."
      },
      {
        "name": "payload",
        "label": "받을 값",
        "tab": "io",
        "kind": "list-text",
        "required": false,
        "help": "본문에서 변수로 들어오는 이름입니다."
      }
    ]
  },
  "rule": {
    "label": "규칙",
    "fields": [
      {
        "name": "decision",
        "label": "결정",
        "tab": "basic",
        "kind": "text",
        "required": true,
        "help": "같은 패키지의 DMN 결정 id입니다."
      },
      {
        "name": "input",
        "label": "입력",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`DMN 입력 이름=식`"
      },
      {
        "name": "output",
        "label": "출력",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`변수=DMN 출력 이름`"
      }
    ]
  },
  "serviceCall": {
    "label": "서비스 앱",
    "fields": [
      {
        "name": "app_id",
        "label": "앱",
        "tab": "basic",
        "kind": "text",
        "required": true
      },
      {
        "name": "operation",
        "label": "작업",
        "tab": "basic",
        "kind": "text",
        "required": true
      },
      {
        "name": "input",
        "label": "입력",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`필드=식`"
      },
      {
        "name": "output",
        "label": "출력",
        "tab": "io",
        "kind": "map-text",
        "required": false,
        "help": "`변수=필드`"
      },
      {
        "name": "timeout_s",
        "label": "제한 시간(초)",
        "tab": "advanced",
        "kind": "number",
        "required": false
      },
      {
        "name": "retry",
        "label": "다시 시도",
        "tab": "advanced",
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
        "label": "태스크 종류",
        "tab": "basic",
        "kind": "text",
        "required": true,
        "help": "확장이 기여한 태스크 종류 id입니다."
      },
      {
        "name": "extension",
        "label": "확장",
        "tab": "basic",
        "kind": "text",
        "required": true,
        "help": "확장 id입니다."
      },
      {
        "name": "data",
        "label": "데이터",
        "tab": "io",
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
        "label": "주소",
        "tab": "basic",
        "kind": "text",
        "required": true
      },
      {
        "name": "method",
        "label": "메서드",
        "tab": "basic",
        "kind": "text",
        "required": false
      },
      {
        "name": "body",
        "label": "본문",
        "tab": "basic",
        "kind": "text",
        "required": false,
        "help": "`all` · `fields:[…]` · `template:\"…\"`"
      },
      {
        "name": "timeout_s",
        "label": "제한 시간(초)",
        "tab": "advanced",
        "kind": "number",
        "required": false
      },
      {
        "name": "store_as",
        "label": "결과를 담을 변수",
        "tab": "io",
        "kind": "text",
        "required": false
      }
    ]
  }
};
