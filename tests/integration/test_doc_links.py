"""문서 안의 상대 링크가 정말 있는 파일을 가리키는가 (ADR-0129 3번).

문서를 제품 폴더로 나누면서 링크가 한 단계씩 어긋나는 일이 잦아졌다 — 눈으로는 안 보이고 누를 때야
안다. 그래서 저장소의 Markdown 파일(실험 `spikes/`는 빼고)을 모두 읽어 상대 링크의 **파일 자리**만
본다. `#…` 조각(제목 앵커)은 보지 않는다 — 제목 글을 고칠 때마다 깨지는 것까지 막으면 문서를 못 고친다.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: `[글](대상)` — 대상에 빈칸이 없는 것만 (코드 블록 안의 괄호 글과 섞이지 않게).
LINK = re.compile(r"\]\(([^)\s]+)\)")
FENCE = re.compile(r"^```.*?^```", re.S | re.M)

#: 일부러 남긴 끊긴 링크 — ADR은 그때의 기록이라 고치지 않는다. 계약 C8·C9는 UI 자동화 확장과 함께
#: 지웠다 (ADR-0114).
GONE = {
    ("docs/decisions/0040-registry-storage-sqlite.md", "../03-contracts/C9-ui-page-registry.md"),
    ("docs/decisions/0040-registry-storage-sqlite.md", "../03-contracts/C8-ui-automation-plan-heal-report.md"),
}


def markdown_files() -> list[Path]:
    listed = subprocess.run(
        ["git", "ls-files", "*.md"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True
    ).stdout.splitlines()
    return [ROOT / name for name in listed if not name.startswith("spikes/")]


def broken_links(path: Path) -> list[str]:
    text = FENCE.sub("", path.read_text(encoding="utf-8"))
    found = []
    for target in LINK.findall(text):
        if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
            continue
        place = target.split("#", 1)[0]
        if place and not (path.parent / place).exists():
            if (path.relative_to(ROOT).as_posix(), target) not in GONE:
                found.append(target)
    return found


def test_every_relative_link_points_at_a_file() -> None:
    files = markdown_files()
    assert len(files) > 100, "문서를 찾는 길이 틀렸다"
    broken = {
        path.relative_to(ROOT).as_posix(): links for path in files if (links := broken_links(path))
    }
    assert broken == {}, "\n".join(f"{name}: {links}" for name, links in sorted(broken.items()))


def test_the_known_gone_links_are_still_gone() -> None:
    """남긴 줄이 되살아나면(파일이 다시 생기거나 링크를 고치면) 목록에서 지운다."""
    for name, target in GONE:
        path = ROOT / name
        assert target in path.read_text(encoding="utf-8"), f"{name}에 그 링크가 없다 — GONE에서 지운다"
        assert not (path.parent / target).exists(), f"{target}이 다시 있다 — GONE에서 지운다"


def test_every_adr_is_in_the_index() -> None:
    """ADR 목록이 **빠짐없이** 있는가 (`docs/decisions/README.md`).

    목록은 「지금까지 내린 결정」을 한눈에 보는 자리인데, 새 ADR을 쓰면서 줄 더하기를 잊으면
    **조용히 빠진다** — 셋이 그렇게 빠져 있었다 (ADR-0125·0126·0127). 파일과 목록을 대조한다.
    """
    index = (ROOT / "docs" / "decisions" / "README.md").read_text(encoding="utf-8")
    listed = set(re.findall(r"^\| \[(\d{4})\]", index, re.M))
    files = {path.name[:4] for path in (ROOT / "docs" / "decisions").glob("[0-9]*.md")}
    assert files - listed == set(), f"목록에 없는 ADR: {sorted(files - listed)}"
    assert listed - files == set(), f"파일이 없는 줄: {sorted(listed - files)}"
