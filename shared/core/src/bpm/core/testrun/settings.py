"""시험 실행 한 번이 바깥 세계에 닿는 데 필요한 것만 (`runner.Plan.settings`).

**설계 도구의 설정 전부가 아니다.** 여기 있는 것은 `RunEnv`를 짓는 데 쓰이는 값뿐이고,
어디서 읽어 왔는지(설정 파일·환경변수·OS 비밀 저장소·Center)는 **부르는 쪽이 안다**.
그래서 모델 키도 **값으로 받는다** — 엔진 쪽이 비밀 저장소를 뒤지지 않는다 (CLAUDE.md §5).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class RunSettings:
    """시험 실행 한 번의 바깥 세계."""

    #: 실행 기록(`runs/<run_id>.jsonl`)이 가는 뿌리.
    data_dir: Path = field(default_factory=Path.cwd)
    #: 파일 태스크가 쓰는 출력 폴더의 뿌리 (ADR-0026). BPM 프로세스 id로 한 칸 더 들어간다.
    outputs_dir: Path = field(default_factory=Path.cwd)
    #: 파일 목록 태스크가 들여다볼 수 있는 폴더 (ADR-0026 — 주지 않으면 출력 폴더만).
    readable_dirs: tuple[Path, ...] = ()
    #: 출력 폴더 **밖에 쓸 수 있는** 폴더 (ADR-0032). 기본은 비어 있다.
    writable_dirs: tuple[Path, ...] = ()
    #: 모델 (ADR-0027). 주소가 비면 AI 태스크가 **분명히 실패한다** (`NoLlm`).
    llm_base_url: str = ""
    llm_model: str = ""
    #: 모델 키 — **값이다**. 설정 파일에 적히지 않는다 (부르는 쪽이 환경변수·비밀 저장소에서 푼다).
    llm_api_key: str = ""


__all__ = ["RunSettings"]
