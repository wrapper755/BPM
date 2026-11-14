"""실제 Studio가 확장을 엔진에 꽂는다 (`HostTasks`, ADR-0018).

규칙만 본다 — 없는 태스크 종류는 `None`, Studio가 확장의 비밀을 푼다. (진짜 확장 한 바퀴는
그 확장이 들어올 때 다시 둔다 — ADR-0114.)
"""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from bpm.core.extensions import HostTasks, load_host  # noqa: E402
from bpm.studio.extensions import StudioSecrets  # noqa: E402


def test_host_tasks_say_none_for_an_unknown_task_type() -> None:
    tasks = HostTasks(host=load_host(), make_context=lambda _: None)  # type: ignore[arg-type,return-value]
    assert tasks.executor("없는_태스크") is None, "엔진이 그림·설치 오류로 올린다 (LookupError가 아니다)"


def test_studio_resolves_extension_secrets_from_the_environment_first(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BPM_STUDIO__EXT__CRM__NOTE", "from-env")
    assert StudioSecrets(extension_id="crm").resolve("note") == "from-env"
