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

4. **관리 API**(일꾼 콘솔 = 서비스 앱 콘솔, C11) — `BPM_CONSUMER__ADMIN_TOKEN`이 있을 때만 `BPM_CONSUMER__HOST`·`PORT`에
   띄운다. 콘솔은 `BPM_SVC_CONSOLE__APP_URL`을 이 주소로 둔다.

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

from fastapi import FastAPI
from platformdirs import user_data_path

from bpm.adapter_consumer.main import load_files
from bpm.service_kit import Consumer, InMemoryUsageLog, TokenFile
from bpm.unified_consumer import handlers
from bpm.unified_consumer.admin import create_admin_app, recorded
from bpm.unified_consumer.host import TopicClash, UnifiedConsumer

ENV_PREFIX = "BPM_CONSUMER__"
#: 관리 API의 기본 자리 — 기본값의 원본은 `docs/04-setup.md` §6이다 (ADR-0011).
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8770

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
    usage = InMemoryUsageLog()
    services = recorded(host.services, usage)
    consumer = Consumer(services, center_url=found.center_url, tokens=tokens)
    consumer.publish(force=True)
    admin_token = _env("ADMIN_TOKEN")
    if admin_token:
        _serve_admin(create_admin_app(services, admin_token=admin_token, log=usage, center=consumer.registration))
    else:
        log.info("관리자 토큰(BPM_CONSUMER__ADMIN_TOKEN)이 없어 관리 API를 띄우지 않는다")
    for kind, names in host.describe()["by_kind"].items():
        log.info("종류 %s: %s", kind, ", ".join(names))
    print(f"일꾼으로 붙었다 — {', '.join(one.service.app_id for one in host.topics)}", flush=True)
    stop = threading.Event()
    try:
        consumer.run(stop)
    except KeyboardInterrupt:
        stop.set()
    return 0


def _serve_admin(app: FastAPI) -> None:
    """관리 API를 데몬 스레드로 띄운다 — 일꾼 루프가 주인이고, 끝나면 함께 내려간다."""
    import uvicorn  # noqa: PLC0415

    host = _env("HOST") or DEFAULT_HOST
    port = int(_env("PORT") or DEFAULT_PORT)
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    threading.Thread(target=server.run, name="admin-api", daemon=True).start()
    log.info("관리 API를 띄웠다 — http://%s:%d (일꾼 콘솔: BPM_SVC_CONSOLE__APP_URL)", host, port)


__all__ = ["DEFAULT_HOST", "DEFAULT_PORT", "ENV_PREFIX", "default_data_dir", "main"]
