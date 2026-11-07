"""`bpm-unified-consumer` — 통합 일꾼 (C15, ADR-0135).

    BPM_CONSUMER__CENTER__URL=https://center:8800 \\
    BPM_CONSUMER__CENTER__TOKEN=bpm_ctr_… \\
    BPM_CONSUMER__HANDLERS=company1 \\
    BPM_CONSUMER__DEFINITIONS=ext-credit.extension.json \\
    bpm-unified-consumer

1. **들이기는 없다** — Center 일꾼 폴더에 이 일꾼의 `<이름>.consumer.json`이 있어야 하고 그 토픽이 아래 둘의 합과
   같아야 한다 (`bpm-center consumer-file`, ADR-0122). 토큰 원문은 `BPM_CONSUMER__CENTER__TOKEN` 또는 데이터 폴더의
   `consumer-token.json`.
2. 업무 처리기는 엔트리 포인트 `bpm.consumer_handlers`로 찾는다. `BPM_CONSUMER__HANDLERS`(쉼표)를 주면 그것만 켠다.
3. 외부 확장 정의(종류 `api`)는 `BPM_CONSUMER__DEFINITIONS`(`os.pathsep`으로 여럿) — 어댑터 일꾼과 같은 규칙이고,
   그 앱의 주소·키도 같은 이름(`BPM_ADAPTER__EXT__<확장>__*`)으로 받는다.

업무 처리기도 정의도 없으면 맡을 것이 없어 뜨지 않는다. 업무 처리기 없이 정의만 주면 어댑터 일꾼과 같다.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import threading
from pathlib import Path

from platformdirs import user_data_path

from bpm.adapter_consumer.main import load_files
from bpm.service_kit import Consumer, TokenFile
from bpm.unified_consumer import handlers
from bpm.unified_consumer.host import TopicClash, UnifiedConsumer

ENV_PREFIX = "BPM_CONSUMER__"

log = logging.getLogger("bpm.unified_consumer")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(f"{ENV_PREFIX}{name}", default).strip()


def default_data_dir() -> Path:
    return user_data_path("bpm", appauthor=False) / "unified-consumer"


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(
        prog="bpm-unified-consumer", description="업무 처리기와 외부 확장을 함께 맡는 통합 일꾼 (C15)"
    )
    parser.add_argument("--center-url", default=_env("CENTER__URL"))
    parser.add_argument("--handlers", default=_env("HANDLERS"), help="켤 업무 처리기 (쉼표, 비우면 설치된 것 전부)")
    parser.add_argument(
        "--definitions", default=_env("DEFINITIONS"), help=f"맡을 외부 확장 정의 파일 ({os.pathsep}로 여럿)"
    )
    parser.add_argument("--data-dir", type=Path, default=Path(_env("DATA_DIR")) if _env("DATA_DIR") else None)
    parser.add_argument("--describe", action="store_true", help="맡을 것을 찍고 끝낸다 (Center에 붙지 않는다)")
    found = parser.parse_args(argv)

    data_dir: Path = found.data_dir or default_data_dir()
    enabled = [one.strip() for one in str(found.handlers).split(",") if one.strip()] or None
    loaded, failures = handlers.load(data_dir=data_dir / "handlers", enabled=enabled)
    paths = [Path(one) for one in str(found.definitions).split(os.pathsep) if one.strip()]
    try:
        host = UnifiedConsumer.assemble(loaded, load_files(paths), failures=failures)
    except TopicClash as e:
        print(str(e), file=sys.stderr)
        return 2
    for failure in failures:
        print(f"업무 처리기 {failure.name}를 켜지 못했다: {failure.message}", file=sys.stderr)
    if found.describe:
        print(json.dumps(host.describe(), ensure_ascii=False, indent=2))
        return 0
    if not host.topics:
        print("맡을 토픽이 없다 — 업무 처리기를 깔거나 정의 파일(BPM_CONSUMER__DEFINITIONS)을 주세요", file=sys.stderr)
        return 1
    if not found.center_url:
        print("Center 주소(BPM_CONSUMER__CENTER__URL)가 필요하다", file=sys.stderr)
        return 2
    tokens = TokenFile.at(data_dir, env_prefix=ENV_PREFIX)
    if not tokens.token():
        print(
            "일꾼 토큰이 없다 — Center 일꾼 폴더에 이 일꾼의 파일을 두고(bpm-center consumer-file) 받은 토큰을"
            " BPM_CONSUMER__CENTER__TOKEN에 넣으세요",
            file=sys.stderr,
        )
        return 2
    consumer = Consumer(host.services, center_url=found.center_url, tokens=tokens)
    consumer.publish(force=True)
    for kind, names in host.describe()["by_kind"].items():
        log.info("종류 %s: %s", kind, ", ".join(names))
    print(f"일꾼으로 붙었다 — {', '.join(one.service.app_id for one in host.topics)}", flush=True)
    stop = threading.Event()
    try:
        consumer.run(stop)
    except KeyboardInterrupt:
        stop.set()
    return 0


__all__ = ["ENV_PREFIX", "default_data_dir", "main"]
