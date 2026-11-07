"""작업 표시줄 아이콘 — Studio가 Python 아이콘으로 보이지 않게 (스타일 가이드 §6).

창 아이콘(`setWindowIcon`)만으로는 모자란다.

- **Windows**: `python.exe`로 뜨면 작업 표시줄이 그 실행 파일의 아이콘을 쓴다. 앱 사용자 모델 id를
  따로 주면 창 아이콘을 쓴다 — **창을 만들기 전에** 준다.
- **Linux(Wayland)**: 패널이 창의 app_id로 `.desktop` 파일을 찾아 그 `Icon`을 쓴다. app_id는
  `QGuiApplication.desktopFileName`이고 주지 않으면 실행 파일 이름(`python3`)이다. 그래서 이름을
  `bpm-studio`로 주고, 사용자 데이터 폴더에 그 파일과 아이콘이 **없을 때만** 써 둔다.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import TYPE_CHECKING

import platformdirs

if TYPE_CHECKING:
    from PySide6.QtGui import QIcon
    from PySide6.QtWidgets import QApplication

LOG = logging.getLogger(__name__)

#: Linux `.desktop` 파일 이름(= Wayland app_id).
DESKTOP_NAME = "bpm-studio"
#: Windows 앱 사용자 모델 id.
WINDOWS_APP_ID = "BPM.Studio"
#: `.desktop`에 쓰는 아이콘 크기 (아이콘 원본이 128px이다).
DESKTOP_ICON_SIZE = 128


def before_app() -> None:
    """QApplication을 만들기 전에 — Windows에서 작업 표시줄이 창 아이콘을 쓰게 한다."""
    if sys.platform == "win32":
        import ctypes  # noqa: PLC0415

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(WINDOWS_APP_ID)


def after_app(app: QApplication, window_icon: QIcon) -> None:
    """QApplication을 만든 뒤, 창을 띄우기 전에 — Linux에서 app_id를 주고 `.desktop`을 써 둔다."""
    app.setDesktopFileName(DESKTOP_NAME)
    if sys.platform == "linux":
        try:
            register_desktop_entry(platformdirs.user_data_path(), window_icon)
        except OSError as error:  # 못 써도 Studio는 뜬다 — 아이콘만 Python 것으로 남는다
            LOG.warning("작업 표시줄 아이콘을 등록하지 못했습니다: %s", error)


def register_desktop_entry(data_home: Path, window_icon: QIcon) -> Path:
    """`<data_home>/applications/bpm-studio.desktop`과 그 아이콘을 **없을 때만** 쓴다. 파일 경로를 돌려준다."""
    picture = data_home / "icons" / f"{DESKTOP_NAME}.png"
    if not picture.exists():
        picture.parent.mkdir(parents=True, exist_ok=True)
        window_icon.pixmap(DESKTOP_ICON_SIZE).save(str(picture), "PNG")
    entry = data_home / "applications" / f"{DESKTOP_NAME}.desktop"
    if not entry.exists():
        entry.parent.mkdir(parents=True, exist_ok=True)
        entry.write_text(desktop_entry(launch_command(), picture), encoding="utf-8")
    return entry


def launch_command() -> list[str]:
    """Studio를 다시 띄우는 명령 — 묶은 실행 파일이면 그것, 아니면 지금 파이썬으로 `-m bpm.studio`."""
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, "-m", "bpm.studio"]


def desktop_entry(command: list[str], picture: Path) -> str:
    exec_line = " ".join(f'"{part}"' if " " in part else part for part in command)
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=BPM Studio\n"
        f"Exec={exec_line}\n"
        f"Icon={picture.as_posix()}\n"
        f"StartupWMClass={DESKTOP_NAME}\n"
        "Categories=Development;\n"
        "Terminal=false\n"
    )


__all__ = ["DESKTOP_NAME", "WINDOWS_APP_ID", "after_app", "before_app", "desktop_entry", "register_desktop_entry"]
