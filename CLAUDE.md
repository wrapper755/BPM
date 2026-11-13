# CLAUDE.md — BPM 작업 규칙

이 파일은 **지금 지켜야 할 규칙과 문서 위치**만 담는다. 200줄을 넘기지 않는다.
결정의 배경·이력은 여기 쓰지 않고 `docs/decisions/`에 ADR로 남긴다.

## 1. 프로젝트 한 줄

BPMN = 지도, AI = 운전사. **BPM 프로세스**(업무, Center가 배포). **서버 실행기**가 Center에서 받아 **서버에서** 실행한다 — **PC 실행기는 걷었다** ([ADR-0144](docs/decisions/0144-remove-the-pc-runner.md), RPA는 나중에 C15 데스크톱 일꾼으로 다시 온다). 공통 기능은 **확장**으로 붙고(**지금 깔린 확장은 없다** — UI 자동화 확장은 걷었고 다시 정리해 들인다, [ADR-0114](docs/decisions/0114-remove-ui-automation.md)), 서비스 앱은 확장의 서버 부분으로 BPM 프로세스가 Center의 외부 작업으로 부르는 서버 앱(대부분 LLM 앱)이다. **설계는 Center 콘솔의 웹 편집기에서 한다** — 데스크톱 Studio는 걷었다 ([ADR-0143](docs/decisions/0143-design-happens-in-the-console.md)). 개발 실행(시험 실행)은 자율 수행, 운영 실행은 결정 수행.
서버(Center, 서비스 앱)는 Linux 주이고 **데스크톱 산출물은 없다**. 자세히: `docs/00-vision.md`, `docs/01-architecture.md`, `docs/02-glossary.md`.

## 2. 문서 위치

| 필요한 것 | 파일 |
| --- | --- |
| 용어 | `docs/02-glossary.md` — 새 용어를 코드에 쓰기 전에 여기 먼저 추가 |
| 구조·경계 규칙 | `docs/01-architecture.md` |
| 구성요소 간 계약 | `docs/03-contracts/` |
| 화면 | `docs/06-screens.md`(공통 원칙·상태 표기), 제품 화면은 `server/docs/screens/` (무엇을 어디에) |
| 모양 (색·글자·구성요소·문구) | `docs/07-style-guide.md`, 토큰 원본 `design/tokens.json` |
| 결정과 이유 | `docs/decisions/NNNN-*.md` |
| 환경 구성·포트·**시험 건너뛰는 까닭** | `docs/04-setup.md`(공통), 제품마다 띄우기·설정은 `<제품>/docs/setup.md` |
| 단계·완료 기준 | `docs/05-roadmap.md` |
| 남은 공백 (M6 셋째 기준) | `docs/09-gaps.md`(계약·예제·여러 제품) + `<제품>/docs/gaps.md`(그 제품 화면, 번호는 그대로) — 계약·화면을 코드와 대조한 목록. 무엇을 만들지 고를 때 먼저 읽는다 |
| BPM 업무 예제·시험 묶음 | `docs/08-business-examples/` — `bpmn/`·`cases/`·`README.md`·`{finance,scm,hr,ops,feature-examples}.md`는 **생성물이다. 직접 고치지 않는다.** 원본은 `_source/spec_*.py`(예제 정의)와 `_source/exdsl.py`(DSL·생성기). 손으로 쓰는 것은 `writing-guide.md`뿐 |
| 프로토타입 참고 | `docs/reference/` |
| 예제가 부르는 모의 앱 | `samples/README.md` — 제품이 아니다. 거짓 데이터의 값은 **케이스가 정한다** |

## 3. 작업 순서 (반드시)

0. 예제를 고치면 → `_source/spec_*.py`를 고친 뒤 `uv run python docs/08-business-examples/_source/build.py`로 다시 만든다.
   끝내기 전에 `uv run python docs/08-business-examples/_source/build.py --check` (쓰지 않고 검사만, 어긋나면 1). 표준 라이브러리만 쓴다.
   `build.py`는 생성만 하지 않는다 — C14 검사(B3 짝·B11·B12), 호출 대상·DMN 입출력·케이스 필수 입력·결재 폼 칸 타입을 대조해 틀리면 아무것도 쓰지 않고 멈춘다. 커버리지 표와 마일스톤 시험 묶음도 예제에서 자동으로 계산한다.
1. 모르는 것 → `spikes/<주제>/`에서 실험. 실험 코드는 제품 코드에서 import 금지.
2. 실험이 끝나면 → ADR 작성 (`docs/decisions/template.md` 복사). 결론이 "안 된다"여도 쓴다.
3. 구성요소 사이 약속이 바뀌면 → `docs/03-contracts/`를 **먼저** 고치고, 그다음 코드.
4. 화면이 바뀌면 → 그 화면 문서(`<제품>/docs/screens*`, 공통은 `docs/06-screens.md`)를 **먼저** 고치고, 그다음 코드.
5. 구현 → 테스트 → 문서의 "상태" 갱신.
6. 엔진·태스크·확장을 바꾸면 → 영향받는 업무 예제(`docs/08-business-examples/README.md` 커버리지 표)의 케이스를 돌린다. 예제가 계약 공백을 드러내면 예제를 비틀지 말고 계약·ADR에 적는다.

결정을 뒤집을 때는 기존 ADR을 고치지 않는다. 새 ADR을 쓰고, 옛 ADR의 상태를 `대체됨(ADR-XXXX)`으로 바꾼다.

## 4. 문서 규칙

- 문서는 **현재 상태**를 쓴다. "전에는 X였는데 Y로 바꿨다"는 ADR로 보낸다.
- 한 파일이 커지면(대략 500줄) 나눈다. 모든 문서는 한국어, 코드·식별자는 원문 그대로.
- 확정되지 않은 내용은 `> 미정:` 또는 `> 제안:`으로 표시한다.
- "프로세스"를 단독으로 쓰지 않는다 (**예외 — Center 콘솔 화면 글은 「프로세스」다**, ADR-0121). 업무는 "BPM 프로세스"(설계·운영 화면 모두), OS 프로세스는 "<이름> 프로세스", 화면 있는 프로그램은 "<이름> UI"·앱 이름 (`docs/02-glossary.md` §0).
- 프로토타입 저장소 이름은 쓰지 않는다. "프로토타입 Studio·Bot / Center / UI 자동화 서버 / Worker"로 쓰고, 대응표는 `docs/reference/README.md` 한 곳에만 둔다.
- 화면 배치도의 상자 안에는 영문 영역 표시만 쓰고, 한글 설명은 표로 뺀다 (글꼴 폭 차이).

## 5. 코드 규칙 (크로스플랫폼 — 클라이언트는 Windows가 주 환경)

- 경로는 `pathlib.Path`만. 문자열로 `/` 붙이기, 하드코딩된 `/home/...`·`/usr/bin/...` 금지.
- 사용자 데이터·설정 위치는 `platformdirs`로 얻는다 (Windows `%LOCALAPPDATA%`, Linux `~/.local/share`).
- 파일 입출력은 항상 `encoding="utf-8"` 명시 (Windows 기본 인코딩은 cp949).
- **한글을 화면에 찍는 도구(생성기·CLI)는 stdout도 UTF-8로 고정한다.** Windows의 기본 코드페이지(cp949·cp1252)에서는 `print("경고: …")` 한 줄에 `UnicodeEncodeError`로 죽는다. `if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")`. `tests/integration/test_generators_on_windows_encoding.py`가 Linux에서도 막는다.
- 외부 프로세스는 `subprocess`에 인자 리스트로 넘긴다. `shell=True`, bash 전용 문법 금지.
- **HTTP 헤더 값에 한글을 넣지 않는다.** 헤더는 ASCII라서 보내는 쪽 라이브러리가 요청 자체를 거부한다 (httpx·undici 모두). 사람 이름 같은 값은 퍼센트 인코딩해서 싣고 받는 쪽이 디코딩한다 (C5 `X-BPM-Actor`). 토큰·키도 ASCII만 쓴다.
- **실행 자리는 서버 하나다** ([ADR-0144](docs/decisions/0144-remove-the-pc-runner.md)) — BPM 프로세스에 실행 위치 칸이 없고, Center가 관리하는 서버 실행기(`server/server_runner`)가 동시 실행으로 돌린다. 웹/데스크톱 AI 태스크는 돌릴 판이 없어 C1 R2·C14 B6이 막는다. **RPA는 나중에** C15 데스크톱 일꾼으로 다시 온다 (`docs/decisions/0016-server-first.md`).
- **결재와 확인은 둘 다 Center 결재함에서 답한다** (C6) — 현장 창구(CMN-01)는 PC 실행기와 함께 걷었다. 기다리는 실행은 상태를 저장하고 자리를 놓는다 (`docs/decisions/0054-server-run-state-and-concurrency.md`).
- OS 전용 기능(UIA/AT-SPI, 자동 시작, 비밀 저장소)은 인터페이스 뒤에 두고 구현을 OS별로 나눈다. OS 분기는 **`if sys.platform == "win32":`로 쓴다** — mypy가 그 비교만 보고 다른 OS의 코드를 지운다 (`IS_WINDOWS` 같은 별명 상수로 분기하면 Windows 전용 API가 Linux에서 오류가 된다). 개발 PC에서 `uv run mypy --platform win32`로 반대쪽도 본다 (CI에도 있다).
- 비밀 값(토큰·비밀번호)은 코드·설정 파일·실행 기록에 넣지 않는다. 환경변수 또는 OS 비밀 저장소(`keyring`).
- 포트 숫자를 코드에 직접 쓰지 않는다. 설정 모델의 기본값에만 둔다 (`docs/04-setup.md` §6).
- 환경변수는 `BPM_` 접두사, 중첩은 `__` (`BPM_CENTER__PORT`). **운영자·사용자에게 닿는 이름은 `BPM`이다** — 명령 `bpm-*`, 헤더 `X-BPM-*`, 키 앞머리 `bpm_ctr_`, BPMN 접두어 `bpm:`(URI `urn:chaeksas:bpmn:1`은 그대로), 식 `bpm-expr`. 파이썬 이름 `bpm.*`와 코드 안 식별자는 그대로다. 지나간 ADR의 `CHK`·`chk`는 [ADR-0126](docs/decisions/0126-operator-facing-names-say-bpm.md)의 표로 읽는다.
- 웹 화면은 Next.js(`server/web/`), 데스크톱은 PySide6. **Streamlit은 쓰지 않는다.** 색·크기·간격은 `design/tokens.json`의 토큰만 쓰고 값을 코드에 직접 쓰지 않는다. 상태 표시는 `status_map`의 표기와 색만 (`docs/07-style-guide.md`).
- 웹 화면의 브라우저 코드는 서버 API·토큰을 직접 다루지 않는다. Next.js 서버 쪽(BFF)이 부른다. API 타입은 계약 JSON Schema에서 생성한다.
- **공통 기능은 확장으로 붙인다** (`docs/decisions/0018-extensions.md`). 플랫폼 코드(`core`, 제품 앱 `server/*`)는 특정 확장을 import하지 않고 `shared/extension_api`와 엔트리 포인트 `bpm.extensions`로만 다룬다. 확장 하나는 `extensions/<id>/` 폴더 하나(정의·계약·서버·클라이언트 기여) — **지금은 하나도 없다**(ADR-0114, 들일 때 워크스페이스 멤버에 `extensions/*`를 다시 더한다). 외부 앱은 확장 정의의 HTTP 어댑터로 붙이고 코드를 기여하지 않는다(그 어댑터는 **어댑터 일꾼**이 돌린다).
- **BPM 프로세스가 바깥 기능을 부르는 길은 모두 Pull이다** ([ADR-0102](docs/decisions/0102-calling-outside-is-pull.md), C15) — 부르는 쪽은 Center에 **외부 작업**을 올리고 **일꾼**이 Center에서 가져간다. 현장에 서비스 앱 주소·키가 없다.
- 모든 서비스 앱은 `server/service_kit`으로 만들고 공통 계약 C11(수행 모드, 일꾼 루프, 관리 콘솔)을 지킨다. 패키지·BPM 파일에 키 값을 넣지 않는다.
- 결정 수행에서 LLM을 몰래 부르지 않는다. 폴백은 manifest 정책으로만. **재생이 깨져도 자율로 넘어가지 않는다** — `TaskFailed`로 올려 오류 경계가 받게 한다 ([ADR-0028](docs/decisions/0028-replay-memory.md)).

## 6. 프로토타입 저장소

프로토타입 4개는 **읽기 전용 참고**다. 수정·import·경로 의존 금지. 개발 PC에 없을 수 있다 — `docs/reference/`만으로 뜻이 통하게 되어 있다.
코드를 가져올 때는 복사한 뒤 이 저장소 규칙에 맞게 고치고, 출처를 커밋 메시지에 남긴다.

## 7. 현재 상태

**M5까지 끝, M6·M7 진행 중. M11(하나의 웹)이 진행 중이다** — **PC 실행기를 걷었다** ([ADR-0143](docs/decisions/0143-design-happens-in-the-console.md)·[ADR-0144](docs/decisions/0144-remove-the-pc-runner.md)·[ADR-0145](docs/decisions/0145-console-is-workspace-shaped.md)). 계약 **열둘이 「구현됨」**이다(C1~C7·C11~C15 — C8~C10은 UI 자동화 확장과 함께 걷었다, ADR-0114; **C4는 「실행기 ↔ Center 공통」**이 되어 경로가 C12 하나다). **C17(작업공간)은 초안이지만 전송이 다 돈다** — 작업공간·파일·묶음·시험 실행·실행 전 검사·배포 후보 짓기·공유 BPM 프로세스 설치가 양쪽에 있고, **화면**(CON-20)도 탭 셋이 돈다 (M11 조각 4). **C15(외부 작업)로 바깥 기능을 부르는 길이 모두 Pull이 되었다** ([ADR-0102](docs/decisions/0102-calling-outside-is-pull.md), 로드맵 M9 — Center `api/external_tasks.py`, 부르는 쪽 둘, 서비스 앱·어댑터 일꾼) (**맡기기도 양쪽이 돈다** — ADR-0082). 상태 셋(초안·합의·구현됨)의 뜻은 `docs/03-contracts/README.md` §상태에 있고, 목록의 「상태」가 각 문서 머리말과 어긋나면 시험이 깨진다. **아직 없는 것은 여기 적지 않는다** — `docs/09-gaps.md`(계약·화면을 코드와 대조한 공백 목록)가 왜 남았고 먼저 정할 것이 무엇인지까지 들고 있고, 단계는 `docs/05-roadmap.md`에 있다. 지나온 조각의 이력은 **git log**에 있다 — 여기 쓰지 않는다 (§4). 아래는 **지금 도는 것과 지켜야 할 규칙**뿐이다.

도는 것: `contracts` C1~C7·C11~C15(DMN 포함), `core`(엔진·식·파일·보내기·서비스 앱·HTTP 어댑터·AI 태스크·도구·재생·확장 호스트·**시험 실행 `core.testrun`** — 작업 폴더·케이스·패키지 짓기·실행 전 검사가 화면을 모른다, ADR-0143), `service_kit`, `extension_api`, `server/center`(API 전부 — **C5 권한표대로 키 종류를 가린다**, `uv run bpm-center`. **작업공간**도 여기 산다 — `workspaces.py`·`trials.py`·`design_work.py`·`libs.py`, C17), `server/web/`의 **Center 콘솔 CON-00·01·02·03·04·05·06·12·13·14·15·17·18**과 **작업공간 CON-20**(탭 셋이 돈다 — M11 조각 4), **서비스 앱 콘솔 SVC-00~03**. 서버는 `server/deploy/compose.yaml` 한 번으로 Center + 콘솔 + 서버 실행기가 뜬다(실행기 키는 비밀 볼륨 — ADR-0100). 프로필 `consumer`면 통합 일꾼도 뜨고 회사 업무 처리기는 그 이미지 위에 얹는다(ADR-0140). **보안은 지금 「열린 모드」로 지나간다** ([ADR-0142](docs/decisions/0142-open-mode.md)) — `BPM_CENTER__OPEN_MODE`를 켜면 콘솔 로그인 외에 키 등록이 없다(등록 요청 자동 승인·일꾼 자가 들이기·키 없는 호출은 관리자). **관문 코드는 다 남아 있다** — 걷지 않았다. 어디까지 조일지는 `docs/09-gaps.md` §3-33에 미뤘으니 **거기에 손대기 전에 읽는다**. 서버 실행기는 **시험 모드**로도 돈다 (`testmode.py` — 작업공간 묶음을 받아 `core.testrun`으로 돌리고 검사·짓기까지 한다, [ADR-0146](docs/decisions/0146-design-work-has-its-own-lane.md)). 서버 실행기의 규칙은 [server/CLAUDE.md](server/CLAUDE.md)에 있다.

**제품마다의 규칙은 그 폴더의 `CLAUDE.md`에 있다** ([ADR-0129](docs/decisions/0129-product-folders.md)) — 그 폴더의 파일을 다룰 때 함께 읽힌다.

| 폴더 | 담는 것 |
| --- | --- |
| [`shared/CLAUDE.md`](shared/CLAUDE.md) | 엔진(`core`) — 실행·기다림·`RunEnv`·식·재생·AI 태스크·도구·결재 칸·C14 검사 |
| [`server/CLAUDE.md`](server/CLAUDE.md) | Center·콘솔·서버 실행기·일꾼·서비스 앱 |

### 짓고 검사하기
- `uv sync --all-packages` → `uv run pytest` (**2620개 중 2616개 통과·4개 건너뜀** — M11 조각 5 브랜치, 개발 PC. Qt를 걷으며 시험 900개쯤이 함께 없어졌다. 웹은 따로 — `pnpm test` 208개). 검사는 `uv run ruff check .`·`uv run mypy`(인자 없이 — 경로는 `pyproject.toml`에). **건너뛰는 것과 그 까닭은 `docs/04-setup.md` §7**에 있다. **CI는 Linux x86_64 하나다** — PR마다 pytest·ruff·mypy(`--platform win32`도)·생성물 최신 여부를 본다. **Windows 잡은 걷었다** ([ADR-0144](docs/decisions/0144-remove-the-pc-runner.md) — 볼 클라이언트가 없다. 크로스플랫폼 코드 규칙은 §5에 그대로이고 인코딩 실수는 `tests/integration/test_generators_on_windows_encoding.py`가 Linux에서 잡는다) (개발 PC는 Linux aarch64). 경로를 비교할 때 `str(path)`가 아니라 `as_posix()`를 쓴다.
- **생성물은 잊으면 깨진다** (`--check`가 pytest·CI에 있다): 계약 모델 → `uv run python scripts/gen_schemas.py`, 토큰 → `gen_tokens.py`(명암비·간격 배수 검사 — **BPM 흐름 마크**(`design/bpm-mark.svg` → `BpmMark`·콘솔 탭 아이콘)도 여기서 짓는다, ADR-0118), 웹 타입 → `server/web/`에서 `pnpm gen:api-types`(**계약을 고치면 스키마 → 타입 두 단계다**), moddle 설명 → `gen_moddle.py`, 콘솔 화면 목록 → `gen_console_pages.py`. **확장이 소유한 계약도 생성한다** — `gen_schemas.py`가 엔트리 포인트로 확장을 찾아 `<패키지>.contracts.SCHEMA_MODELS`를 읽고 **그 확장의 `schemas/`**에 쓴다(생성기에 확장 이름이 없다). 그래서 콘솔 화면이 손으로 타입을 쓰지 않는다.
- 웹은 `server/web/`이고 pnpm은 **저장소 맨 위에서** 부른다 (`pnpm install` → `pnpm dev`·`pnpm typecheck`·`pnpm build`·**`pnpm test`**). `pnpm test`는 **화면을 모르는 함수만** 재는 vitest다(브라우저·React를 띄우지 않는다) — CON-02의 집계가 첫 자리이고, 세는 코드는 페이지가 아니라 `lib/summary.ts`에 둔다(페이지는 `server-only`를 끌고 와 단위 시험에서 못 부른다). 색·크기는 `design/tokens.json`에서 온 토큰만, 상태 표기는 생성된 `status-map.ts`에 있는 것만 쓴다.
- import 이름은 `bpm.<이름>`, 확장은 `bpm.ext.<id>` ([ADR-0019](docs/decisions/0019-package-names.md), 이름은 [ADR-0130](docs/decisions/0130-rename-to-bpm.md)). 사람에게 보이는 이름은 대문자 BPM, 식별자(import·배포·CLI·웹 범위·데이터 폴더)는 소문자 `bpm`이다. 옛 이름(Chaeksas)은 `core.legacy_names`에만 적는다(옛 데이터 폴더·키·자동 시작을 옮긴다). BPMN 이름 공간 `urn:chaeksas:bpmn:1`·봉함 `chaeksas-seal-v1`·설치 AppId·compose 볼륨 이름은 **그대로 둔다**. `src/bpm/`에 `__init__.py`를 만들면 조용히 깨진다. 의존 방향은 `tests/integration/test_import_direction.py`가 막고, 새 멤버를 더하면 `tests/integration/test_workspace.py`의 `MEMBERS` 표도 고친다.
- 계약은 **문서(`docs/03-contracts/`)가 원본이다.** 문서의 JSON 예시를 테스트가 **문서에서 뽑아** 검증하니(`tests/shared/test_contract_examples.py`) 예시도 같이 고친다.
- 확장은 엔트리 포인트 `bpm.extensions`로 찾는다. 확장을 더하면 `extension.json`을 그 확장의 **파이썬 패키지 안**에 두고(호스트가 `importlib.resources`로 읽는다) `pyproject.toml`에 엔트리 포인트를 적는다. 기여의 `entry`는 그 확장 패키지 안만 가리킨다. **설치 파일에 넣는 일은 없다** — 데스크톱 묶기는 Qt와 함께 걷었다 (ADR-0143).

### 시험
- **인수 시험은 묶음을 README의 표에서 읽는다** — `tests/shared/test_m3_acceptance.py`(시험 실행 — **Qt를 띄우지 않는다**, ADR-0143). **M5 묶음은 `test_m7_server_rerun.py`가 덮는다** (M11 조각 5 — 같은 예제를 같은 모의 앱으로, 모는 쪽만 서버 실행기다. 그 시험이 README의 M5 줄과 대조한다). M4 묶음은 UI 자동화와 함께 걷었다 (ADR-0114). 막히는 것이 생기면 **`REMAINING`에 이유를 적고** 넣는다(조용히 빼면 묶음이 거짓말을 한다). 모델은 127.0.0.1 스텁(`tests/stub_model.py`가 공용으로 준다 — 도구를 부르지 않고 최종 JSON만 답한다). **짜 둔 답의 자리도 하나다** (`tests/canned_answers.py` — M3·M5·M7이 같은 것을 쓴다. 묶음마다 따로 두면 **같은 그림이 묶음에 따라 다른 답을 받는다**. 열쇠는 `results` 이름들을 정렬한 튜플이고 **겹치면 시험이 막는다** — 겹친 열쇠는 먼저 적힌 쪽이 이겨 뒤쪽 예제가 남의 답을 받는다), 표본 파일은 시험이 그 자리에서 만든다(**바깥에 나가지 않고 저장소에 이진 파일을 두지 않는다**). 시험하는 것은 모델의 똑똑함이 아니라 **엔진·케이스·기대값이 한 줄로 맞물리는가**다. 재생 쪽은 **판정이 같은 것**과 **정말 되밟은 것**(`node_state: replayed`)을 함께 본다. **맡기기(`bpm:call.delegate`)의 결과는 케이스가 적는다** (C14 `delegations`, ADR-0082) — 시험 실행에는 맡길 패키지의 그림이 없다.
- **예제 재통과는 `tests/server/test_m7_server_rerun.py`다** — 예제 **49개 전부**를 **그림에서 읽어** 배포·설치는 **전부**, 끝까지 도는 것은 **지금 47개**를 보고, **FX-24는 전용 시험**이 본다 (`ELSEWHERE` — 일괄 기동이라 맡길 FX-25도 같은 실행기에 배포되어 있어야 한다). **갈래 셋을 합쳐 49개와 맞춰 본다** — 조용히 빠지는 일이 없다. 결재는 **Center 결재함**(C6)에, 메시지는 **Center 메시지 API**(C12)에 넣는다 — 서버에는 현장 창구가 없다. 외부 확장 둘은 **서명 봉투로 등록**해야 배포가 통과하고(C13 E6 — C11로는 못 한다) **각자 포트**에 띄워야 한다(어댑터는 `base_url`의 경로를 버린다). 모델·읽기 폴더·서비스 앱 키·**보내기**는 설정·환경변수에서 받아 꽂고(메일은 묶음이 띄운 작은 SMTP 서버로 간다) **바깥 앱 명부는 실행기가 제 손으로 받는다**. **웹훅은 묶음이 시험 실행과 같은 수신기·같은 입력 리졸버로 받는다**(`core.testrun.receiver`·`resolve_inputs` — `$test_receiver`·`$now_plus`는 C14 시험 케이스 형식이고 작업 지시에는 없다). 127.0.0.1은 제품 규칙으로 막히므로 **묶음만 사설망을 연다**(`BundleSettings` — 제품 설정에 그 스위치는 없다, ADR-0059 §2. 막는 규칙 자체는 `test_core_senders`가 본다). **표본 파일은 묶음이 만든다** (`tests/sample_files.py` — **M3와 같은 자리**다. 저장소에 이진 파일을 두지 않고, 장부 값은 짜 둔 답과 **같은 표**에서 온다. 빈 폴더도 함께 만든다 — git이 빈 폴더를 담지 않는다). 못 도는 것은 **BX-33 하나**이고 **일부러 실패하는 교육 예제**다 (ADR-0039 — 의도한 실패를 따로 본다). **사유는 돌려 보고 적는다** — 첫 실패만 보고 적은 일곱이 조각 9에서 틀린 것으로 드러났다. **조용히 빼지 않는다.**
- `tests/shared/test_core_engine.py`의 `test_no_example_breaks_the_engine_in_an_unexpected_way`가 **진행 눈금**이다 — 예제 49개를 돌려 끝까지 가는 것·기다리는 것을 적어 두고 조각마다 그 수를 올린다 (지금 끝 26·대기 10).
- **예제가 부르는 앱 16개는 `samples/mock_apps`에 있다** (제품이 아니다 — 아무 멤버도 의존하지 않는다). `uv run bpm-mock-apps serve`가 **일꾼 하나**로 C11 앱 열넷을 맡아 Center에서 가져가고(외부 둘은 각자 포트 — 어댑터 일꾼이 부른다) 모의만의 제어 길은 한 포트에 `/<app_id>`로 띄운다. **C11 앱 열넷**은 `service_kit` 위이고 사내 확장의 서버 부분이라 manifest의 `extension` 칸으로 C7에 뜬다. **외부 앱 둘**(`ext-credit`·`ext-helpdesk`)은 **`service_kit`을 쓰지 않는다** — C11로 답하면 어댑터가 하는 일(템플릿·제한 JSONPath·`error_when`)을 하나도 시험하지 못한다. 정의는 주소를 담아 커밋할 수 없어 `bpm-mock-apps definition`이 그 자리에서 쓴다. **거짓 데이터의 값은 케이스가 정하고** 시험이 **예제의 DMN을 실제로 돌려** 대조한다(눈으로 맞춘 숫자가 아니다). 입력이 같은데 답이 달라야 하는 BX-08은 모의만의 제어 길(`/mock/v1/scenario`)로 가른다 — **C11에는 그런 길이 없다**(그래서 경로를 떼어 두고 127.0.0.1에만 바인드한다). **부르는 예제가 없어진 앱은 두지 않는다** — `center-jobs`(Center 작업 지시를 감싼 우회)는 걷어냈고, 「예제가 부르지 않는 작업」 검사가 그것을 잡아 준다.
