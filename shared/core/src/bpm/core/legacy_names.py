"""옛 이름(Chaeksas)으로 현장에 남은 것을 새 이름(BPM)으로 한 번 옮긴다 (ADR-0130).

이름을 바꾸면 이미 깔린 PC의 데이터 폴더·OS 비밀 저장소의 키·자동 시작 등록이 옛 이름에 남는다.
새 판이 처음 뜰 때 여기서 옮긴다 — **옛 이름은 이 파일에만 적는다**. 옛 판이 깔린 현장이 없어지면
이 파일과 부르는 자리를 함께 걷는다.

- 폴더는 **앱마다 제 폴더를** 통째로 옮긴다(복사하지 않는다 — 두 벌이 생기면 어느 쪽이 원본인지 모른다).
  윗 폴더째 옮기지 않는다 — Windows는 대소문자를 가리지 않아 Studio(`BPM\\BPM`)와 PC 실행기(`bpm`)가 윗 폴더를
  나눠 쓰므로, 먼저 뜬 앱이 남의 폴더까지 가져가 다른 앱이 빈 폴더로 뜬다.
  못 옮기면(파일을 쥔 프로세스가 있다) 옛 자리를 그대로 쓰고 로그에 남긴다.
- 키는 새 이름에서 찾지 못했을 때만 옛 이름에서 찾고, 찾으면 새 이름에 쓰고 옛 것을 지운다.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

#: `platformdirs.user_data_dir`에 주던 옛 이름 — PC 실행기·서버 실행기 (`appauthor=False`).
OLD_DATA_NAME = "chaeksas"
#: Studio가 주던 옛 이름·작성자 (`user_data_dir(APP_NAME, APP_AUTHOR)`).
OLD_STUDIO_DATA = ("Chaeksas", "Chaeksas")

#: OS 비밀 저장소의 서비스 이름 — 새 이름 → 옛 이름.
OLD_KEYRING_SERVICES = {
    "bpm-bot-ui": "chaeksas-bot-ui",
    "bpm-studio": "chaeksas-studio",
    "bpm-server-runner": "chaeksas-server-runner",
}

#: PC 실행기 자동 시작의 옛 이름 — 작업 스케줄러 작업 이름, XDG `.desktop` 파일 이름.
OLD_AUTOSTART_TASK = "Chaeksas PC 실행기"
OLD_AUTOSTART_DESKTOP_FILE = "chaeksas-bot-ui.desktop"


def adopt_dir(new: Path, old: Path) -> Path:
    """쓸 폴더. 새 자리가 없고 옛 자리가 있으면 옛 것을 새 이름으로 옮긴다."""
    if new.exists() or not old.exists():
        return new
    try:
        new.parent.mkdir(parents=True, exist_ok=True)
        old.rename(new)
    except OSError as exc:
        log.warning("옛 데이터 폴더를 옮기지 못해 그대로 씁니다 (%s → %s): %s", old, new, exc)
        return old
    log.info("옛 데이터 폴더를 옮겼습니다: %s → %s", old, new)
    return new


def take_old_secret(backend: Any, service: str, name: str) -> str | None:
    """새 서비스 이름에 없던 비밀을 옛 이름에서 꺼내 새 이름으로 옮긴다. 없으면 `None`."""
    old = OLD_KEYRING_SERVICES.get(service)
    if old is None:
        return None
    try:
        value = backend.get_password(old, name)
    except Exception:  # noqa: BLE001 — 옛 자리를 못 읽으면 없는 것으로 본다
        return None
    if value is None:
        return None
    try:
        backend.set_password(service, name, value)
        backend.delete_password(old, name)
    except Exception as exc:  # noqa: BLE001 — 옮기지 못해도 값은 쓴다(옛 자리에 남는다)
        log.warning("옛 비밀 저장소 항목을 옮기지 못했습니다 (%s/%s): %s", old, name, exc)
    return str(value)


__all__ = [
    "OLD_AUTOSTART_DESKTOP_FILE",
    "OLD_AUTOSTART_TASK",
    "OLD_DATA_NAME",
    "OLD_KEYRING_SERVICES",
    "OLD_STUDIO_DATA",
    "adopt_dir",
    "take_old_secret",
]
