"""STU-10 「정보」 — 실행 환경과 오픈소스 고지는 그 자리에서 모은다 (`runtime_info.py`)."""

from __future__ import annotations

from email.message import Message
from pathlib import Path

from bpm.studio import runtime_info
from bpm.studio.runtime_info import UNKNOWN_LICENSE, license_of


def _metadata(**fields: str | list[str]) -> Message:
    found = Message()
    for key, value in fields.items():
        for one in value if isinstance(value, list) else [value]:
            found[key.replace("_", "-")] = one
    return found


def test_the_license_expression_wins_then_a_short_license_then_classifiers() -> None:
    assert license_of(_metadata(License_Expression="MIT", License="BSD")) == "MIT"
    assert license_of(_metadata(License="BSD-3-Clause")) == "BSD-3-Clause"
    classified = _metadata(License="전문 " * 40, Classifier=["License :: OSI Approved :: MIT License"])
    assert license_of(classified) == "MIT License"
    assert license_of(_metadata()) == UNKNOWN_LICENSE


def test_notices_follow_what_studio_depends_on_without_our_own() -> None:
    """설치된 메타데이터에서 따라간다 — Qt는 들어가고 우리 `bpm-*`는 빠진다."""
    names = [one.name.lower() for one in runtime_info.python_notices()]
    assert any(name.startswith("pyside6") for name in names)
    assert "httpx" in names
    assert not [name for name in names if name.startswith("bpm")]
    assert names == sorted(names)


def test_the_canvas_and_fonts_are_listed_with_their_versions(tmp_path: Path) -> None:
    versions = tmp_path / "VERSION.txt"
    versions.write_text("bpmn-js 18.31.0\nbpmn-auto-layout 1.3.0 (묶었다)\n이 폴더는 생성물이다\n", encoding="utf-8")
    shown = {one.name: one.version for one in runtime_info.other_notices(versions)}
    assert shown["bpmn-js"] == "18.31.0" and shown["bpmn-auto-layout"] == "1.3.0"
    assert {"Pretendard", "JetBrains Mono"} <= set(shown)


def test_the_environment_names_the_data_folder(tmp_path: Path) -> None:
    rows = dict(runtime_info.environment(tmp_path))
    assert list(rows) == ["BPM Studio", "Python", "Qt", "OS", "데이터 폴더"]
    assert rows["데이터 폴더"] == tmp_path.as_posix()
