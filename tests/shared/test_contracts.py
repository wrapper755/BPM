"""계약 모델의 호환 규칙과 검사 규칙.

여기서 지키는 것은 대부분 **프로토타입에서 실제로 났던 사고**다 (계약 README "이미 알려진 결함").
"""

from __future__ import annotations

import re
from typing import Any

import pytest
from pydantic import ValidationError

from bpm.contracts import (
    Built,
    HumanNeeds,
    Manifest,
    Requires,
    RunEvent,
    ServiceAppNeed,
    TaskTypeNeed,
    Trigger,
    missing_data_keys,
    missing_keys,
    validate,
)
from bpm.contracts.manifest import KNOWN_BUILT_BY, KNOWN_SETTINGS, KNOWN_TRIGGER_KINDS

HASH = "sha256:" + "ab" * 32
TS = "2026-10-01T10:00:00+09:00"


def manifest(**over: Any) -> Manifest:
    """최소한으로 올바른 bpm_process 매니페스트."""
    base: dict[str, Any] = {
        "schema": 1,
        "kind": "bpm_process",
        "id": "finance.invoice-issue",
        "version": "1.0.0",
        "entry": "process/main.bpmn",
        "process_id": "invoice_issue",
        "requires": {},
        "human": {},
        "built": {"by": "studio", "at": TS, "core": "0.3.0", "spec_version": 1},
        "content_hash": HASH,
    }
    return Manifest.model_validate(base | over)


def event(**over: Any) -> RunEvent:
    base: dict[str, Any] = {
        "schema": 1,
        "run_id": "run_20261001_101500_a1b2c3",
        "seq": 1,
        "ts": TS,
        "kind": "log",
        "data": {"level": "info", "message": "x"},
    }
    return RunEvent.model_validate(base | over)


# ─────────────── 호환 규칙 (README 원칙 2~4) ───────────────


def test_unknown_optional_field_is_kept_not_rejected() -> None:
    """원칙 3 — 모르는 선택 필드는 거부하지 않고 **보관**한다."""
    e = RunEvent.model_validate(
        {"schema": 1, "run_id": "run_20261001_101500_a1b2c3", "seq": 1, "ts": TS,
         "kind": "log", "data": {"level": "info", "message": "x"}, "future_field": {"a": 1}}
    )
    assert e.to_json_dict()["future_field"] == {"a": 1}


def test_higher_schema_is_rejected() -> None:
    """원칙 2 — 더 높은 schema는 거부한다 (아는 필드의 뜻이 바뀌었을 수 있다)."""
    with pytest.raises(ValidationError, match="모르는"):
        event(schema=2)


def test_missing_required_field_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RunEvent.model_validate({"schema": 1, "seq": 1, "ts": TS, "kind": "log"})  # run_id 없음


def test_json_key_is_schema_not_schema_version() -> None:
    assert "schema" in event().to_json_dict()
    assert "schema_version" not in event().to_json_dict()


def test_naive_timestamp_is_rejected() -> None:
    """시간대 없는 시각은 받지 않는다 (PC와 서버의 시간대가 다르다)."""
    with pytest.raises(ValidationError, match="시간대"):
        event(ts="2026-10-01T10:00:00")


def test_bad_run_id_is_rejected() -> None:
    with pytest.raises(ValidationError):
        event(run_id="run_1")


def test_studio_test_run_id_is_accepted() -> None:
    assert event(run_id="test_20261001_101500_a1b2c3").run_id.startswith("test_")


# ─────────────── C3: kind는 열린 문자열 ───────────────


def test_unknown_event_kind_is_accepted() -> None:
    """모르는 `kind` 하나를 거부하면 seq가 단조라서 그 실행의 기록이 영원히 막힌다."""
    e = event(kind="something_new_in_v2", data={})
    assert e.kind == "something_new_in_v2"
    assert missing_data_keys(e) == []  # 모르는 종류는 data를 검사하지 않는다


def test_known_kind_missing_data_keys_are_reported() -> None:
    e = event(kind="run_finished", data={"status": "success"})
    assert missing_data_keys(e) == [
        "ai_tasks", "duration_s", "human_requests", "replayed_tasks", "service_calls"
    ]


def test_known_kind_with_all_keys_passes() -> None:
    e = event(
        kind="run_finished",
        data={"status": "success", "duration_s": 12, "ai_tasks": 1, "replayed_tasks": 0,
              "service_calls": 2, "human_requests": 0},
    )
    assert missing_data_keys(e) == []


def test_missing_keys_looks_at_a_line_before_it_is_one() -> None:
    """엔진이 확장의 `{kind, data}`를 **줄이 되기 전에** 본다 (ADR-0041) — 같은 규칙이다."""
    assert missing_keys("something_new_in_v2", {}) == []
    assert missing_keys("human_requested", {"layer": "approval"}) == ["request_id", "where"]
    assert missing_keys("log", {"level": "warn", "message": "한 줄"}) == []


# ─────────────── C1: 검사 규칙 ───────────────


def test_r1_missing_entry_is_caught() -> None:
    m = Manifest.model_validate(
        {"schema": 1, "kind": "bpm_process", "id": "a", "version": "1.0.0", "requires": {},
         "human": {}, "built": {"by": "studio", "at": TS, "core": "0.3.0", "spec_version": 1},
         "content_hash": HASH}
    )
    v = validate(m)
    assert [x.rule for x in v] == ["R1"]
    assert v[0].items == ["entry", "process_id"]


def test_r2_web_and_desktop_ai_tasks_are_caught() -> None:
    """R2 — 서버에서 할 수 없는 것 (웹·데스크톱 AI 태스크, ADR-0114·ADR-0144)."""
    m = manifest(requires=Requires(domains=["llm", "web"]))
    v = validate(m)
    assert len(v) == 1
    assert v[0].code == "server_incompatible"
    assert v[0].items == ["domains:web"]


def test_r2_says_nothing_about_people_or_task_types() -> None:
    """확인·결재는 **Center 결재함**에서 답하고(ADR-0144) 확장 태스크는 서버에서 돈다."""
    m = manifest(
        requires=Requires(task_types=[TaskTypeNeed(id="ocr_task", extension="doc-ocr")]),
        human=HumanNeeds(approval_center=True, confirmation=True),
    )
    assert validate(m) == []


def test_an_old_packages_key_refs_are_read_and_not_looked_at() -> None:
    """R4는 없다 (ADR-0102) — 옛 패키지의 `key_ref`·`task_key_refs`는 모르는 칸으로 받아 둔다 (원칙 3)."""
    need = ServiceAppNeed.model_validate(
        {"app_id": "a", "operations": ["x"], "key_ref": "Bad Ref", "task_key_refs": ["chk_x"]})
    assert validate(manifest(requires=Requires(service_apps=[need]))) == []
    assert ServiceAppNeed(app_id="a", operations=["x"]).to_json_dict() == {"app_id": "a", "operations": ["x"]}


def test_r6_hash_mismatch_is_caught_only_when_computed() -> None:
    m = manifest()
    assert validate(m) == []
    v = validate(m, computed_hash="sha256:" + "cd" * 32)
    assert [x.code for x in v] == ["hash_mismatch"]


def test_r6_with_real_package_hash(tmp_path: Any) -> None:
    """C1 R6 + C2 해시 — 패키지 실물에서 계산한 값으로 검사한다 (더 이상 조건부가 아니다)."""
    import json
    from pathlib import Path

    from bpm.contracts import content_hash_dir

    root = Path(tmp_path) / "pkg"
    (root / "process").mkdir(parents=True)
    (root / "process" / "main.bpmn").write_bytes(b"<definitions/>")
    body = manifest().to_json_dict()
    (root / "manifest.json").write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")

    # 해시를 계산해 매니페스트에 적어 넣으면 통과한다.
    real = content_hash_dir(root)
    m = Manifest.model_validate(body | {"content_hash": real})
    assert validate(m, computed_hash=real) == []

    # 파일 하나를 고치면 해시가 달라지고 R6이 잡는다.
    (root / "process" / "main.bpmn").write_bytes(b"<definitions changed=''/>")
    v = validate(m, computed_hash=content_hash_dir(root))
    assert [x.code for x in v] == ["hash_mismatch"]


def test_r9_a_trigger_kind_outside_the_contract_is_caught() -> None:
    """실제로 났던 일 — Studio가 `schedule`·`manual`을 올렸고 **아무도 몰랐다**.

    읽는 쪽은 `timer`를 기다리며 영영 못 만났다. 경고가 아니라 막는다 (C1 R9).
    """
    v = validate(manifest(triggers=[Trigger(kind="schedule"), Trigger(kind="manual")]))
    assert [x.rule for x in v] == ["R9"]
    assert v[0].code == "unknown_trigger_kind"
    assert v[0].items == ["manual", "schedule"]
    assert v[0].blocks


def test_r9_passes_every_kind_the_contract_lists() -> None:
    # 타이머에는 식이 있어야 한다 — 그것은 R13이 본다 (ADR-0110).
    kinds = [Trigger(kind=k, expression="0 9 * * *" if k == "timer" else None) for k in sorted(KNOWN_TRIGGER_KINDS)]
    assert validate(manifest(triggers=kinds)) == []


def test_r11_a_setting_outside_the_contract_is_caught() -> None:
    """**R9와 같은 까닭이다** — `requires.settings`는 그림에서 기계가 옮기는 값이다.

    모르는 이름이 들어오면 「이 호스트가 갖췄나」 점검이 **아무 말 없이 지나가** 준비되지
    않은 BPM 프로세스가 실행되고 그 태스크에서 죽는다 (`core.preflight`). R9를 만들기 전
    `triggers[].kind`가 겪은 그 꼴이다.
    """
    v = validate(manifest(requires=Requires(settings=["smtp", "mailgun", "ftp"])))
    assert [(x.rule, x.code) for x in v] == [("R11", "unknown_setting")]
    assert v[0].items == ["ftp", "mailgun"] and v[0].blocks


def test_r11_passes_every_setting_the_contract_lists() -> None:
    """지금 Studio가 넣는 것은 `smtp` 하나뿐이라 **올라간 패키지는 다 지난다**."""
    assert validate(manifest(requires=Requires(settings=sorted(KNOWN_SETTINGS)))) == []
    assert validate(manifest()) == [], "적지 않은 것은 규칙이 입을 닫는다"


def test_built_by_stays_an_open_string() -> None:
    """**`built.by`는 검사하지 않는다** — 남의 도구로 만든 올바른 패키지를 거부하게 된다.

    `settings`와 다른 자리다: 그쪽은 **우리가 아는 것만 점검할 수 있어** R11이 막는다.
    """
    assert validate(manifest(built=Built(by="남의도구", at=TS, core="0.1.0", spec_version=1))) == []
    assert "cli" in KNOWN_BUILT_BY, "목록은 화면이 풀어 쓸 때 쓴다"


def test_r12_a_bot_does_not_delegate_to_itself() -> None:
    """**자기 자신에게 맡기지 않는다** (R12, ADR-0082) — 끝나지 않는 되부름이다.

    그림은 자기 패키지 id를 모르므로 매니페스트가 본다 (`id`와 `requires.delegations`가 한 자리다).
    """
    me = manifest()
    v = validate(manifest(requires=Requires(delegations=[f"{me.id}@1.0.0", "other.bot"])))
    assert [(x.rule, x.code) for x in v] == [("R12", "delegation_to_self")]
    assert v[0].items == [f"{me.id}@1.0.0"]


def test_a_delegation_can_leave_the_version_open() -> None:
    """판을 비우면 **배포된 판**이라는 뜻이다 (C14 — 작업 지시와 같은 규칙)."""
    m = manifest(requires=Requires(delegations=["fin.erp-input"]))
    assert validate(m) == []
    assert m.requires.delegations == ["fin.erp-input"]


def test_the_trigger_kinds_are_the_ones_the_contract_document_lists() -> None:
    """**문서가 원본이다** (CLAUDE.md §3-3) — C1의 표와 `KNOWN_TRIGGER_KINDS`를 대조한다.

    한쪽만 늘리면 여기가 깨진다. 갈라졌던 것을 다시 갈라지게 두지 않는다.
    """
    from pathlib import Path

    doc = (Path(__file__).resolve().parents[2] / "docs" / "03-contracts"
           / "C1-package-manifest.md").read_text(encoding="utf-8")
    row = next(line for line in doc.splitlines() if line.startswith("| Trigger |"))
    listed = set(re.findall(r"`([a-z]+)`", row.split("`kind`:")[1].split(", `name`")[0]))
    assert listed == set(KNOWN_TRIGGER_KINDS)

    # 칸마다 뜻이 다르다 — 표가 `name`·`expression`을 가르고 있는가 (타이머 식은 `name`이 아니다).
    assert {"`name`", "`expression`"} <= set(row.replace("(", " ").replace(")", " ").split())


def test_a_timer_expression_does_not_land_in_the_message_name_field() -> None:
    """C12 메시지 API가 `triggers[].name`을 메시지 이름으로 읽는다 — 식을 거기 담지 않는다."""
    timer = Trigger(kind="timer", expression="0 9 1 * *")
    assert timer.name is None
    assert timer.to_json_dict() == {"kind": "timer", "expression": "0 9 1 * *"}


def test_bad_semver_and_id_are_rejected_by_the_type() -> None:
    with pytest.raises(ValidationError):
        manifest(version="1.0")
    with pytest.raises(ValidationError):
        manifest(id="Finance.Invoice")  # 대문자


def test_content_hash_must_be_full_sha256() -> None:
    with pytest.raises(ValidationError):
        manifest(content_hash="sha256:abc")


def test_built_at_requires_timezone() -> None:
    with pytest.raises(ValidationError, match="시간대"):
        manifest(built=Built.model_validate(
            {"by": "studio", "at": "2026-10-01T10:00:00", "core": "0.3.0", "spec_version": 1}))


# ─────────────── 생성물 ───────────────


def test_generated_json_schemas_are_current() -> None:
    """모델을 고치고 `scripts/gen_schemas.py`를 다시 돌리지 않으면 여기가 깨진다 (원칙 5)."""
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    r = subprocess.run(
        [sys.executable, str(root / "scripts" / "gen_schemas.py"), "--check"],
        capture_output=True, text=True, cwd=root,
    )
    assert r.returncode == 0, f"스키마가 모델과 다르다 — gen_schemas.py를 다시 돌려라\n{r.stdout}{r.stderr}"


def test_generated_console_pages_are_current() -> None:
    """확장 정의의 `console.pages`를 고치고 `scripts/gen_console_pages.py`를 다시 돌리지 않으면
    여기가 깨진다 (ADR-0042 §2 — 콘솔이 손으로 베낀 목록을 쓰지 않는다)."""
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    r = subprocess.run(
        [sys.executable, str(root / "scripts" / "gen_console_pages.py"), "--check"],
        capture_output=True, text=True, cwd=root,
    )
    assert r.returncode == 0, (
        f"콘솔 화면 목록이 확장 정의와 다르다 — gen_console_pages.py를 다시 돌려라\n{r.stdout}{r.stderr}"
    )


def test_generated_design_tokens_are_current() -> None:
    """토큰을 고치고 `scripts/gen_tokens.py`를 다시 돌리지 않으면 여기가 깨진다.

    명암비 검사도 이 안에서 돈다 — 기준을 깨는 색이 들어오면 생성기가 1로 끝난다
    (`docs/07-style-guide.md` §8-3).
    """
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    r = subprocess.run(
        [sys.executable, str(root / "scripts" / "gen_tokens.py"), "--check"],
        capture_output=True, text=True, cwd=root,
    )
    assert r.returncode == 0, f"토큰 생성물이 원본과 다르다 — gen_tokens.py를 다시 돌려라\n{r.stdout}{r.stderr}"

def test_the_contract_status_table_matches_each_document() -> None:
    """계약 목록(03-contracts/README)의 「상태」가 **각 문서 머리말**과 같은가.

    **원본은 문서 머리말이다** (계약 README 원칙 1) — 목록은 모아 보여 주는 것이다. 둘이
    갈라지면 「어느 쪽이 참인가」를 사람이 매번 다시 물어야 하고, 실제로 **여섯 줄이 낡아
    있었다**(C1·C3·C4·C5·C7·C9가 목록에서는 「합의」, 문서에서는 「구현됨」).
    """
    from pathlib import Path as _Path

    docs = _Path(__file__).resolve().parents[2] / "docs" / "03-contracts"
    listed: dict[str, str] = {}
    for line in (docs / "README.md").read_text(encoding="utf-8").splitlines():
        if not line.startswith("| [C"):
            continue
        cells = [one.strip() for one in line.split("|")]
        listed[cells[1].split("]")[0].lstrip("[")] = _status(cells[4])

    assert len(listed) == 14, f"계약 열넷(C1~C7·C11~C17)이 목록에 있어야 한다: {sorted(listed)}"
    for name, said in sorted(listed.items()):
        found = next(docs.glob(f"{name}-*.md"))
        head = next(x for x in found.read_text(encoding="utf-8").splitlines() if x.startswith("| 상태 |"))
        assert said == _status(head.split("|")[2]), f"{name}: 목록은 {said}, 문서는 {head[:60]}"


def _status(cell: str) -> str:
    """「상태」 칸에서 상태 낱말만 (뒤에 붙은 날짜·설명은 버린다)."""
    for name in ("구현됨", "합의", "초안"):
        if name in cell:
            return name
    return cell.strip()
