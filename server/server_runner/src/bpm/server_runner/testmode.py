"""시험 모드 — 콘솔이 그리던 그림을 **여기서** 돌린다 (C17,
[ADR-0143](../../../../../docs/decisions/0143-design-happens-in-the-console.md) §3).

운영 실행(`worker.py`)과 **다른 것 셋**뿐이다.

| 무엇 | 운영 실행 | 시험 실행 |
| --- | --- | --- |
| 그림이 오는 곳 | 배포된 패키지 (승인 봉투·서명) | 작업공간 묶음 (C17 `GET …/bundle` — **승인이 없다**) |
| 답하는 쪽 | 사람 (Center 결재함) | **케이스** (C14 — 적어 둔 답) |
| 바깥 | 메일·웹훅을 정말 보낸다 | **보내지 않는다** — 메일은 담아 두고 웹훅은 시험 수신기로만 |

**엔진·기다림·판정은 같은 코드다** (`bpm.core.testrun`) — 데스크톱 Studio가 쓰던 그것이다. 그래서
「Studio에서는 되는데 현장에서 안 된다」가 줄어든다. 여기 있는 것은 **묶음을 풀고, 진행을 올리고,
끝을 알리는 일**뿐이다.

**실행 id는 Center가 정한다** (`test_…`) — 콘솔이 만들자마자 그 id로 묻기 때문이다
([ADR-0146](../../../../../docs/decisions/0146-design-work-has-its-own-lane.md)).
"""

from __future__ import annotations

import logging
import shutil
import threading
import zipfile
from collections.abc import Mapping
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from bpm.contracts.server_runner import RunningRun
from bpm.contracts.workspace import (
    VERDICT_ERROR,
    VERDICT_STOPPED,
    BuildDispatch,
    BuildResult,
    CheckDispatch,
    CheckResult,
    TrialTarget,
)
from bpm.core.replay import read_memory
from bpm.core.testrun import (
    BpmProcess,
    CaseRun,
    Outcome,
    Plan,
    Receiver,
    RunSettings,
    Workspace,
    read_cases,
    readiness,
)
from bpm.core.testrun.packaging import default_lib_name, default_name, export, export_lib
from bpm.core.testrun.readiness import inspect
from bpm.core.testrun.workspace import RECORD_NAME
from bpm.server_runner.center_client import CenterClient, CenterProblem
from bpm.server_runner.settings import Settings

log = logging.getLogger(__name__)

#: 진행을 올리는 가장 짧은 간격 (초). 더 자주 올려도 콘솔이 보는 것은 같고 Center만 바빠진다.
REPORT_EVERY_S = 2.0

#: C3 `executor` — 누가 돌렸나. 시험 실행도 **어디서 돌았는지** 남는다.
EXECUTOR = "server_runner"


class Trial(threading.Thread):
    """시험 실행 하나 — **스레드 하나** (운영 실행과 같은 모양, ADR-0054 §5).

    **기다리지 않는다**: 결재는 케이스가 답하므로 멈출 일이 없고, 그래서 운영 실행처럼 스냅샷을
    담지 않는다. 다시 띄우면 그 시험 실행은 `오류`로 닫힌다 — 다시 돌리면 되는 일이다(업무가
    아니다). 운영 실행을 되살리는 길과 섞지 않는 까닭이 그것이다.
    """

    def __init__(
        self,
        *,
        target: TrialTarget,
        job_id: str,
        settings: Settings,
        client: CenterClient,
        extensions: Any = None,
        services: Any = None,
        llm_api_key: str = "",
    ) -> None:
        super().__init__(name=f"trial-{target.run_id}", daemon=True)
        self.target = target
        self.job_id = job_id
        self.settings = settings
        self.client = client
        self.extensions = extensions
        self.services = services
        self.llm_api_key = llm_api_key
        self.started_at = datetime.now(UTC).isoformat()
        self.case_run: CaseRun | None = None
        self.outcome: Outcome | None = None
        self.failed: str | None = None
        self._lock = threading.Lock()
        self._log: list[str] = []
        self._states: dict[str, str] = {}
        self._variables: dict[str, Any] = {}
        self._sent_at = 0.0
        # **`_stop`이라 부르지 않는다** — `threading.Thread`의 메서드 이름이고, 덮으면
        # `join()`이 `'bool' object is not callable`로 터진다 (시험이 그렇게 잡았다).
        self._stopping = False

    # ── 바깥에서 묻는 것 ──

    @property
    def folder(self) -> Path:
        """풀어 둔 자리. **실행이 끝나면 지운다** — 업무 값이 담긴 그림이다."""
        return self.settings.data_path / "trials" / self.target.run_id

    @property
    def finished(self) -> bool:
        return self.outcome is not None or self.failed is not None

    def running_row(self) -> RunningRun:
        """하트비트의 `running[]` 한 줄 — **자리 셈이 이것과 대조된다** (C12)."""
        return RunningRun(
            run_id=self.target.run_id,
            bpm_process_id=self.target.workspace_id,
            version="",
            started_at=self.started_at,
        )

    def stop(self) -> None:
        """「중지」 — 판정하지 않는다 (C17). 도는 중이면 엔진 몰이가 다음 걸음에서 본다."""
        self._stopping = True
        if self.case_run is not None:
            self.case_run.stop()

    # ── 돌리기 ──

    def run(self) -> None:
        try:
            self._go()
        except Exception as e:  # noqa: BLE001 — 스레드가 조용히 죽으면 콘솔이 영원히 기다린다
            log.exception("시험 실행 %s가 실패했다", self.target.run_id)
            self.failed = f"{type(e).__name__}: {e}"
            self._report(state="failed", verdict=VERDICT_ERROR, detail=self.failed)
        finally:
            shutil.rmtree(self.folder, ignore_errors=True)

    def _go(self) -> None:
        process = self._unpack()
        definition = process.entry_definition
        if definition is None:
            self.failed = "작업 폴더에 읽을 정의가 없다"
            self._report(state="failed", verdict=VERDICT_ERROR, detail=self.failed)
            return
        case = self._case(process, definition)

        receiver = Receiver(port=0).start()
        try:
            plan = Plan(
                process=process,
                definition=definition,
                case=case,
                mode=self.target.mode,
                executor=EXECUTOR,
                # **Center가 정한 id를 쓴다** — 콘솔이 그것으로 묻는다.
                run_id=self.target.run_id,
                settings=self._run_settings(),
                extensions=self.extensions,
                services=self.services,
            )
            found = CaseRun(plan, receiver, _Listen(self))
            self.case_run = found
            if self._stopping:
                # 시작하기 전에 중지가 왔다 — 묶음만 받고 아무것도 돌리지 않는다.
                self._report(state="cancelled", verdict=VERDICT_STOPPED, detail="중지했습니다")
                return
            self.outcome = found.run_to_end()
        finally:
            receiver.stop()

        done = self.outcome
        state = "cancelled" if done.verdict == VERDICT_STOPPED else "done"
        self._report(
            state=state,
            verdict=done.verdict,
            detail=done.detail,
            learned=self._learned(process) if done.learned else None,
            force=True,
        )

    def _unpack(self) -> BpmProcess:
        """묶음을 받아 풀고 작업 폴더로 읽는다 — **검사·짓기와 같은 함수**다 (`unpack`)."""
        return unpack(self.client, self.target.workspace_id, self.folder)

    def _case(self, process: BpmProcess, definition: Any) -> Any:
        """케이스 하나 — **비우면 비교하지 않는다** (`비교 안 함`).

        이름이 맞는 것이 없으면 **지어내지 않고 오류다** — 조용히 「비교 안 함」으로 바꾸면
        사람이 「통과했다」로 읽는다.
        """
        if not self.target.case:
            return None
        found = next(
            (one for one in read_cases(process, definition) if one.name == self.target.case), None
        )
        if found is None:
            raise ValueError(f"케이스가 없다: {self.target.case}")
        return found

    def _run_settings(self) -> RunSettings:
        """시험 실행 한 번의 바깥 세계 — **운영 실행과 같은 설정에서 온다**.

        모델·읽기 폴더는 실행기의 설정이다 (`BPM_SERVER_RUNNER__*`). 보내기는 **주지 않는다** —
        `CaseSender`가 메일을 담아 두고 웹훅을 시험 수신기로만 보낸다 (C14).
        """
        return RunSettings(
            data_dir=self.folder,
            outputs_dir=self.folder / "outputs",
            readable_dirs=self.settings.readable_dirs,
            writable_dirs=self.settings.writable_dirs,
            llm_base_url=self.settings.llm_base_url,
            llm_model=self.settings.llm_model,
            llm_api_key=self.llm_api_key,
        )

    def _learned(self, process: BpmProcess) -> dict[str, Any]:
        """배운 재생 명세 — **합친 것을 그대로 올린다** (ADR-0028).

        합치는 규칙은 엔진의 것이다(`CaseRun._remember`가 작업 폴더에 적었다). Center는 그 파일을
        작업공간의 `memory/specs.json`에 쓰기만 한다 — 두 자리에서 합치면 갈라진다.
        """
        return dict(read_memory(process.folder).to_json_dict())

    # ── 올리기 ──

    def _report(
        self,
        *,
        state: str,
        verdict: str | None = None,
        detail: str = "",
        learned: dict[str, Any] | None = None,
        force: bool = False,
    ) -> None:
        """진행·끝을 Center에 올린다 (C17 `PUT …/test-runs/{run_id}`).

        **닿지 못해도 실행을 멈추지 않는다** — 콘솔이 한 박자 늦게 보는 것이 돌던 것을 버리는
        것보다 낫다. 끝은 `force`로 반드시 보낸다(그것마저 놓치면 콘솔이 영원히 「도는 중」이다).
        """
        now = datetime.now(UTC).timestamp()
        if not force and now - self._sent_at < REPORT_EVERY_S:
            return
        self._sent_at = now
        with self._lock:
            body: dict[str, Any] = {
                "state": state,
                "verdict": verdict,
                "detail": detail,
                "log": list(self._log),
                "node_states": dict(self._states),
                "variables": dict(self._variables),
            }
        if learned is not None:
            body["learned"] = learned
        try:
            self.client.report_trial(self.target.workspace_id, self.target.run_id, body)
        except CenterProblem as e:
            log.warning("시험 실행 %s의 보고가 닿지 못했다: %s", self.target.run_id, e)

    def _said(self, line: str) -> None:
        with self._lock:
            self._log.append(line)
        self._report(state="running")

    def _marked(self, states: Mapping[str, str]) -> None:
        with self._lock:
            self._states = dict(states)
        self._report(state="running")

    def _varied(self, variables: Mapping[str, Any]) -> None:
        with self._lock:
            self._variables = dict(variables)


class DesignWork(threading.Thread):
    """검사·짓기 하나 — **작업이 아니다** (실행 id도 C3 사건도 없다, ADR-0146).

    하트비트 루프를 막지 않으려고 스레드로 둔다: 묶음을 받고 그림을 읽는 데 한두 걸음이 걸리고,
    그 사이 하트비트가 늦으면 Center가 실행기를 잃은 것으로 본다.

    **둘을 한 클래스로 둔다** — 받는 것(묶음)과 올리는 자리가 같고, 다른 것은 「무엇을 하나」
    하나뿐이다.
    """

    def __init__(
        self,
        *,
        check: CheckDispatch | None = None,
        build: BuildDispatch | None = None,
        settings: Settings,
        client: CenterClient,
        host: Any = None,
        context: Any = None,
        externals: Any = (),
        on_check: Any = None,
        on_build: Any = None,
    ) -> None:
        assert (check is None) != (build is None), "검사 아니면 짓기 하나다"
        name = check.check_id if check is not None else (build.build_id if build is not None else "")
        super().__init__(name=f"design-{name}", daemon=True)
        self.check = check
        self.build = build
        self.settings = settings
        self.client = client
        self.host = host
        self.context = context
        self.externals = externals
        self.on_check = on_check
        self.on_build = on_build

    @property
    def folder(self) -> Path:
        return self.settings.data_path / "design" / self.name

    def run(self) -> None:
        try:
            if self.check is not None:
                self._inspect(self.check)
            elif self.build is not None:
                self._build(self.build)
        except Exception as e:  # noqa: BLE001 — 조용히 죽으면 콘솔이 영원히 기다린다
            log.exception("설계 일 %s가 실패했다", self.name)
            reason = f"{type(e).__name__}: {e}"
            if self.check is not None and self.on_check is not None:
                self.on_check(CheckResult(check_id=self.check.check_id, reason=reason))
            if self.build is not None and self.on_build is not None:
                self.on_build(BuildResult(build_id=self.build.build_id, ok=False, reason=reason))
        finally:
            shutil.rmtree(self.folder, ignore_errors=True)
            shutil.rmtree(self.folder.parent / f"{self.name}-out", ignore_errors=True)

    def _inspect(self, dispatch: CheckDispatch) -> None:
        """C14 B1~B17 + 식 검사 + 사전 점검을 한 모양으로 모은다 (`core.testrun.readiness`).

        **가르지 않는다** — B15(도우미 호출 모양)가 `core.expr_check`에 있어 Center가 못 하고,
        사전 점검은 깔린 확장을 보는 일이다 (ADR-0146). 결과 모양은 Studio가 내던 그것이다.
        """
        process = unpack(self.client, dispatch.workspace_id, self.folder)
        definition = process.entry_definition
        if definition is None or definition.process is None:
            self._tell_check(CheckResult(check_id=dispatch.check_id, reason="읽을 정의가 없다"))
            return
        found = inspect(definition.process, process)
        found += readiness(
            process, host=self.host, context=self.context, external_ids=self.externals
        )
        self._tell_check(CheckResult(check_id=dispatch.check_id, violations=found))

    def _build(self, dispatch: BuildDispatch) -> None:
        """배포 후보 zip 하나를 짓고 **C17의 올리기 길로** 올린다 (ADR-0146).

        짓는 코드는 데스크톱 Studio가 쓰던 그것이다 (`core.testrun.packaging`) — 매니페스트를
        그림에서 모으고 시험 케이스는 넣지 않는다. 받는 검사는 Center가 C5와 같은 함수로 한다.
        """
        process = unpack(self.client, dispatch.workspace_id, self.folder)
        out = self.folder.parent / f"{self.name}-out"
        out.mkdir(parents=True, exist_ok=True)
        # **이름은 짓는 쪽이 정한다** (`default_name`) — Center는 zip 안의 매니페스트를 읽는다.
        if dispatch.kind == "process_lib":
            target = out / default_lib_name(process)
            made = export_lib(process, process.definitions, target, by=EXECUTOR)
        else:
            target = out / default_name(process)
            made = export(process, target, by=EXECUTOR)
        self.client.put_artifact(dispatch.workspace_id, dispatch.build_id, made.read_bytes())
        self._tell_build(BuildResult(build_id=dispatch.build_id, ok=True))

    def _tell_check(self, result: CheckResult) -> None:
        if self.on_check is not None:
            self.on_check(result)

    def _tell_build(self, result: BuildResult) -> None:
        if self.on_build is not None:
            self.on_build(result)


def unpack(client: CenterClient, workspace_id: str, folder: Path) -> BpmProcess:
    """묶음을 받아 풀고 작업 폴더로 읽는다 — 시험 실행·검사·짓기가 **같은 길**이다 (C17).

    **경로를 믿지 않는다**: Center가 담을 때 경로 규칙을 지났지만 zip은 길을 타고 오는 것이라
    푸는 쪽에서 다시 본다 (패키지 설치와 같은 결, C2 V5).
    """
    raw = client.download_bundle(workspace_id)
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            found = (folder / name).resolve()
            if folder.resolve() not in found.parents:
                raise ValueError(f"묶음에 위험한 경로가 있다: {name}")
            found.parent.mkdir(parents=True, exist_ok=True)
            found.write_bytes(archive.read(name))
    if not (folder / RECORD_NAME).is_file():
        raise ValueError("묶음에 작업 폴더 기록이 없다")
    return Workspace(folder.parent).read(folder, group="trial")


class _Listen:
    """`core.testrun`의 듣는 이 — 올리는 쪽으로 넘긴다 (화면이 신호로 받던 자리다)."""

    def __init__(self, trial: Trial) -> None:
        self.trial = trial

    def said(self, line: str) -> None:
        self.trial._said(line)

    def marked(self, states: Mapping[str, str]) -> None:
        self.trial._marked(states)

    def varied(self, variables: Mapping[str, Any]) -> None:
        self.trial._varied(variables)

    def ended(self, outcome: Outcome) -> None:
        """끝은 `_go()`가 올린다 — 여기서도 올리면 같은 것이 두 번 간다."""


__all__ = ["EXECUTOR", "REPORT_EVERY_S", "DesignWork", "Trial", "unpack"]
