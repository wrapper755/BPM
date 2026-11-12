"""확장이 구현하는 안정 인터페이스 — 태스크 종류·수행기, 편집기, 사전 점검 (ADR-0018).

확장을 만드는 쪽은 **이 패키지만** import한다. `core`·제품 앱은 보지 않는다 (의존 방향은
`docs/01-architecture.md` §5, `tests/integration/test_import_direction.py`가 막는다).

| 기여 지점 (C13) | 구현할 것 |
| --- | --- |
| `task_types[].executor` | `TaskExecutor` |
| `task_types[].editor`, `studio.editors` | `TaskEditor` (`kind="schema"`면 필요 없다) |
| `preflight` | `PreflightCheck` |
| `studio.resource_views`, `console.pages`, `resources`, `configuration` | (없음 — 선언뿐) |
| 외부 앱 (`service.adapter`) | (없음 — `core`의 해석기가 부른다. 규격은 `http_adapter`) |

확장 정의(`extension.json`)의 모델과 검사 규칙은 계약에 있다 (`bpm.contracts.extension`).
찾아서 켜는 쪽은 `bpm.core.extensions` (확장 호스트)다.

    # extensions/<id>/src/bpm/ext/<id>/client.py
    from bpm.extension_api import TaskContext, TaskExecutor, TaskOutcome

    class MyTaskExecutor:                       # Protocol이라 상속하지 않는다
        def execute(self, ctx: TaskContext) -> TaskOutcome:
            return TaskOutcome(outputs={"ok": True})

버전 규칙은 `_meta`에 있다 — 이름·서명을 바꾸면 주 번호를 올리고, 옛 확장은 「호환 안 됨」이 된다.
"""

from bpm.contracts.approvals import review_table
from bpm.extension_api._meta import API_VERSION
from bpm.extension_api.contributions import (
    SEVERITIES,
    SEVERITY_BLOCK,
    SEVERITY_INFO,
    SEVERITY_WARN,
    Finding,
    PreflightCheck,
    PreflightTarget,
    TaskEditor,
    TaskExecutor,
)
from bpm.extension_api.entry import (
    EXTENSION_NAMESPACE,
    EntryError,
    module_root,
    resolve,
    split_entry,
)
from bpm.extension_api.http_adapter import AdapterCall, AdapterCaller, AdapterOutcome
from bpm.extension_api.runtime import (
    ESCALATE_CONFIRMATION,
    HOST_BOT_UI,
    HOST_SERVER_RUNNER,
    HOST_STUDIO,
    ExtensionContext,
    ExtensionEvent,
    Mode,
    Secrets,
    Settings,
    TaskContext,
    TaskFailed,
    TaskOutcome,
)

__all__ = [
    "API_VERSION",
    # 수행
    "ESCALATE_CONFIRMATION",
    "ExtensionContext",
    "ExtensionEvent",
    "Mode",
    "HOST_BOT_UI",
    "HOST_SERVER_RUNNER",
    "HOST_STUDIO",
    "Secrets",
    "Settings",
    "TaskContext",
    "TaskFailed",
    "TaskOutcome",
    "review_table",
    # 기여
    "Finding",
    "PreflightCheck",
    "PreflightTarget",
    "SEVERITIES",
    "SEVERITY_BLOCK",
    "SEVERITY_INFO",
    "SEVERITY_WARN",
    "TaskEditor",
    "TaskExecutor",
    # entry 해석
    "EXTENSION_NAMESPACE",
    "EntryError",
    "module_root",
    "resolve",
    "split_entry",
    # HTTP 어댑터 해석기 규격
    "AdapterCall",
    "AdapterCaller",
    "AdapterOutcome",
]
