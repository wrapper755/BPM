# 04. 개발 환경 구성

> 상태: **일부 확인됨.** Windows 11 데스크톱에서 이 문서만 따라 해 봤다 (§8 실행 기록, 23분쯤). `uv sync --all-packages` → `uv run pytest`가 **CI(Windows Server + Linux x86_64)와 개발 PC(Linux aarch64)에서 돈다.** `server/web/`·Docker 쪽은 그 단계가 오면 갱신한다. **데스크톱 쪽은 없어졌다** (ADR-0143, M11 조각 5).
> 이 문서는 **새 PC에서 이 문서만 보고** 환경을 만들 수 있어야 한다. 막히는 곳이 있으면 그 자리에서 고친다.

## 1. 어떤 PC에 무엇을 까는가

| PC 역할 | OS | 필요한 것 |
| --- | --- | --- |
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
| 환경변수 | Center 콘솔: `BPM_CONSOLE__CENTER_URL`(기본 `http://localhost:8800` — 콘솔 서버가 부르는 주소), `BPM_CONSOLE__CENTER_PUBLIC_URL`(위 막대에 보일 주소 — Studio가 적는 바깥 주소, 비우면 앞의 것), `BPM_CONSOLE__SESSION_SECRET`(**필수**, 16자 이상 — 로그인 쿠키를 암호화한다) |
| 환경변수 | 서비스 앱 콘솔: `BPM_SVC_CONSOLE__APP_URL`(**어느 서비스 앱의 콘솔인지는 이 값이 정한다**), `BPM_SVC_CONSOLE__SESSION_SECRET`(**필수**, 16자 이상), `BPM_SVC_CONSOLE__CENTER_CONSOLE_URL`(선택 — **브라우저가 여는** Center 콘솔 주소. 있으면 SVC-03의 「실행 id」가 CON-01로 이어진다, [ADR-0075](decisions/0075-service-console-links-to-center-console.md)) |
| `pnpm build` | 둘 다 제품 빌드 (`output: standalone`) |
| `pnpm typecheck` | 모든 패키지·앱의 TypeScript 검사 |
| `pnpm test` | 콘솔 집계 함수의 단위 시험 (vitest — 브라우저를 띄우지 않는다) |
| `pnpm gen:api-types` | 계약 JSON Schema → TypeScript 타입 |
| `pnpm check:api-types` | 그 타입이 최신인지 검사만 (CI가 쓴다) |

- **고정한 버전** ([ADR-0017](decisions/0017-web-nextjs-design-system.md) — 「버전은 M1에서 고정」): Node 22 LTS, pnpm 10.32.1, Next.js 16.3.8, React 19.3.0, TypeScript 7.0.2, Tailwind CSS 4.3.3, lucide-react 1.50.0. `.npmrc`가 `save-exact=true`라 새 의존성도 정확한 버전으로 적힌다.
- 계약을 고치면 **두 단계**다: `uv run python scripts/gen_schemas.py` (스키마) → `pnpm gen:api-types` (타입). 손으로 타입을 쓰지 않는다.
- 토큰을 바꾸면 `uv run python scripts/gen_tokens.py`로 웹 CSS·Tailwind 테마·상태 표를 다시 만든다.
- Tailwind 4는 설정 파일이 없다 — 테마가 CSS(`@theme`)다. 그래서 토큰 생성기가 `server/web/packages/ui/src/theme.css`를 만든다.
- 사내망에서 글꼴을 외부 CDN으로 받지 않는다. Pretendard·JetBrains Mono는 **저장소에 들어 있다** (`server/web/packages/ui/src/fonts/`). 따로 깔 것이 없다. 시험이 한글 PDF를 만들 때 쓰는 OTF 한 벌은 `tests/fonts/`에 있다 — fpdf2가 woff2를 읽지 못해서다.

### Windows 주의점

| 문제 | 증상 | 대처 |
| --- | --- | --- |
| 기본 인코딩 cp949 | 한글 파일 읽기에서 `UnicodeDecodeError` | 코드에서 `encoding="utf-8"` 명시 (CLAUDE.md §5). 개발 PC에는 `PYTHONUTF8=1` 환경변수 설정 |
| 줄바꿈 CRLF | BPMN·YAML diff가 전부 바뀜 | 저장소의 `.gitattributes`가 LF로 고정. `git config --global core.autocrlf false` 권장 |
| 긴 경로 | 설치 중 경로 오류 | 짧은 경로(`C:\dev\`)에 clone. 필요하면 `git config --global core.longpaths true` |
| 백신 실시간 검사 | `uv sync`가 매우 느림 | 개발 폴더를 검사 예외에 추가 (조직 정책 확인) |
| 실행 정책 | `.ps1` 스크립트 실행 거부 | 스크립트 대신 `uv run <명령>`을 쓴다 |
| `corepack enable`이 `EPERM` | `EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarnpkg'` | winget·MSI로 깐 Node는 `Program Files`에 있어 **일반 사용자는 거기에 쓸 수 없다**. `corepack enable pnpm --install-directory "$env:USERPROFILE\.local\bin"` — uv 설치가 이미 PATH에 넣은 폴더다. `corepack pnpm install`만으로는 모자란다: 루트 스크립트(`pnpm typecheck` 등)가 안에서 `pnpm -r …`을 다시 부르는데 PATH에 `pnpm`이 없으면 `'pnpm'은(는) … 프로그램이 아닙니다`로 끝난다 |
| 서버를 띄운 채 `uv run` | `error: failed to remove file …\.venv\Scripts\bpm-mock-apps.exe … (os error 32)` | `git pull` 뒤 `uv run`이 환경을 맞추려다 **떠 있는 프로세스가 쥔 실행 파일**을 바꾸지 못한다(Windows는 실행 중인 파일을 지울 수 없다). 그 서버를 끄고 `uv sync`를 하거나, 우리 코드만 바뀌었으면 `uv run --no-sync …`로 띄운다 (멤버는 편집 가능 설치라 코드는 이미 반영돼 있다) |
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
```

서버 쪽 구성(Center·Center 콘솔·서버 실행기) 띄우기, Center 판 올리기·저장소 옮기기는 [server/docs/setup.md](../server/docs/setup.md)에 있다 ([ADR-0129](decisions/0129-product-folders.md)).

## 5. 설정과 비밀

- 설정 파일: 저장소의 `configs/*.example.yaml`을 복사해 쓴다 (M1).
- 비밀(토큰·DB 비밀번호·API 키): `.env` (git 제외) 또는 OS 비밀 저장소. 설정 파일·코드에 넣지 않는다.
- 환경변수 접두사: **`BPM_`** 하나. 중첩은 `__` (예: `BPM_CENTER__PORT`, `BPM_CENTER__API_KEY`). [ADR-0011](decisions/0011-config-ports-env.md)
- 우선순위: 환경변수 > `.env` > 설정 파일 > 기본값.
- 서비스 앱 API 키: **없다** ([ADR-0102](decisions/0102-calling-outside-is-pull.md)) — BPM 프로세스는 바깥 기능을 Center의 외부 작업으로 부른다(C15). 서버 실행기는 제 Center API 키로, 실행 프로세스는 실행기가 제 Center 키로 올린다. 외부 앱의 주소·키는 **어댑터 일꾼**의 설정에만 있다(아래).
- **열린 모드** (`BPM_CENTER__OPEN_MODE=1`, [ADR-0142](decisions/0142-open-mode.md)): 켜면 아래 등록 승인이 **받는 자리에서 저절로** 일어나고(회사가 하나뿐일 때 — 둘 이상이면 Studio는 그대로 기다린다), 일꾼이 일꾼 폴더 파일 없이 스스로 들어오고, **키 없는 호출이 관리자**다. 콘솔 로그인은 그대로다. 켜 두면 콘솔 위 막대에 「열린 모드」 배지가 선다. 보안을 어디까지 조일지 정하기 전까지의 자리이고, 지키는 것은 망(방화벽·역방향 프록시)뿐이다.
- Center API 키: **서버 실행기는 사람이 넣지 않는다** ([ADR-0092](decisions/0092-keys-are-issued-and-delivered-by-center.md)) — Center 주소만 주고 띄우면 등록 요청을 보내고, 관리자가 콘솔 CON-12 「승인 대기」에서 요청 코드(현장 화면·서버 로그)와 같은 줄을 승인하면 키를 받아 OS 비밀 저장소에 둔다. 만료 14일 전부터 Center가 갈아 준다. **Studio도 같다** — STU-10 「서버」에 주소를 넣고 「연결 테스트」를 누르면 요청 코드가 뜨고, 관리자가 CON-03 「Studio」 탭 「승인 대기」에서 승인하면 Studio 키(1년, 회전하지 않는다 — 만료되면 「다시 요청」)를 받는다. 개발·CI에서만 `BPM_CENTER__API_KEY`. Studio가 승인으로 받은 키는 OS 비밀 저장소(`bpm-studio`, 이름 `center`)로 가고, 비밀 저장소가 없는 환경(헤드리스 CI)에서는 관리자 토큰으로 발급한 Studio용 키를 `BPM_STUDIO__CENTER_API_KEY`로 준다(이것이 이기고, 그때 STU-10은 요청을 보내지 않는다).
- **앱마다의 설정·비밀**은 그 제품 문서에 있다 — 서버(Center·서버 실행기·일꾼·서비스 앱·모의 앱)는 [server/docs/setup.md](../server/docs/setup.md) ([ADR-0129](decisions/0129-product-folders.md)). 데스크톱 앱은 없다 ([ADR-0143](decisions/0143-design-happens-in-the-console.md)).

## 6. 포트

아래 기본값을 쓰고, 바꿔야 하면 설정 파일 또는 환경변수로 바꾼다. 코드에는 포트 숫자를 직접 쓰지 않는다 ([ADR-0011](decisions/0011-config-ports-env.md)). 이 표가 기본값의 원본이다.

| 구성요소 | 기본 포트 | 바인드 | 바꾸는 환경변수 |
| --- | --- | --- | --- |
| Center API | 8800 | 서버 | `BPM_CENTER__PORT` |
| Center 콘솔 (웹) | 8501 | 서버 | `BPM_CONSOLE__PORT` |
| 서비스 앱 (관리 API) | 8010부터 10씩 | 서버 | `BPM_SVC_<앱 id>__PORT` |
| 모의 앱 16개 (`samples/`, 개발·시험용) | 8010부터 10씩 — 순서는 `uv run bpm-mock-apps list` | **127.0.0.1** | `BPM_SVC_<앱 id>__PORT` |
| 통합 일꾼 (관리 API — 일꾼 콘솔이 부른다) | 8770 | 127.0.0.1 기본 (`BPM_CONSUMER__HOST`) | `BPM_CONSUMER__PORT` — 관리자 토큰(`BPM_CONSUMER__ADMIN_TOKEN`)이 없으면 띄우지 않는다 |
| 서비스 앱 관리 콘솔 (웹, `pnpm dev`) | 8001 | 개발 PC | — (`server/web/apps/svc-console/package.json`) |
| Ollama | 11434 | 로컬 또는 서버 | `BPM_LLM__BASE_URL` |

> 주의: 프로토타입과 같은 기본 포트다. 한 PC에서 프로토타입과 새 구성요소를 동시에 띄우면 충돌하므로, 그때는 환경변수로 한쪽을 옮긴다.
>
> 모의 앱은 `uv run bpm-mock-apps serve` 하나로 **전부 한 포트(8010)**에 `/<app_id>` 밑에 뜬다 — 열여섯 포트를 쓰지 않아도 된다. 인증 없는 제어 길(`/mock/v1/scenario`)이 있어 127.0.0.1에만 바인드한다 (`samples/README.md`).
>
> `docker compose`로 띄울 때는 `.env`의 `BPM_CENTER__HOST_PORT`·`BPM_CONSOLE__HOST_PORT`가 **호스트 쪽 포트만** 옮긴다 (컨테이너 안의 포트는 위 표 그대로다).

## 6-2. 데스크톱 앱 묶기

**없다** — 데스크톱 앱이 없어졌다 ([ADR-0143](decisions/0143-design-happens-in-the-console.md), M11 조각 5).
설계는 Center 콘솔의 웹 편집기에서 하고, 서버는 컨테이너 이미지로 간다
([server/docs/setup.md](../server/docs/setup.md)).

묶기·설치 파일·판 찍기가 어땠는지는 [ADR-0024](decisions/0024-desktop-packaging-extensions.md)·
[ADR-0067](decisions/0067-build-stamp.md)·[ADR-0068](decisions/0068-installer-inno-setup-per-user.md)에
남아 있다(셋 다 「대체됨」). **크로스플랫폼 코드 규칙은 그대로다** (CLAUDE.md §5) — RPA 데스크톱
일꾼이 Windows를 다시 데려온다.

## 6-3. 판 올리기 (데스크톱)

없다 — 데스크톱 산출물이 없어졌다 ([ADR-0143](decisions/0143-design-happens-in-the-console.md), M11 조각 5).
서버 판은 컨테이너 이미지가 들고 있다.

## 6-4. Center 백업

옮겼다 — [server/docs/setup.md](../server/docs/setup.md) 「Center 백업」 ([ADR-0129](decisions/0129-product-folders.md)).

## 7. 시험 돌리기와 **건너뛰는 것**

`uv sync --all-packages` → `uv run pytest`. `addopts`에 `-q`가 있으니 **`-q`를 또 주면 셈이 안 보인다**. 왜 건너뛰는지는 `uv run pytest -rs`가 말해 준다.

건너뛰는 것은 두 갈래다.

| 갈래 | 무엇 | 어디서 도나 |
| --- | --- | --- |
| **OS 전용** | 파일 권한 비트(`0600`)·설치 스크립트를 진짜로 만들지 않는 시험 (Windows가 아닐 때만) | 그 OS에서만 |
| **CI에 없는 조건** | `BPM_TEST_AUTOSTART=1` 작업 스케줄러 | 개발 PC에서 조건을 갖추면 |

그래서 같은 시험 묶음이라도 **OS마다 건너뛰는 것이 다르다** — 셈은 CI가 말해 준 값으로만 적는다.

**CI는 Linux x86_64 하나다** ([ADR-0144](decisions/0144-remove-the-pc-runner.md)가 Windows 잡을 걷었다 — 볼 클라이언트가 없다). Windows 쪽 타입은 `mypy --platform win32`가, 인코딩 실수는 `tests/integration/test_generators_on_windows_encoding.py`가 **Linux에서** 본다.

- **시험은 세 폴더 중 하나에 둔다** — `shared/`(계약·엔진)·`server/`(Linux만)·`integration/`(제품을 가로지르는 것, 저장소 전체 검사). 시험 도우미(`stub_model.py`·`waiting.py` 등)는 `tests/` 바로 밑에 있고, `tests/` 바로 밑에 시험 파일을 두면 `test_ci_scope.py`가 막는다. 자료만 든 폴더(`fonts/`)는 `ci_scope.DATA_FOLDERS`에 적는다.
- **서버 시험은 화면 코드를 끌고 오지 않는다** — 서버 컨테이너에 PySide6가 없다. 지금은 화면을 띄우는 시험 자체가 없지만(ADR-0143, M11 조각 5) `tests/integration/test_ci_scope.py`의 검사는 남겨 둔다 — 다시 섞이면 그때 바로 잡는다.
- `server` 표시는 남아 있어 `uv run pytest -m "not server"`로 서버 시험을 뺄 수 있다 (`tests/ci_scope.py`).

## 8. 확인 체크리스트 (M1 완료 시 채움)

- [x] Windows에서 clone → `uv sync` → 테스트 통과 (CI `windows-latest` = Windows Server, 그리고 **Windows 11 데스크톱**에서 이 문서만 따라 해 봤다 — 아래 실행 기록)
- [x] Linux에서 clone → `uv sync` → 테스트 통과 (CI `ubuntu-latest` x86_64 + 개발 PC aarch64)
- [x] ~~Windows에서 Studio 창이 뜬다~~ — 데스크톱 앱이 없어졌다 (ADR-0143, M11 조각 5)
- [ ] Linux 서버의 Center에 서버 실행기가 Center API 키로 등록·하트비트한다

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

