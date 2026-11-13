"""STU-10 「정보」 — 실행 환경과 오픈소스 고지 (Qt를 모른다 — 창은 `settings_dialog.py`).

**고지는 그 자리에서 모은다** — `bpm-studio`가 기대는 Python 패키지를 설치된 메타데이터에서 따라가
이름·판·라이선스를 읽는다. 손으로 적은 표는 판을 올릴 때마다 낡는다. 묶은 앱에도 dist-info가 함께
들어가므로(PyInstaller) 같은 함수가 돈다. 파이썬 패키지가 아닌 것(캔버스 배포본·글꼴)만 따로 적는다.
"""

from __future__ import annotations

import platform
import re
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, distribution
from pathlib import Path

from bpm.core import build_info

#: 이 앱의 배포 이름 — 고지는 여기서부터 따라간다.
ROOT = "bpm-studio"
#: 우리 것 — 고지에 넣지 않는다.
OURS = re.compile(r"^bpm[-_]", re.IGNORECASE)
#: 라이선스를 메타데이터에서 찾지 못했을 때.
UNKNOWN_LICENSE = "패키지 안의 라이선스 파일"
#: 표 아래 한 줄.
FULL_TEXT = "라이선스 전문은 각 패키지와 함께 설치되어 있습니다."
#: 캔버스 배포본의 판 (`server/web/packages/bpmn-canvas`가 복사하며 적는다).
CANVAS_VERSIONS = Path(__file__).resolve().parent / "web" / "vendor" / "VERSION.txt"
#: 캔버스 배포본 중 고지할 것 — 라이선스는 bpmn.io가 정한 것이다.
CANVAS_LICENSES = {"bpmn-js": "bpmn.io License", "bpmn-auto-layout": "MIT"}
#: 포함한 글꼴 (`bpm.qt` fonts/README.md).
FONTS = (("Pretendard", "1.3.9", "OFL-1.1"), ("JetBrains Mono", "2.304", "OFL-1.1"))
#: `License` 칸이 이보다 길면 전문을 담은 것이라 이름으로 쓰지 않는다.
SHORT_LICENSE = 80

_NAME = re.compile(r"^[A-Za-z0-9._-]+")


@dataclass(frozen=True)
class Notice:
    name: str
    version: str
    license: str


def environment(data_dir: Path) -> list[tuple[str, str]]:
    """「실행 환경」 줄 — `(이름, 값)`."""
    try:
        from PySide6 import __version__ as pyside  # noqa: PLC0415
        from PySide6.QtCore import qVersion  # noqa: PLC0415

        qt = f"{qVersion()} (PySide6 {pyside})"
    except ImportError:  # Qt 없이 부르는 시험
        qt = "-"
    return [
        ("BPM Studio", build_info.product_version(ROOT)),
        ("Python", platform.python_version()),
        ("Qt", qt),
        ("OS", platform.platform()),
        ("데이터 폴더", data_dir.as_posix()),
    ]


def license_of(metadata: object) -> str:
    """메타데이터 → 라이선스 이름. `License-Expression` > 짧은 `License` > 분류자."""
    get = getattr(metadata, "get", None)
    if get is None:
        return UNKNOWN_LICENSE
    expression = (get("License-Expression") or "").strip()
    if expression:
        return expression
    plain = (get("License") or "").strip()
    if plain and "\n" not in plain and len(plain) <= SHORT_LICENSE:
        return plain
    classifiers = getattr(metadata, "get_all", lambda _key: None)("Classifier") or []
    found = [one.split("::")[-1].strip() for one in classifiers if one.startswith("License ::")]
    return " / ".join(found) if found else UNKNOWN_LICENSE


def _requirements(name: str) -> list[str]:
    try:
        requires = distribution(name).requires or []
    except PackageNotFoundError:
        return []
    # 고르는 기능(extra)으로만 들어오는 것은 이 앱이 쓰지 않는다. 다른 OS의 것은 설치되지 않아 아래에서 빠진다.
    picked = [one for one in requires if "extra ==" not in one.replace('"', "").replace("'", "")]
    return [match.group(0) for one in picked if (match := _NAME.match(one.strip()))]


def python_notices(root: str = ROOT) -> list[Notice]:
    """`root`가 기대는 Python 패키지 (우리 것은 따라가되 고지에 넣지 않는다). 이름 순."""
    seen: set[str] = set()
    found: dict[str, Notice] = {}
    waiting = [root]
    while waiting:
        name = waiting.pop()
        key = re.sub(r"[-_.]+", "-", name).lower()
        if key in seen:
            continue
        seen.add(key)
        try:
            dist = distribution(name)
        except PackageNotFoundError:
            continue
        if not OURS.match(key):
            shown = dist.metadata.get("Name") or name
            found[key] = Notice(shown, dist.version, license_of(dist.metadata))
        waiting.extend(_requirements(name))
    return sorted(found.values(), key=lambda one: one.name.lower())


def other_notices(versions: Path = CANVAS_VERSIONS) -> list[Notice]:
    """파이썬 패키지가 아닌 것 — 캔버스 배포본(판은 `VERSION.txt`)과 글꼴."""
    try:
        lines = versions.read_text(encoding="utf-8").splitlines()
    except OSError:
        lines = []
    canvas = {}
    for line in lines:
        parts = line.split()
        if len(parts) >= 2 and parts[0] in CANVAS_LICENSES:
            canvas[parts[0]] = parts[1]
    shown = [Notice(name, canvas.get(name, "-"), license) for name, license in CANVAS_LICENSES.items()]
    return shown + [Notice(name, version, license) for name, version, license in FONTS]


def notices() -> list[Notice]:
    return python_notices() + other_notices()


__all__ = [
    "FULL_TEXT",
    "UNKNOWN_LICENSE",
    "Notice",
    "environment",
    "license_of",
    "notices",
    "other_notices",
    "python_notices",
]
