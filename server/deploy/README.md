# 서버 구성 (docker compose)

```bash
cd server/deploy
cp .env.example .env            # 첫 관리자 비밀번호·세션 비밀·들이기 비밀을 채운다
docker compose up -d --build
curl http://localhost:8800/healthz
```

그다음 브라우저로 <http://localhost:8501>에 들어가 `.env`의 첫 관리자 아이디·비밀번호로 로그인한다. 비밀번호를 비워 두었으면 Center가 만든 것이 `docker compose logs center`에 한 번 찍힌다 — 들어가서 바로 바꾼다 (「관리자 계정」).

**서버 실행기도 함께 뜨고 스스로 들어온다** — `.env`의 들이기 비밀(`BPM_SERVER_RUNNER__JOIN_TOKEN`)을 Center와 같이 받아 등록 요청에 싣고, Center가 그 자리에서 승인해 키를 내려 준다 ([ADR-0117](../../docs/decisions/0117-bundled-server-runner-joins-by-shared-secret.md)). 사람이 승인하지도 키를 넣지도 않는다. 콘솔 「BPM 프로세스」 → 「서버」 탭에서 상태를 보고 「재시작」할 수 있다 — 실행기가 도는 실행을 마치고 스스로 끝나면 compose가 다시 띄운다.

| 서비스 | 포트 | 데이터 |
| --- | --- | --- |
| Center API | 8800 | 볼륨 `center-data` → `/data` (DB `center.sqlite3`, 패키지 zip) |
| Center 콘솔 (Next.js) | 8501 | 없음 (상태를 들고 있지 않다) |
| 서버 실행기 | 없음 (Center로 하트비트만) | 볼륨 `server-runner-data` → `/data` (배포·실행 기록·기다리는 실행 `state.sqlite3`·기계 id), `server-runner-secrets` → `/secrets` (받은 Center API 키·서비스 앱 키) |
| 통합 일꾼 (프로필 `consumer`) | 없음 (Center에서 가져간다 — 관리 API 8770은 compose 망 안) | 볼륨 `unified-consumer-data` → `/data` (작업 상태·멱등 저장소·업무 처리기의 SQLite) |

- 포트·환경변수의 원본은 [`docs/04-setup.md`](../../docs/04-setup.md) §6이다.
- 콘솔은 **관리자 계정**으로 들어온다. 승인·배포·외부 확장 등록도 콘솔에서 하고, 봉투는 **Center가 서버의 키로 서명한다**(키는 DB 안, 처음 뜰 때 만든다 — [ADR-0090](../../docs/decisions/0090-center-admin-accounts.md)). 콘솔 BFF가 로그인 세션을 들고 부른다 ([ADR-0017](../../docs/decisions/0017-web-nextjs-design-system.md)).
- 관리자·읽기 토큰은 **자동화용**이다 — 비우면 그 길이 닫힌다.
- 서명 키 교체는 서버 셸에서: `docker compose exec center uv run --frozen --package bpm-center bpm-center signing-key rotate` (옛 키는 믿는 목록에 남아 이미 나간 배포가 산다).
- 콘솔은 `http://center:8800`으로 Center를 부른다 — **브라우저가 아니라 콘솔 서버가** 부르기 때문에 `localhost`가 아니다. 위 막대에는 그 주소가 아니라 `.env`의 `BPM_CONSOLE__CENTER_PUBLIC_URL`(PC 실행기·Studio에 적을 바깥 주소)이 보인다.
- 그 포트를 이미 쓰는 것이 있으면 `.env`의 `BPM_CENTER__HOST_PORT`·`BPM_CONSOLE__HOST_PORT`로 **호스트 쪽만** 옮긴다 (컨테이너 안의 포트는 그대로다).
- 바깥 노출을 역방향 프록시·터널(예: Cloudflare Tunnel)에 맡길 때는 같은 칸에 `127.0.0.1:8800`처럼 **주소까지** 적어 호스트의 루프백에만 연다. Docker가 연 포트는 ufw를 거치지 않으므로 방화벽으로는 막히지 않는다.
- 콘솔에는 `HOSTNAME: "0.0.0.0"`을 준다 — Next.js standalone은 `HOSTNAME`에 바인드하는데 Docker가 그것을 컨테이너 id로 채워 127.0.0.1을 두드리는 HEALTHCHECK가 늘 실패한다.
- 컨테이너는 모두 비관리자로 돈다 (Center·실행기 uid 10001, 콘솔은 node 이미지의 `node`). 볼륨 권한이 안 맞으면 `docker compose down -v`로 지우고 다시 올린다.
- 콘솔 이미지는 **`Dockerfile.console` 하나**로 만든다 — 어느 콘솔인지는 빌드 인자 `APP`이 정한다.
- 서버 실행기의 받은 키는 **비밀 볼륨**(`server-runner-secrets`)의 `secrets.json`(0600)에 있다 ([ADR-0100](../../docs/decisions/0100-server-runner-secrets-dir.md)) — 컨테이너에는 OS 비밀 저장소가 없어서다. 서비스 앱 키는 배포가 데려오므로(ADR-0094) 따로 넣지 않는다. 데이터 볼륨과 갈라 두었으니 데이터를 백업·복사해도 키가 따라 나가지 않는다. 볼륨을 지우면(`down -v`) 들이기 비밀로 다시 들어오고(새 키), 기다리던 실행은 `runner_restarted`로 닫힌다.
- `.env`에 `BPM_SERVER_RUNNER__CENTER_API_KEY`를 채우면 그 키가 이기고 등록 요청을 보내지 않는다(CI·자동화용) — 그 길에는 공개키가 없어 **서비스 앱 키도 `BPM_SERVER_RUNNER__SVC__<참조>`로 손수** 넣어야 한다(빠지면 사전 점검이 BPM 프로세스를 `not_ready`로 막는다). 그런 칸은 compose 덮어쓰기 파일(`compose.override.yaml`)의 `server-runner.environment`에 적는다.
- 실행기에서 호스트의 모델(예: Ollama)은 `http://host.docker.internal:<포트>/v1`로 가리킨다 (`extra_hosts`에 잡아 두었다).
- compose가 기본으로 띄우는 것은 셋(`center`·`server-runner`·`center-console`)이고, 프로필 `consumer`를 켜면 통합 일꾼(`unified-consumer`)이 더해진다(아래). **서비스 앱과 그 관리 콘솔은 없다** — 서비스 앱은 따로 띄워 일꾼으로 Center에 붙인다(C15, `docs/04-setup.md` §5). LLM 게이트웨이·역방향 프록시·TLS도 없다.

## 통합 일꾼

[ADR-0140](../../docs/decisions/0140-unified-consumer-runs-in-the-server-compose.md) — Center의 외부 작업(C15)을 가져가 수행하는 일꾼도 이 구성에서 띄운다. **기본으로는 뜨지 않는다**(일꾼 토큰이 없는 서버에서 `up`이 멈추지 않게).

1. 콘솔 「일꾼」(CON-17)에서 일꾼을 만들고 받은 토큰을 `.env`의 `BPM_CONSUMER__CENTER__TOKEN`에 넣는다.
2. `.env`에 `COMPOSE_PROFILES=consumer`를 넣고 `docker compose up -d --build`.

이 이미지(`Dockerfile.unified-consumer`)에는 **업무 처리기가 없다** — 그대로 띄우면 `definitions/`의 외부 확장 정의만 돌리는 API 일꾼이다(어댑터 일꾼과 같다). 회사의 업무 처리기는 회사 저장소가 얹는다.

- **이미지**: `FROM bpm-unified-consumer`에 처리기 패키지를 `uv pip install --no-sources --python /app/.venv/bin/python …`로 더한다. `bpm-*`는 이미 깔려 있어 받지 않으므로(`--no-sources`가 처리기 pyproject의 git 고정을 건너뛴다) **처리기가 고정한 BPM 커밋과 기반 이미지를 지은 커밋을 같게** 맞춘다. 처리기가 실행 중에 읽는 파일(그림·각본 등)이 패키지 밖에 있으면 체크아웃과 같은 모양으로 복사하고 편집 설치(`-e`)한다. 실행 파일은 `uv run`이 아니라 가상 환경의 것을 바로 부른다 — 더한 패키지가 다시 맞춰지지 않게.
- **덧붙임 파일**: 회사 저장소의 `compose.<…>.yaml`이 `unified-consumer`의 `image`·`build`(맥락은 회사 저장소)와 처리기 설정 칸(`BPM_CONSUMER__HANDLERS`, `BPM_CONSUMER__HANDLERS__<처리기>__*`)을 채운다. 띄우기:

  ```bash
  docker compose --profile consumer build unified-consumer      # 기반 이미지 bpm-unified-consumer 먼저
  docker compose -f compose.yaml -f <회사 저장소>/…/compose.<…>.yaml --profile consumer up -d --build unified-consumer
  ```

- **호스트에서 도는 회사 시스템**: `host.docker.internal`로 부른다. 그 시스템이 호스트의 127.0.0.1에만 열려 있으면 닿지 않으니, 덧붙임 파일에서 `network_mode: host`와 `extra_hosts: !reset []`를 주고 Center도 `http://127.0.0.1:<BPM_CENTER__HOST_PORT>`로 부른다. 그때는 관리 API도 `BPM_CONSUMER__HOST: 127.0.0.1`로 묶는다(이미지 기본값 `0.0.0.0`이 호스트 전체에 열린다).
- **다른 자리에서 옮겨 올 때**: 일꾼의 데이터 폴더(작업 상태)를 볼륨에 옮긴 뒤 띄운다. 빈 상태로 뜨면 업무 처리기가 지난 일을 처음부터 다시 하려다 회사 시스템과 부딪힐 수 있다.

  ```bash
  docker compose stop unified-consumer
  docker run --rm --user 0 -v bpm_unified-consumer-data:/data -v <옛 데이터 폴더>:/src:ro python:3.12-slim \
      sh -c "cp -a /src/. /data/ && chown -R 10001 /data"
  docker compose start unified-consumer
  ```

