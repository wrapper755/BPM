"""옛 이름(Chaeksas)으로 남은 것을 옮긴다 (ADR-0130, `core.legacy_names`)."""

from __future__ import annotations

from pathlib import Path

import pytest

from bpm.core import legacy_names


def test_an_old_folder_moves_to_the_new_name(tmp_path: Path) -> None:
    old, new = tmp_path / "chaeksas" / "bot-ui", tmp_path / "bpm" / "bot-ui"
    old.mkdir(parents=True)
    (old / "settings.json").write_text("{}", encoding="utf-8")
    assert legacy_names.adopt_dir(new, old) == new
    assert (new / "settings.json").read_text(encoding="utf-8") == "{}"
    assert not old.exists(), "복사가 아니라 옮긴다 — 두 벌이 남으면 어느 쪽이 원본인지 모른다"


def test_a_new_folder_wins_and_the_old_one_is_left_alone(tmp_path: Path) -> None:
    old, new = tmp_path / "old", tmp_path / "new"
    old.mkdir()
    new.mkdir()
    assert legacy_names.adopt_dir(new, old) == new
    assert old.exists()


def test_nothing_to_move_gives_the_new_place(tmp_path: Path) -> None:
    assert legacy_names.adopt_dir(tmp_path / "new", tmp_path / "old") == tmp_path / "new"
    assert not (tmp_path / "new").exists(), "만드는 것은 부르는 쪽의 일이다"


def test_a_folder_that_cannot_move_is_used_where_it_is(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    old, new = tmp_path / "old", tmp_path / "new"
    old.mkdir()

    def refuse(self: Path, target: Path) -> Path:
        raise PermissionError("쥐고 있다")

    monkeypatch.setattr(Path, "rename", refuse)
    assert legacy_names.adopt_dir(new, old) == old


def test_moving_one_app_leaves_the_other_apps_folder(tmp_path: Path) -> None:
    """Windows는 대소문자를 가리지 않아 앱들이 윗 폴더를 나눠 쓴다 — 제 폴더만 옮긴다."""
    root = tmp_path / "chaeksas"
    (root / "bot-ui").mkdir(parents=True)
    (root / "Chaeksas" / "studio").mkdir(parents=True)
    legacy_names.adopt_dir(tmp_path / "bpm" / "bot-ui", root / "bot-ui")
    assert (root / "Chaeksas" / "studio").is_dir()


class FakeKeyring:
    def __init__(self, items: dict[tuple[str, str], str]) -> None:
        self.items = dict(items)

    def get_password(self, service: str, name: str) -> str | None:
        return self.items.get((service, name))

    def set_password(self, service: str, name: str, value: str) -> None:
        self.items[(service, name)] = value

    def delete_password(self, service: str, name: str) -> None:
        del self.items[(service, name)]


def test_an_old_secret_moves_to_the_new_service() -> None:
    backend = FakeKeyring({("chaeksas-bot-ui", "center_api_key"): "k"})
    assert legacy_names.take_old_secret(backend, "bpm-bot-ui", "center_api_key") == "k"
    assert backend.items == {("bpm-bot-ui", "center_api_key"): "k"}


def test_no_old_secret_is_none() -> None:
    backend = FakeKeyring({})
    assert legacy_names.take_old_secret(backend, "bpm-studio", "center_api_key") is None
    assert legacy_names.take_old_secret(backend, "모르는-서비스", "x") is None


def test_every_new_service_name_has_its_old_name() -> None:
    """세 앱의 서비스 이름이 옮기는 표에 있어야 옛 키를 찾는다."""
    from bpm.bot_ui.credentials import SERVICE as BOT  # noqa: PLC0415
    from bpm.server_runner.credentials import SERVICE as RUNNER  # noqa: PLC0415
    from bpm.studio.credentials import SERVICE as STUDIO  # noqa: PLC0415

    assert set(legacy_names.OLD_KEYRING_SERVICES) == {BOT, RUNNER, STUDIO}


def test_the_bot_ui_reads_a_key_left_under_the_old_name(monkeypatch: pytest.MonkeyPatch) -> None:
    from bpm.bot_ui.credentials import Credentials  # noqa: PLC0415

    backend = FakeKeyring({("chaeksas-bot-ui", "center_api_key"): "k"})
    monkeypatch.delenv("BPM_BOT_UI__CENTER_API_KEY", raising=False)
    monkeypatch.setattr(Credentials, "_keyring", lambda self: backend)
    assert Credentials().center_api_key() == "k"
    assert ("bpm-bot-ui", "center_api_key") in backend.items


def test_an_old_desktop_autostart_is_taken_over(tmp_path: Path) -> None:
    from bpm.bot_ui.autostart import DESKTOP_FILE, FreedesktopAutostart  # noqa: PLC0415

    (tmp_path / legacy_names.OLD_AUTOSTART_DESKTOP_FILE).write_text("[Desktop Entry]\n", encoding="utf-8")
    entry = FreedesktopAutostart(directory=tmp_path, command=["bpm-bot-ui"])
    assert entry.take_old() is True
    assert not (tmp_path / legacy_names.OLD_AUTOSTART_DESKTOP_FILE).exists()
    assert (tmp_path / DESKTOP_FILE).is_file()
    assert entry.take_old() is False, "두 번째는 할 일이 없다"
