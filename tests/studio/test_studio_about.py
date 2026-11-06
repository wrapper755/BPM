"""STU-01 도움말 → 「정보...」 — 판은 빌드가 찍은 것을 읽는다 (ADR-0067)."""

from __future__ import annotations

from bpm.core.build_info import Stamp
from bpm.studio.about_dialog import FROM_SOURCE, rows


def test_a_stamped_build_shows_its_version_commit_and_time() -> None:
    stamp = Stamp(version="0.13.0", commit="3d691b09", built_at="2026-11-06T10:00:00Z")
    assert rows(stamp, "0.0.0") == [("판", "0.13.0"), ("커밋", "3d691b09"), ("빌드한 때", "2026-11-06T10:00:00Z")]


def test_a_source_run_says_there_is_no_stamp() -> None:
    """묶지 않은 것에는 커밋·빌드한 때가 없다 — 지어내지 않고 그렇게 말한다."""
    assert rows(None, "0.1.0") == [("판", "0.1.0"), ("", FROM_SOURCE)]

