"""확장을 엔진에 꽂는 규칙 (`HostTasks`, ADR-0018).

규칙만 본다 — 없는 태스크 종류는 `None`이다. (진짜 확장 한 바퀴는 그 확장이 들어올 때 다시
둔다 — ADR-0114.) **Studio가 비밀을 푸는 쪽은 Qt와 함께 걷었다** (ADR-0143, M11 조각 5) —
서버 쪽 확장 설정은 환경변수뿐이다 (`server/CLAUDE.md`).
"""

from __future__ import annotations

from bpm.core.extensions import HostTasks, load_host


def test_host_tasks_say_none_for_an_unknown_task_type() -> None:
    tasks = HostTasks(host=load_host(), make_context=lambda _: None)  # type: ignore[arg-type,return-value]
    assert tasks.executor("없는_태스크") is None, "엔진이 그림·설치 오류로 올린다 (LookupError가 아니다)"
