# 04. 개발 환경 구성

> 상태: **일부 확인됨.** Windows 11 데스크톱에서 이 문서만 따라 해 봤다 (§8 실행 기록, 23분쯤). `uv sync --all-packages` → `uv run pytest`가 **CI(Windows Server + Linux x86_64)와 개발 PC(Linux aarch64)에서 돈다.** `server/web/`·Docker 쪽과 Windows 데스크톱(Studio 창·트레이)은 그 단계가 오면 갱신한다.
> 이 문서는 **새 PC에서 이 문서만 보고** 환경을 만들 수 있어야 한다. 막히는 곳이 있으면 그 자리에서 고친다.

## 1. 어떤 PC에 무엇을 까는가

| PC 역할 | OS | 필요한 것 |
| --- | --- | --- |
| 클라이언트 개발 (Studio·PC 실행기) | **Windows 10/11 (주)**, Linux | Git, uv, Python |
| 서버 개발 (Center·서버 실행기·서비스 앱) | **Linux (주)**, Windows | Git, uv, Python, Docker, Ollama |
| 한 대로 전부 | Windows 또는 Linux | 위 둘 다 |

## 2. 공통 도구

| 도구 | 버전 | 용도 |
| --- | --- | --- |
| Git | 최신 | 소스 관리 |
| uv | 최신 | Python 설치·가상환경·의존성 (pip·venv 직접 사용 안 함) |
| Python | **3.12** ([ADR-0005](decisions/0005-python-version.md)) | **직접 깔지 않는다 — uv가 내려받는다.** 시스템 Python 버전은 상관없다 |
| Docker | 최신 | 서버 구성(`server/deploy/compose.yaml`) — Center·콘솔·서버 실행기·서비스 앱. 저장소는 모두 SQLite 파일이라 **따로 세울 DB가 없다** ([ADR-0070](decisions/0070-center-stays-on-sqlite.md)) |
| Ollama | 최신 | 로컬 LLM (외부 API를 쓰면 생략) |
| Node.js | LTS | 웹 화면(Next.js) 개발·빌드 ([ADR-0017](decisions/0017-web-nextjs-design-system.md)). 웹 화면을 만지지 않는 PC는 생략 |
| pnpm | 최신 (corepack으로) | `server/web/` 의존성 |

> **Python은 uv가 관리한다.** PC에 Python이 없어도, 또는 다른 버전(3.13·3.14)이 깔려 있어도 된다. 워크스페이스 루트의 `.python-version`(`3.12`)과 `[tool.uv]`의 `python-preference = "only-managed"`가 uv가 내려받은 3.12만 쓰게 한다 ([ADR-0005](decisions/0005-python-version.md) 구현). 확인: `uv python find 3.12`가 `.../uv/python/cpython-3.12-.../bin/python3.12`를 가리키면 맞다.
> 그래서 명령은 `python ...`이 아니라 `uv run python ...`으로 쓴다. 맨 `python`은 PC마다 다른 인터프리터다.

## 3. Windows (클라이언트 주 환경)

PowerShell에서:

```powershell
# 1) Git, uv 설치
winget install --id Git.Git -e
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 2) 저장소 받기 (경로에 한글·공백이 없는 곳 권장)
git clone https://github.com/wrapper755/BPM.git C:\dev\BPM
cd C:\dev\BPM

# 3) Python과 의존성 (uv가 3.12를 내려받는다)
uv sync --all-packages
uv run pytest
```

- `uv run pytest`는 Windows 데스크톱에서 **17분쯤** 걸린다 (아래 §8의 실행 기록). 멈춘 것이 아니다.

### 웹 화면 (Windows·Linux 같음)

```powershell
# Node.js LTS 설치 (Windows: winget, Linux: 배포판 패키지 또는 nvm)
winget install --id OpenJS.NodeJS.LTS -e
# pnpm 사용 준비 (버전은 package.json의 packageManager가 정한다).
# Windows는 관리자 권한 없이 — uv가 이미 PATH에 넣어 둔 사용자 폴더에 둔다 (아래 「Windows 주의점」)
corepack enable pnpm --install-directory "$env:USERPROFILE\.local\bin"
# Linux·macOS, 또는 관리자 PowerShell이면: corepack enable
# pnpm 명령은 저장소 맨 위에서 — 워크스페이스 뿌리다 (ADR-0129)
pnpm install
pnpm dev                 # 콘솔 둘을 함께 띄운다 (8501, 8001)
pnpm --filter @bpm/center-console dev   # 하나만 — http://localhost:8501
```

| 명령 (저장소 맨 위에서) | 하는 일 |
| --- | --- |
| `pnpm dev` | 콘솔 둘을 함께 띄운다 (Center 8501, 서비스 앱 8001) |
| 환경변수 | Center 콘솔: `BPM_CONSOLE__CENTER_URL`(기본 `http://localhost:8800` — 콘솔 서버가 부르는 주소), `BPM_CONSOLE__CENTER_PUBLIC_URL`(위 막대에 보일 주소 — PC 실행기·Studio가 적는 바깥 주소, 비우면 앞의 것), `BPM_CONSOLE__SESSION_SECRET`(**필수**, 16자 이상 — 로그인 쿠키를 암호화한다) |
| 환경변수 | 서비스 앱 콘솔: `BPM_SVC_CONSOLE__APP_URL`(**어느 서비스 앱의 콘솔인지는 이 값이 정한다**), `BPM_SVC_CONSOLE__SESSION_SECRET`(**필수**, 16자 이상), `BPM_SVC_CONSOLE__CENTER_CONSOLE_URL`(선택 — **브라우저가 여는** Center 콘솔 주소. 있으면 SVC-03의 「실행 id」가 CON-01로 이어진다, [ADR-0075](decisions/0075-service-console-links-to-center-console.md)) |
| `pnpm build` | 둘 다 제품 빌드 (`output: standalone`) |
| `pnpm typecheck` | 모든 패키지·앱의 TypeScript 검사 |
| `pnpm test` | 콘솔 집계 함수의 단위 시험 (vitest — 브라우저를 띄우지 않는다) |
| `pnpm gen:api-types` | 계약 JSON Schema → TypeScript 타입 |
| `pnpm check:api-types` | 그 타입이 최신인지 검사만 (CI가 쓴다) |

- **고정한 버전** ([ADR-0017](decisions/0017-web-nextjs-design-system.md) — 「버전은 M1에서 고정」): Node 22 LTS, pnpm 10.32.1, Next.js 16.3.8, React 19.3.0, TypeScript 7.0.2, Tailwind CSS 4.3.3, lucide-react 1.50.0. `.npmrc`가 `save-exact=true`라 새 의존성도 정확한 버전으로 적힌다.
- 계약을 고치면 **두 단계**다: `uv run python scripts/gen_schemas.py` (스키마) → `pnpm gen:api-types` (타입). 손으로 타입을 쓰지 않는다.
- 토큰을 바꾸면 `uv run python scripts/gen_tokens.py`로 웹 CSS·Tailwind 테마·상태 표·Qt QSS를 다시 만든다.
- Tailwind 4는 설정 파일이 없다 — 테마가 CSS(`@theme`)다. 그래서 토큰 생성기가 `server/web/packages/ui/src/theme.css`를 만든다.
- 사내망에서 글꼴을 외부 CDN으로 받지 않는다. Pretendard·JetBrains Mono는 **저장소에 들어 있다** (웹 `server/web/packages/ui/src/fonts/`, 데스크톱 `shared/qt/src/bpm/qt/fonts/`). 따로 깔 것이 없다.

### Windows 주의점

| 문제 | 증상 | 대처 |
| --- | --- | --- |
| 기본 인코딩 cp949 | 한글 파일 읽기에서 `UnicodeDecodeError` | 코드에서 `encoding="utf-8"` 명시 (CLAUDE.md §5). 개발 PC에는 `PYTHONUTF8=1` 환경변수 설정 |
| 줄바꿈 CRLF | BPMN·YAML diff가 전부 바뀜 | 저장소의 `.gitattributes`가 LF로 고정. `git config --global core.autocrlf false` 권장 |
| 긴 경로 | Qt 설치 중 경로 오류 | 짧은 경로(`C:\dev\`)에 clone. 필요하면 `git config --global core.longpaths true` |
| 루프백 방화벽 알림 | PC 실행기가 메시지 수신 포트(8790)를 열 때 방화벽 창 | 127.0.0.1에만 바인드하면 보통 뜨지 않음. 뜨면 "개인 네트워크"만 허용 |
| 백신 실시간 검사 | `uv sync`가 매우 느림 | 개발 폴더를 검사 예외에 추가 (조직 정책 확인) |
| 실행 정책 | `.ps1` 스크립트 실행 거부 | 스크립트 대신 `uv run <명령>`을 쓴다 |
| `corepack enable`이 `EPERM` | `EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarnpkg'` | winget·MSI로 깐 Node는 `Program Files`에 있어 **일반 사용자는 거기에 쓸 수 없다**. `corepack enable pnpm --install-directory "$env:USERPROFILE\.local\bin"` — uv 설치가 이미 PATH에 넣은 폴더다. `corepack pnpm install`만으로는 모자란다: 루트 스크립트(`pnpm typecheck` 등)가 안에서 `pnpm -r …`을 다시 부르는데 PATH에 `pnpm`이 없으면 `'pnpm'은(는) … 프로그램이 아닙니다`로 끝난다 |
| 서버를 띄운 채 `uv run` | `error: failed to remove file …\.venv\Scripts\bpm-mock-apps.exe … (os error 32)` | `git pull` 뒤 `uv run`이 환경을 맞추려다 **떠 있는 프로세스가 쥔 실행 파일**을 바꾸지 못한다(Windows는 실행 중인 파일을 지울 수 없다). 그 서버를 끄고 `uv sync`를 하거나, 우리 코드만 바뀌었으면 `uv run --no-sync …`로 띄운다 (멤버는 편집 가능 설치라 코드는 이미 반영돼 있다) |
| 트레이의 PC 실행기가 둘 | 메시지 수신 포트(8790)를 옛 쪽이 쥐고 새 PC 실행기가 열지 못한다 | 창을 닫는 것은 끄는 것이 아니다(트레이에 남는다). 다시 띄우기 전에 트레이에서 「종료」했는지 본다 |
| Git Bash에서 `pnpm test`가 127 | 아무 말 없이 `ELIFECYCLE Test failed`, 끝 코드 127 | 웹 명령은 **PowerShell**에서 돌린다 (이 문서의 명령이 모두 PowerShell 기준이다). 같은 명령이 PowerShell에서는 통과한다 |
| 포트가 이미 쓰임 | `pnpm dev`가 `EADDRINUSE: :::8501`로 죽음 | 다른 프로그램(프로토타입 Streamlit도 8501을 쓴다)이 잡고 있다. `pnpm --filter <앱> exec next dev --port <빈 포트>`로 옮겨 띄운다 |

## 4. Linux (서버 주 환경)

```bash
# 1) uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2) 저장소와 의존성 (uv가 3.12를 내려받는다)
git clone https://github.com/wrapper755/BPM.git ~/dev/BPM && cd ~/dev/BPM
uv sync --all-packages
uv run pytest

# 3) Ollama (로컬 LLM을 쓸 때)
curl -fsSL https://ollama.com/install.sh | sh

# 4) Qt 테스트를 돌릴 때만 (화면 없이 돌려도 그래픽 라이브러리가 필요하다)
sudo apt-get install -y --no-install-recommends \
  libegl1 libxkbcommon0 libdbus-1-3 libfontconfig1 libfreetype6
```

- **Qt 테스트는 화면이 없어도 돈다** — `QT_QPA_PLATFORM=offscreen`을 테스트가 스스로 켠다. 위 라이브러리가 없으면 그 테스트만 건너뛴다 (CI는 깔고 돌린다).
- PySide6는 `uv sync`가 받는다. `shared/qt`는 **Essentials만** 쓰고, QtWebEngine이 든 Addons는 Studio가 따로 받는다 ([ADR-0022](decisions/0022-studio-canvas.md)·[ADR-0024](decisions/0024-desktop-packaging-extensions.md) — PC 실행기 설치 파일을 작게 두려는 것이다).

서버 쪽 구성(Center·Center 콘솔·서버 실행기) 띄우기, Center 판 올리기·저장소 옮기기는 [server/docs/setup.md](../server/docs/setup.md)에 있다 ([ADR-0129](decisions/0129-product-folders.md)).

## 5. 설정과 비밀

- 설정 파일: 저장소의 `configs/*.example.yaml`을 복사해 쓴다 (M1).
- 비밀(토큰·DB 비밀번호·API 키): `.env` (git 제외) 또는 OS 비밀 저장소. 설정 파일·코드에 넣지 않는다.
- 환경변수 접두사: **`BPM_`** 하나. 중첩은 `__` (예: `BPM_CENTER__PORT`, `BPM_CENTER__API_KEY`). [ADR-0011](decisions/0011-config-ports-env.md)
- 우선순위: 환경변수 > `.env` > 설정 파일 > 기본값.
- 서비스 앱 API 키: **없다** ([ADR-0102](decisions/0102-calling-outside-is-pull.md)) — BPM 프로세스는 바깥 기능을 Center의 외부 작업으로 부른다(C15). 서버 실행기·Studio는 제 Center API 키로, 실행 프로세스는 PC 실행기가 청한 **호출 토큰**으로 올린다. 외부 앱의 주소·키는 **어댑터 일꾼**의 설정에만 있다(아래).
- Center API 키: **PC 실행기·서버 실행기는 사람이 넣지 않는다** ([ADR-0092](decisions/0092-keys-are-issued-and-delivered-by-center.md)) — Center 주소만 주고 띄우면 등록 요청을 보내고, 관리자가 콘솔 CON-03(서버는 CON-12) 「승인 대기」에서 요청 코드(현장 화면·서버 로그)와 같은 줄을 승인하면 키를 받아 OS 비밀 저장소에 둔다. 만료 14일 전부터 Center가 갈아 준다. **Studio도 같다** — STU-10 「Center」에 주소를 넣고 「연결 테스트」를 누르면 요청 코드가 뜨고, 관리자가 CON-03 「Studio」 탭 「승인 대기」에서 승인하면 Studio 키(1년, 회전하지 않는다 — 만료되면 「다시 요청」)를 받는다. 개발·CI에서만 `BPM_CENTER__API_KEY`. Studio가 승인으로 받은 키는 OS 비밀 저장소(`bpm-studio`, 이름 `center`)로 가고, 비밀 저장소가 없는 환경(헤드리스 CI)에서는 관리자 토큰으로 발급한 Studio용 키를 `BPM_STUDIO__CENTER_API_KEY`로 준다(이것이 이기고, 그때 STU-10은 요청을 보내지 않는다).
- **앱마다의 설정·비밀**은 그 제품 문서에 있다 — 서버(Center·서버 실행기·일꾼·서비스 앱·모의 앱)는 [server/docs/setup.md](../server/docs/setup.md), [Studio](../studio/docs/setup.md), [PC 실행기](../bot/docs/setup.md) ([ADR-0129](decisions/0129-product-folders.md)).

## 6. 포트

아래 기본값을 쓰고, 바꿔야 하면 설정 파일 또는 환경변수로 바꾼다. 코드에는 포트 숫자를 직접 쓰지 않는다 ([ADR-0011](decisions/0011-config-ports-env.md)). 이 표가 기본값의 원본이다.

| 구성요소 | 기본 포트 | 바인드 | 바꾸는 환경변수 |
| --- | --- | --- | --- |
| Center API | 8800 | 서버 | `BPM_CENTER__PORT` |
| Center 콘솔 (웹) | 8501 | 서버 | `BPM_CONSOLE__PORT` |
| 서비스 앱 (관리 API) | 8010부터 10씩 | 서버 | `BPM_SVC_<앱 id>__PORT` |
| 모의 앱 16개 (`samples/`, 개발·시험용) | 8010부터 10씩 — 순서는 `uv run bpm-mock-apps list` | **127.0.0.1** | `BPM_SVC_<앱 id>__PORT` |
| 서비스 앱 관리 콘솔 (웹, `pnpm dev`) | 8001 | 개발 PC | — (`server/web/apps/svc-console/package.json`) |
| PC 실행기 메시지 수신 (ReceiveTask·메시지 시작 이벤트) | 8790 | 127.0.0.1 기본 | `BPM_BOT_UI__WEBHOOK__PORT` |
| Ollama | 11434 | 로컬 또는 서버 | `BPM_LLM__BASE_URL` |

> 주의: 프로토타입과 같은 기본 포트다. 한 PC에서 프로토타입과 새 구성요소를 동시에 띄우면 충돌하므로, 그때는 환경변수로 한쪽을 옮긴다.
>
> 모의 앱은 `uv run bpm-mock-apps serve` 하나로 **전부 한 포트(8010)**에 `/<app_id>` 밑에 뜬다 — 열여섯 포트를 쓰지 않아도 된다. 인증 없는 제어 길(`/mock/v1/scenario`)이 있어 127.0.0.1에만 바인드한다 (`samples/README.md`).
>
> `docker compose`로 띄울 때는 `.env`의 `BPM_CENTER__HOST_PORT`·`BPM_CONSOLE__HOST_PORT`가 **호스트 쪽 포트만** 옮긴다 (컨테이너 안의 포트는 위 표 그대로다).

## 6-2. 데스크톱 앱 묶기 (설치 파일의 앞 단계)

```bash
uv run --group build python packaging/build.py              # Studio·PC 실행기 둘 다
uv run --group build python packaging/build.py bot-ui       # 하나만
uv run --group build python packaging/build.py --version 0.2.0
uv run --group build python packaging/build.py --installer    # Windows에서만 — 설치 파일까지
```

PyInstaller **onedir**로 묶는다 ([ADR-0024](decisions/0024-desktop-packaging-extensions.md)) — 산출물은
`build/dist/<이름>/`이고 **설치 프로그램이 담을 폴더**다(설치 프로그램 종류는 아직 정하지 않았다).
PyInstaller는 `--group build`에만 있어 평소 `uv sync`로는 들어오지 않는다.

- **확장 인자를 적지 않는다.** `core`가 주는 PyInstaller 훅이 설치된 엔트리 포인트를 훑어 넣는다 —
  확장을 더해도 빌드 명령이 그대로다. 그래서 **무엇이 들어가는가는 빌드 환경에 무엇이 설치됐는가**로
  정해진다 (사내 확장이 생기면 ADR-0018 §5의 포함 목록을 설치하는 걸음이 앞에 붙는다).
- **묶은 뒤 스스로 검사한다** — `<실행 파일> --selftest <파일>`로 확장 호스트가 정의를 읽는지 보고
  읽지 못한 정의·켜지지 않은 확장이 있으면 **빌드를 실패시킨다**. 지금 묶을 확장은 없어서 **확장 0개가
  정상**이다 ([ADR-0114](decisions/0114-remove-ui-automation.md)). 확장을 못 박고 싶으면 `--want <확장 id>`로
  적는다. 그 깃발은 PC 실행기·Studio가 **같은 검사**(`core.selftest`)를 쓴다.
- **판을 찍는다** ([ADR-0067](decisions/0067-build-stamp.md)) — `--version`이 이기고, 없으면 지금 커밋의
  `v*` 태그, 그것도 없으면 `<core 판>+g<커밋>`(고치다 만 파일이 있으면 `.dirty`)이다. 실행 파일 옆
  `bpm-build.json`에 적히고(열어 볼 수 있다) PC 실행기가 C4 `versions`로 올려 **CON-03에 보인다**.
  **판을 올리려면 태그를 민다** — 산출물 워크플로가 태그 이름을 그대로 넘긴다. 묶은 앱이 되읽은 판이
  찍은 판과 다르면 빌드가 멈춘다.
- **설치 파일은 Inno Setup이다** ([ADR-0068](decisions/0068-installer-inno-setup-per-user.md)) — `--installer`가
  `build/installer/BPM<앱>-setup-<판>.exe`를 만든다(Windows에서만, Inno Setup 6 필요 — 없으면
  `choco install innosetup`). **사용자별**이라 관리자 권한을 묻지 않고 `%LOCALAPPDATA%\Programs\BPM\<앱>`에
  깔린다. 덮어쓰면 옛 판의 `_internal`을 지우고 깐다. 제거해도 **사용자 데이터는 남는다**(실행 기록·설치한 BPM 프로세스).
  `--check-install`(설치 → 설치된 앱 검사 → 제거)은 **같은 앱의 설치를 덮으므로 CI에서만** 쓴다.
  설치 파일 크기는 CI가 말해 준 값으로 **PC 실행기 63MB·Studio 205MB**다 (2026-10-17, 런 39004329132).
- **설치 파일에 서명이 없다** — 처음 실행하면 SmartScreen이 「Windows의 PC 보호」를 띄운다.
  「추가 정보」 → 「실행」을 누른다. 백신이 실행 파일을 막으면 그 자리의 예외로 넣는다(서명이 생기면 줄어든다).
- **매니페스트는 Windows에서만** 들어간다 (`packaging/app.manifest` — DPI Per-Monitor v2,
  [ADR-0021](decisions/0021-worker-dpi-capture.md)). 개발 PC가 Linux면 **Linux 묶음**이 나온다 —
  빌드가 서는지 보는 데는 그것으로 되고 **Windows 산출물은 CI가 만든다**(아래).
- **Windows 산출물은 수동으로 돌린다** — `.github/workflows/desktop.yml`(「데스크톱 산출물」)을
  Actions에서 실행하거나 `v*` 태그를 민다. 푸시마다 묶지 않는다 (몇 분이 걸려 모든 PR에 붙이면 값이 크다).
- 크기·시간은 **OS·아키텍처마다 다르다.** CI가 말해 준 값이다 (2026-10-16, 런 38873092925):

  | | PC 실행기 | Studio |
  | --- | --- | --- |
  | **Windows** (CI, x86_64) | **160MB · 86초** | **598MB · 109초** |
  | Linux (CI, x86_64) | 353MB · 33초 | 1009MB · 37초 |
  | Linux (개발 PC, aarch64) | 356MB · 50~62초 | 1008MB · 81초 |

  PC 실행기는 모든 현장 PC에 깔리므로 **QtWebEngine을 넣지 않는다** — 그 차이가 크기의 대부분이다.
  스파이크 S5가 Windows에서 본 것은 PC 실행기 113MB·Studio 551MB였고, 그 뒤 확장·의존이 늘어
  조금 커졌다.

## 6-3. 판 올리기 (Studio·PC 실행기)

옮겼다 — [bot/docs/setup.md](../bot/docs/setup.md) 「판 올리기」 ([ADR-0129](decisions/0129-product-folders.md)). Studio도 같은 순서다(대기열을 비우는 걸음만 없다).

## 6-4. Center 백업

옮겼다 — [server/docs/setup.md](../server/docs/setup.md) 「Center 백업」 ([ADR-0129](decisions/0129-product-folders.md)).

## 7. 시험 돌리기와 **건너뛰는 것**

`uv sync --all-packages` → `uv run pytest`. `addopts`에 `-q`가 있으니 **`-q`를 또 주면 셈이 안 보인다**. 왜 건너뛰는지는 `uv run pytest -rs`가 말해 준다.

건너뛰는 것은 두 갈래다.

| 갈래 | 무엇 | 어디서 도나 |
| --- | --- | --- |
| **OS 전용** | 네이티브 메뉴 글꼴 (Windows에서만). 거꾸로 파일 권한 비트(`0600`)와 설치 스크립트를 진짜로 만들지 않는 시험은 Windows가 아닐 때만 | 그 OS에서만 |
| **CI에 없는 조건** | `BPM_TEST_AUTOSTART=1` 작업 스케줄러, **트레이가 있는 데스크톱 세션** | 개발 PC에서 조건을 갖추면 |

트레이가 필요한 「도구」 → 「확장...」(BUI-01·BUI-11)은 그래서 **양쪽 모두** 건너뛴다. 거꾸로 트레이가 **없어야** 도는 U15 알림 자리 시험은 양쪽에서 돈다.

그래서 같은 시험 묶음이라도 **OS마다 건너뛰는 것이 다르다** — 셈은 CI가 말해 준 값으로만 적는다.

**그런데 CI의 Windows 잡은 같은 묶음이 아니다 — 서버 시험을 뺀다** ([ADR-0104](decisions/0104-windows-ci-runs-the-client-side.md)). 서버(Center·서버 실행기·일꾼·서비스 앱·모의 앱·M7 묶음)는 Linux에서만 돌므로 그 시험들을 **`tests/server/`에 두고**([ADR-0129](decisions/0129-product-folders.md)), `conftest.py`가 그 폴더의 시험에 `server` 표시를 붙이며 Windows 잡은 `uv run pytest -m "not server"`로 돈다. 표시로 빠진 시험은 **건너뜀이 아니라 「선택 해제」**라 셈에 따로 나온다(`… deselected`). 그래서 Linux는 「통과 + 건너뜀 = 모은 시험 수」이고 Windows는 「통과 + 건너뜀 + 선택 해제 = 모은 시험 수」다 — 셈을 적을 때 그것으로 맞춰 본다.

- **시험은 다섯 폴더 중 하나에 둔다** — `shared/`(계약·엔진·Qt 공용)·`server/`(Linux만)·`studio/`·`bot/`·`integration/`(제품을 가로지르는 것, 저장소 전체 검사). `server/` 밖은 Windows에서도 돈다. 시험 도우미(`stub_model.py`·`waiting.py` 등)는 `tests/` 바로 밑에 있고, `tests/` 바로 밑에 시험 파일을 두면 `test_ci_scope.py`가 막는다.
- **엔진(`core`)과 PC 쪽 코드가 걸린 시험은 `server/`에 두지 않는다** — PC BPM 프로세스는 Windows에서 엔진을 돌린다. `tests/integration/test_ci_scope.py`가 서버 파일이 PC 실행기·Studio·Qt 코드를 import하지 않는지 본다.
- Windows 개발 PC에서 CI와 같은 것을 보려면 `uv run pytest -m "not server"`, 전부는 그냥 `uv run pytest`다.

### Qt 창 시험에 `TestClient`를 붙이지 않는다

**창을 띄운 채 `fastapi.testclient.TestClient`를 들고 있으면 안 된다.** 그러면 anyio 포털
스레드와 QtWebEngine 스레드가 한 프로세스에 쌓이고, **실행이 통째로 죽는다** (`SIGSEGV`,
exit 139). 죽는 자리는 **돌던 시험과 무관한 곳**이라 — 우리 때는 한참 뒤의 업로드 시험
안이었다 — 로그만 보고는 원인을 찾을 수 없다.

**드물게 난다.** 처음 본 곳은 ubuntu x86_64 CI였고 그때는 개발 PC(aarch64)·Windows에서
재현되지 않았는데, 뒤에 **개발 PC(aarch64)에서도 한 번 났다** — 같은 코드로 세 번 돌려
한 번만 죽었다 (앞뒤 두 번은 끝까지 갔다). 그러므로 **한 번 죽은 것으로 코드를 의심하기 전에
다시 돌려 본다**: 되풀이되지 않으면 이 병이고, 되풀이되면 창을 띄우는 시험과 `TestClient`를
드는 시험이 한 프로세스에 함께 있는지 본다. **그리고 죽은 실행을 「통과」로 적지 않는다** —
셈은 끝까지 간 실행에서만 읽는다.

- 창은 **가짜 읽기 클라이언트**로 시험한다 (`CenterReader`를 상속해 메모리에서 답한다 —
  `tests/integration/test_studio_install.py`의 `FakeReader`). 창이 아니라 **담는 것**(목록·줄 계산)은
  애초에 Qt 없이 도는 함수로 갈라져 있다.
- 진짜 Center로 보는 것은 **Qt 없는 시험**에 둔다 (설치·제거·내보내기처럼 값이 큰 길).
- 창을 띄웠으면 그 시험 안에서 **닫고 `deleteLater()`**로 치운다 — 뒤 시험이 도는 중에 Qt
  객체가 죽으면 같은 꼴로 터진다.
- **진짜 소켓 서버를 띄우는 fixture는 `session`이 아니라 `module`이다** — `session`이면 그 파일이 끝난 뒤에도
  uvicorn 스레드가 살아 **뒤의 Qt 시험과 한 프로세스에 겹친다**. M5 인수 시험의 서버 넷(모의 앱·외부 앱 둘·Center)이
  그랬고, Windows CI가 서버 시험을 빼 순서가 바뀌자 STU-04 캔버스 fixture에서 `access violation`으로 죽었다
  (ADR-0104 PR). 같은 파일 안에서만 나눠 쓰는 것이라 `module`로 잃는 것이 없다 (M3의 모델 스텁이 처음부터 그렇다).

### 자식 프로세스를 기다리는 시험은 한 자리에서 기다린다

진짜 실행기를 띄우는 시험(결재 통로·실행 프로세스·PC 예제 재통과)은 「자식이 파일에 쓸
때까지」를 기다린다. 그 기다림은 **`tests/waiting.py`의 `wait_for` 하나**다 — 파일마다
베껴 두었더니 셋이 **서로 다른 한도**(30·30·60초)를 들고 있었고, 느린 Windows 러너에서
30초를 넘겨 **CI가 한 번 빨갛게 됐다**(그 묶음이 Linux의 4배 느렸다. 다시 돌리니 통과했다 —
고장이 아니라 한도였다).

- **Windows에는 더 준다** (120초 ↔ 30초). 자식은 파이썬을 새로 띄워 우리 패키지를 전부
  import한다 — 거기서 갈리는 것이 수십 초다.
- **죽었으면 바로 끝낸다** (`child=` 손잡이). 한도를 늘린 대신 **진짜 고장은 더 빨리**
  드러나야 한다. 포기할 때는 자식 로그 꼬리를 찍는다 — CI 로그만 보고도 무엇이 멈췄는지
  알게.
- **죽음보다 조건을 먼저 본다.** 실행기는 요청 파일을 **쓰고 바로 끝나는** 길이 있어, 순서를
  뒤집으면 멀쩡한 성공을 실패로 읽는다.
- 한도를 손으로 적는 자리는 **그 시험이 기다리는 것이 자식이 아닐 때**만 둔다 (예: 하트비트
  한 주기).

## 8. 확인 체크리스트 (M1 완료 시 채움)

- [x] Windows에서 clone → `uv sync` → 테스트 통과 (CI `windows-latest` = Windows Server, 그리고 **Windows 11 데스크톱**에서 이 문서만 따라 해 봤다 — 아래 실행 기록)
- [x] Linux에서 clone → `uv sync` → 테스트 통과 (CI `ubuntu-latest` x86_64 + 개발 PC aarch64)
- [ ] Windows에서 Studio 창이 뜬다
- [ ] Linux 서버의 Center에 Windows PC 실행기가 Center API 키로 등록·하트비트한다

### 실행 기록 — Windows 11 데스크톱에서 이 문서만 보고 (2026-10-13)

M6 둘째 기준(「새 개발자가 이 문서만 보고 1시간 안에」)을 재 보려고 **이 문서의 명령을 글자 그대로** 따라 했다. 새 폴더 `C:\dev\BPM`에 clone하고 **uv 캐시를 비운 채**(`UV_CACHE_DIR`를 새 폴더로) 돌렸다. Git·uv·Node는 이미 깔려 있었고, uv가 받은 Python 3.12도 이미 있었다 — 그 셋을 까는 몇 분은 셈에 없다. 일반 사용자 계정(관리자 아님)이다.

| 단계 | 걸린 시간 | 결과 |
| --- | --- | --- |
| `git clone` | 5초 | 됐다 |
| `uv sync --all-packages` (빈 캐시) | 57초 | 됐다 |
| `uv run pytest` | 17분 | **2965 통과·44 건너뜀** (§7의 Windows 건너뜀 수와 같다) |
| `corepack enable` | — | **안 됐다** — `EPERM`. 고쳤다: §3 「웹 화면」·「Windows 주의점」 |
| `pnpm install` | 1분 43초 | 됐다 (고친 명령으로) |
| `pnpm typecheck` · `pnpm test` · `pnpm build` | 37초 · 8초 · 1분 53초 | 됐다 (`pnpm test`는 PowerShell에서 — Git Bash에서는 127) |

**합이 23분쯤**이라 1시간 안이다 — 단 **문서가 틀린 곳**을 그 자리에서 고친 뒤의 셈이다(고치기 전의 문서로는 웹 쪽에서 막힌다). 사람이 아니라 Claude가 문서를 따라 한 것이라, 「처음 보는 사람이 문서만으로」는 아직 사람이 한 번 해 봐야 한다 (로드맵 M6 둘째는 그래서 열어 둔다).

