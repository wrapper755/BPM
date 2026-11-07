# 서버 — 띄우기와 설정

공통 도구·포트·환경변수 규칙·시험(건너뛰는 것)은 [04-setup.md](../../docs/04-setup.md)에 있다. 여기에는 이 제품만의 것을 둔다 ([ADR-0129](../../docs/decisions/0129-product-folders.md)).

## 띄우기와 Center 판 올리기

서버 쪽 구성(Center·Center 콘솔·**서버 실행기**)은 `server/deploy/compose.yaml` **한 번으로** 뜬다 — Windows에서도 Docker Desktop으로 같은 서버를 띄운다. 서비스 앱은 compose에 없다 — 따로 띄워 일꾼으로 Center에 붙인다(아래 §5).

**Center를 새 판으로 올리면 저장소가 뜰 때 저절로 옮겨진다** ([ADR-0065](../../docs/decisions/0065-center-schema-migrations.md)) — 모자란 단계만 차례로 돌고, 단계 하나가 실패하면 그 단계는 없던 일이 되고 **Center가 뜨지 않는다**(사유가 로그에 남는다). **되돌리는 단계는 없다** — 옮겨진 DB를 옛 판 Center가 열면 「새 판의 Center로 띄우세요」라며 **뜨지 않는다**. 그래서 **올리기 전에 DB 파일을 떠 둔다**(WAL이라 `center.sqlite3`·`-wal`·`-shm` 셋을 함께, Center를 멈춘 뒤). 지금 판은 `SELECT * FROM schema_migrations`가 말해 준다.

**3판에서 멈췄다면** — 같은 키·같은 기계가 여러 행에 있다는 뜻이다(2026-10-08 전에 만든 DB에서 같은 PC를 두 키로 등록하면 생긴다). Center는 **어느 행을 남길지 짐작하지 않는다**([ADR-0066](../../docs/decisions/0066-migration-guards.md)) — Center를 멈춘 채로 사람이 고른다:

```bash
uv run bpm-center hosts duplicates
```

```bash
uv run bpm-center hosts retire bui_xxxxxxxx
```

목록은 무리마다 이름·마지막으로 본 때를 보인다. 은퇴는 **지우지 않고**(배포·실행 기록이 그 id를 가리킨다) 그 행의 키·기계 자리를 놓게 하고 다시 쓰이지 않게 한다(PC는 비활성, 서버 실행기는 일시 중지). **겹친 무리에 든 행만** 은퇴시킬 수 있다. 다 고른 뒤 Center를 다시 띄우면 3판으로 간다.

## 설정과 비밀

- 서버 실행기: 들어오는 포트가 없다 (Center로 접속만). **화면이 없으니 설정 파일도 없다** — 환경변수로만 설정한다: `BPM_SERVER_RUNNER__CENTER_URL`(기본 `http://localhost:8800`), `BPM_SERVER_RUNNER__MAX_CONCURRENCY`(동시 실행 상한, 기본 10), `BPM_SERVER_RUNNER__NAME`(비우면 호스트 이름), `BPM_SERVER_RUNNER__HEARTBEAT_S`(첫 주기, 기본 10 — 그다음은 Center가 주는 `next_heartbeat_s`를 따른다), `BPM_SERVER_RUNNER__RETRY_S`(닿지 못했을 때, 기본 30), **`BPM_SERVER_RUNNER__PARK_AFTER_S`**(외부 작업을 이만큼 기다려 끝나지 않으면 기다림으로 넘기고 자리를 놓는다, 기본 20초 — 결과는 하트비트 주기마다 묻는다, [ADR-0103](../../docs/decisions/0103-long-external-tasks.md)), `BPM_SERVER_RUNNER__DATA_DIR`, **`BPM_SERVER_RUNNER__LLM__BASE_URL`·`BPM_SERVER_RUNNER__LLM__MODEL`**(AI 태스크가 쓰는 모델, 기본 모델 이름은 `qwen2.5:7b`. **주소를 비우면 AI 태스크가 실패한다** — 조용히 넘어가지 않는다, [ADR-0027](../../docs/decisions/0027-llm-connection.md)), **`BPM_SERVER_RUNNER__READABLE_DIRS`·`BPM_SERVER_RUNNER__WRITABLE_DIRS`**(읽기·쓰기 허용 폴더, `os.pathsep`으로 여럿 — Linux `:`, Windows `;`. **기본은 비어 있다**: 출력 폴더 밖은 적어 주지 않으면 `PathDenied`다, [ADR-0032](../../docs/decisions/0032-writable-dirs.md)), **`BPM_SERVER_RUNNER__SMTP__HOST`·`__PORT`·`__SECURITY`·`__USERNAME`·`__FROM`·`__ATTACHMENT_MB`**(메일 보내기 — 보안은 `starttls`(기본)·`ssl`·`none`, 포트를 비우면 보안에 맞는 기본(587·465·25), 첨부 합계 상한 기본 10 MB. **주소·보내는 주소를 비우면 `bpm:email`이 실패한다** — 조용히 넘어가지 않는다, [ADR-0059](../../docs/decisions/0059-sending-mail-and-webhooks.md)), **`BPM_SERVER_RUNNER__WEBHOOK__ALLOWED_HOSTS`**(웹훅을 보낼 수 있는 호스트, **쉼표로 여럿**. **기본은 비어 있고 비면 아무 데도 보내지 않는다** — 사설·루프백은 적어도 열리지 않는다). **Center API 키(서버 실행기용)는 둘 중 하나로 온다** — 환경변수 `BPM_SERVER_RUNNER__CENTER_API_KEY`(systemd·CI, 이것이 이긴다) 또는 **등록 승인**(**`BPM_SERVER_RUNNER__JOIN_TOKEN`이 Center의 들이기 비밀과 맞으면 그 자리에서 승인된다** — ADR-0117. OS 비밀 저장소 `bpm-server-runner`나 **비밀 폴더 `BPM_SERVER_RUNNER__SECRETS_DIR`**가 있을 때만 — 키가 없으면 등록 요청을 보내고 요청 코드를 로그에 찍는다, C12 §등록 요청과 승인. 둘 다 없으면 요청하지 않고 끝 코드 2로 끝난다). **컨테이너는 비밀 폴더가 그 자리다** ([ADR-0100](../../docs/decisions/0100-server-runner-secrets-dir.md) — `server/deploy/compose.yaml`의 실행기는 볼륨 `server-runner-secrets`를 쓰고 키 회전도 그대로 돈다). **모델 키는 `BPM_SERVER_RUNNER__LLM__API_KEY`**, **메일 비밀번호는 `BPM_SERVER_RUNNER__SMTP__PASSWORD`**(PC 실행기·Studio와 같은 규칙, [ADR-0013](../../docs/decisions/0013-api-keys.md) — 값은 설정·실행 기록에 넣지 않는다). **확장 설정 칸은 `BPM_SERVER_RUNNER__EXT__<확장 id>__<칸 이름>`이다** (C13 `configuration`의 `scope: server_runner`인 것만. 이름은 영대문자·숫자·`_`로 바꿔 쓴다 — `doc-ocr`·`ocr_key` → `..._EXT__DOC_OCR__OCR_KEY`. **PC 실행기의 `BPM_BOT_UI__EXT__…`와 같은 규칙**이고 비밀 칸도 같은 이름으로 온다, [ADR-0064](../../docs/decisions/0064-extension-tasks-on-the-server.md) §2). 띄우는 것은 `uv run bpm-server-runner`이고 `--once`는 **등록하고 하트비트까지 한 번** 해 보고 상태 한 줄을 찍는다(설치 확인용 — 끝 코드 0/1/3이 「됐다」·「사람이 고쳐야 한다」·「닿지 못했다」를 가른다). 배포는 하트비트로 받아 `<데이터>/bots/<id>/<버전>/`에 푼다 (PC 실행기와 같은 자리 규칙). 실행 기록은 `<데이터>/runs/<run_id>.jsonl`이고(파일이 원본이다 — C3) 하트비트 뒤에 Center로 보낸다. **기다리는 실행은 `<데이터>/state.sqlite3`에 담긴다** — 실행기를 다시 띄우면 그것을 훑어 되살린다 (ADR-0054). 그 파일을 지우면 기다리던 실행은 `runner_restarted`로 닫힌다. **메시지를 받는 포트는 없다** — 서버 실행기는 들어오는 포트가 없고, 외부 시스템은 Center의 `POST /api/v1/messages`에 넣는다 (C12 §메시지. PC는 PC 실행기의 8790이다). **`--once`는 작업을 받지 않는다** — 곧 끝나는 프로세스가 실행 스레드를 버리면 안 된다 (받지 않은 작업은 다음 하트비트에 다시 실린다, C4). **SIGTERM에 곱게 끝낸다** ([ADR-0015](../../docs/decisions/0015-run-location.md), C12).
- Center 관리자 계정 ([ADR-0090](../../docs/decisions/0090-center-admin-accounts.md)): 콘솔은 **아이디·비밀번호**로 들어온다. 첫 관리자는 `BPM_CENTER__FIRST_ADMIN__USERNAME`(비우면 `admin`)·`BPM_CENTER__FIRST_ADMIN__PASSWORD`로 정하고 **계정이 하나도 없을 때만** 쓰인다(그다음에는 콘솔 CON-14에서 바꾼다). 비밀번호는 12자 이상·영문과 숫자를 모두 넣는다 — 맞지 않으면 Center가 **뜨지 않는다**. 비우면 Center가 만들어 로그에 한 번 찍고 데이터 폴더의 `first-admin-password.txt`에 둔다(그 계정이 비밀번호를 바꾸면 지운다). `BPM_CENTER__ADMIN_TOKEN`·`BPM_CENTER__READ_TOKEN`은 **자동화용**이고 선택이다 — 비우면 그 길이 닫힌다. **`BPM_CENTER__SERVER_RUNNER_JOIN_TOKEN`**은 같이 배포된 서버 실행기를 승인 없이 들이는 비밀이다 — 실행기의 `BPM_SERVER_RUNNER__JOIN_TOKEN`과 같은 값이고, 비우면 그 길이 닫혀 실행기는 콘솔 「승인 대기」를 거친다 ([ADR-0117](../../docs/decisions/0117-bundled-server-runner-joins-by-shared-secret.md), compose는 둘을 `.env`의 한 값에서 준다).
- Center 서명 키: Center가 **처음 뜰 때 만들어 DB에 둔다**(승인·배포·외부 확장 봉투에 Center가 서명한다, ADR-0090). 서버 셸에서 `bpm-center signing-key list`(믿는 키) · `rotate`(새 키로 바꾼다 — 옛 키는 믿는 목록에 남는다) · `retire <key_id>`(그 키가 서명한 승인·배포가 **모두 무효**가 된다, 묻는다)다. compose면 `docker compose exec center uv run --frozen --package bpm-center bpm-center signing-key …`.
- 서비스 앱 관리자 토큰: `BPM_SVC_<앱 id>__ADMIN_TOKEN`. **이 토큰이 없으면 그 앱의 관리 API(`/admin/v1/*`)가 503으로 닫혀 있다** — 빈 토큰으로 열리지 않는다 ([C11](../../docs/03-contracts/C11-service-app-common.md) §관리 API). **서비스 앱은 일꾼으로 Center에 붙는다** ([C15](../../docs/03-contracts/C15-external-tasks.md), `service_kit.consumer`) — 업무 호출을 받는 포트는 없다. 서비스 앱은 `BPM_SVC_<앱 id>__CENTER__URL`(Center 주소 — 비우면 일감을 가져가지 않고 관리 API만 돈다)과 **일꾼 토큰** `BPM_SVC_<앱 id>__CENTER__TOKEN`(또는 데이터 폴더 `BPM_SVC_<앱 id>__DATA_DIR`의 `consumer-token.json`의 `token`)을 받는다. **들이기 요청·승인은 없다** — Center 일꾼 폴더에 `bpm-center consumer-file <이름> --topics <앱 id>`로 파일을 짓고 찍힌 토큰을 넣는다(아래 「일꾼 폴더」).
- 모의 앱 (`bpm-mock-apps serve`, [samples/README](../../samples/README.md)): `BPM_MOCK_APPS__CENTER__URL`과 일꾼 토큰 `BPM_MOCK_APPS__CENTER__TOKEN`(또는 `BPM_MOCK_APPS__DATA_DIR`(기본 `.mock-apps`)의 `consumer-token.json`)을 주면 C11 모의 앱 열셋이 **일꾼 하나**로 붙는다. 토큰이 없으면 붙지 않고 짓는 명령을 찍는다.
- 어댑터 일꾼 (`uv run bpm-adapter-consumer`, `server/adapter_consumer` — 외부 앱을 부른다, C13 §4): `BPM_ADAPTER__CENTER__URL`(Center 주소)·`BPM_ADAPTER__CENTER__TOKEN`(일꾼 토큰 — 또는 `BPM_ADAPTER__DATA_DIR`(기본 `.adapter-consumer`)의 `consumer-token.json`)·`BPM_ADAPTER__DEFINITIONS`(맡을 외부 확장 **정의 파일**, `os.pathsep`으로 여럿)가 있어야 뜬다. 정의는 이 일꾼이 들고 있다가 뜰 때 Center에 올린다(Center가 검사·서명한다, ADR-0122). **외부 앱의 주소·키는 여기에만 있다** — 확장마다 `BPM_ADAPTER__EXT__<확장>__BASE_URL`(없으면 정의의 `base_url`)·`__KEY`(키를 받는 앱만), 시험 일감(`origin: test`)용 `__TEST_BASE_URL`·`__TEST_KEY`(없으면 운영 쪽). 이름은 영대문자·숫자·`_`로 바꿔 쓴다(`ext-credit` → `EXT_CREDIT`). 정의가 허용한 사설망으로 나가려면 `BPM_ADAPTER__ALLOW_PRIVATE_NETWORK=1`(기본 닫힘).
- 통합 일꾼 (`uv run bpm-unified-consumer`, `server/unified_consumer` — 업무 처리기와 외부 확장을 일꾼 하나로, [ADR-0135](../../docs/decisions/0135-agentic-automation-and-unified-consumer.md)): `BPM_CONSUMER__CENTER__URL`·`BPM_CONSUMER__CENTER__TOKEN`(또는 `BPM_CONSUMER__DATA_DIR`(기본 사용자 데이터 폴더의 `bpm/unified-consumer`)의 `consumer-token.json`). 업무 처리기는 **설치된 패키지의 엔트리 포인트 `bpm.consumer_handlers`**로 찾고 `BPM_CONSUMER__HANDLERS`(쉼표)로 고른다 — 처리기의 설정 칸은 `BPM_CONSUMER__HANDLERS__<처리기>__<칸>`. 외부 확장(종류 `api`)은 `BPM_CONSUMER__DEFINITIONS`이고 그 앱의 주소·키는 **어댑터 일꾼과 같은 이름**(`BPM_ADAPTER__EXT__<확장>__*`)이다. 일꾼 파일의 토픽은 처리기 토픽과 정의 id를 **합친 것**이어야 한다. 같은 토픽을 둘이 맡으면 뜨지 않는다. `--describe`는 Center에 붙지 않고 맡을 것을 종류별로 찍는다.
- 타이머 시작의 시간대 ([ADR-0110](../../docs/decisions/0110-center-keeps-the-schedule.md), C5 §일정): `BPM_CENTER__TIMEZONE`(IANA 이름, 기본 `Asia/Seoul`). cron이 이 벽시계로 읽힌다. 풀 수 없는 이름이면 Center가 **뜨지 않는다** (이미지에 시간대 자료가 있어야 한다 — `python:*-slim`에는 있다). **Center 콘솔도 이 시간대로 시각을 보인다** — 콘솔은 시각을 서버에서 글로 만들므로 `server/deploy/compose.yaml`이 같은 값을 콘솔 컨테이너의 `TZ`로 넘긴다(없으면 UTC라 한국에서 9시간 이르게 보인다). 콘솔을 따로 띄우면 그 프로세스의 `TZ`를 같은 값으로 둔다.
- 일꾼 폴더 ([ADR-0122](../../docs/decisions/0122-consumer-folder.md), [C15](../../docs/03-contracts/C15-external-tasks.md) §일꾼 들이기): `BPM_CENTER__CONSUMERS_DIR`(적지 않으면 `<데이터>/consumers` — 없으면 조용히 지나간다). **일꾼이 들어오는 길은 이것 하나다** — 요청 코드·승인이 없다. `bpm-center consumer-file <이름> --topics a,b [--dir 폴더]`가 `<이름>.consumer.json`(이름·토픽·**토큰 해시**)을 짓고 토큰 원문을 **한 번만** 찍는다 — 그 값을 일꾼의 `…CENTER__TOKEN`에 넣고 Center를 다시 띄운다. 토픽은 파일에 적은 것으로 고정이고 만료·회전이 없다. **폴더가 원본이다** — 파일을 빼고 다시 띄우면 일꾼 키가 폐기되고, 그 일꾼만 맡던 외부 확장은 철회된다(폴더가 붙지 않았거나 읽지 못한 파일이 있으면 거두지 않는다). 외부 확장 정의는 일꾼이 올린다(C15 `PUT …/self/extension`) — 콘솔에서 등록·해제하는 칸은 없다. **잘못된 파일은 Center를 막지 않는다** — 로그와 CON-07 「일꾼 폴더」에 사유가 보인다. 일감 흐름(가져감·끝냄·실패)도 Center 로그에 남는다. **같은 폴더의 `<이름>.key.json`은 연동용·대리 답용 키다** ([ADR-0123](../../docs/decisions/0123-folder-keys.md), C7 §폴더 키) — `bpm-center key-file <이름> --type integration|relay`가 짓고 원문을 한 번 찍는다. 함께 설치되는 연동 시스템이 콘솔에서 발급받아 붙여 넣지 않는다(콘솔은 키를 발급하지 않는다 — ADR-0124). 뜻(뜰 때 한 번·바꾸면 옛 키 폐기·빼면 폐기)은 일꾼 파일과 같다. compose에서는 `server/deploy/consumers/`(`BPM_CENTER__CONSUMERS_HOST_DIR`로 바꾼다)가 컨테이너의 `/consumers`에 읽기 전용으로 붙는다.
- 외부 작업 롱폴링 상한 ([C15](../../docs/03-contracts/C15-external-tasks.md)): `BPM_CENTER__EXTERNAL_TASKS__MAX_WAITERS`(기본 200 — 올리는 쪽·일꾼의 기다림을 함께 센다). 넘으면 503 `too_many_waiters`.
- 서비스 앱의 모델: `BPM_SVC_<앱 id>__LLM__BASE_URL`·`__LLM__MODEL`·`__LLM__API_KEY`(선택, 비밀). 없으면 모델이 필요한 작업만 503 `llm_unavailable`이고 나머지는 돈다 ([C11](../../docs/03-contracts/C11-service-app-common.md) §모델 연결).

## Center 백업

Center의 저장소는 **SQLite 파일 하나와 패키지 폴더**다([ADR-0070](../../docs/decisions/0070-center-stays-on-sqlite.md) —
PostgreSQL은 쓰지 않는다). 컨테이너에서는 `/data/center.sqlite3`·`/data/packages`이고 자리는
`BPM_CENTER__DATA_DIR`(또는 `DB_PATH`·`PACKAGE_DIR`)가 정한다.

- **DB 파일을 그냥 복사하지 않는다** — WAL이라 커밋 일부가 `-wal` 파일에 있다. SQLite의 백업 API로 뜬다
  (Center가 도는 중에도 된다):

  ```bash
  docker compose exec center python -c "import sqlite3; sqlite3.connect('/data/center.sqlite3').backup(sqlite3.connect('/data/center-backup.sqlite3'))"
  ```

- **패키지 폴더도 함께** 남긴다 — DB에는 메타데이터만 있고 zip은 폴더에 있다.
- 되살릴 때는 **판 번호가 같거나 높은 Center**로 연다 — DB 판이 코드보다 높으면 Center가 뜨지 않는다
  ([ADR-0065](../../docs/decisions/0065-center-schema-migrations.md) §2).
