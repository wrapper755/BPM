# ADR-0129. 저장소 하나 안에서 제품 셋(server·studio·bot)과 공용(shared)으로 폴더를 나눈다

| 항목 | 값 |
| --- | --- |
| 상태 | 수락 (2026-11-04) |
| 날짜 | 2026-11-04 |
| 관련 | ADR-0004(저장소 하나), ADR-0019(패키지 이름), ADR-0104(서버 쪽 시험 표시), ADR-0130(이름을 BPM으로), `docs/01-architecture.md` §5·§8 |

## 배경

서버(Center·서버 실행기·어댑터 일꾼·콘솔), Studio, PC 실행기가 `apps/`·`packages/`·`web/`·`docs/`에 섞여 있다. 그래서 한 제품을 고치려 해도 어디까지가 그 제품인지 폴더만 보고는 알 수 없다. 문서도 같다 — `06-screens`·`04-setup`·`09-gaps`·`CLAUDE.md` §7에 세 제품의 규칙이 한 파일씩 섞여 있다.
제품마다 저장소를 따로 두는 길(BPMServer·BPMStudio·BPMBot)도 생각했지만, 엔진(`core`)·계약(`contracts`)을 **셋 모두가** 쓰고 Studio → Center → 실행기를 한 번에 거치는 인수 시험(M3·M5·M7)이 있다. 저장소를 나누면 계약을 고칠 때마다 판을 올려 배포하고 네 저장소의 CI를 맞춰야 한다.
경계를 먼저 폴더로 그어 보고, 저장소까지 나눌지는 그다음에 정한다.

## 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| A. 지금 그대로 (`apps/`·`packages/`) | 옮길 일이 없다 | 「서버만」·「Studio만」 보는 길이 없다. 문서가 계속 섞인다 |
| B. **저장소 하나, 제품 폴더 셋 + 공용** | 경계가 폴더로 보인다. 시험·CI·`uv.lock` 하나가 그대로 돈다. import 이름이 바뀌지 않아 코드는 거의 그대로다. 나중에 저장소를 나눌 때 폴더째 떼면 된다 | 경로를 적은 곳(CI·Dockerfile·시험·문서 링크)을 한 번에 고쳐야 한다. 진행 중인 브랜치가 모두 충돌한다 |
| C. 저장소 넷 (Core + 제품 셋) | 저장소마다 작다 | 계약 하나 고치기가 PR 넷과 판 배포가 된다. 앱을 가로지르는 시험을 둘 곳이 없다. 사내 패키지 저장소가 필요하다 |

## 결정

**B. 저장소 하나 안에서 `shared/`·`server/`·`studio/`·`bot/`으로 나눈다.** 저장소를 나누는 것(C)은 이 배치로 한동안 지낸 뒤 다시 본다.

### 폴더

```
BPM/
├─ pyproject.toml            # uv 워크스페이스 루트 — members = shared/*, server/*, studio/*, bot/*, samples/*
├─ uv.lock                   # 하나 그대로
├─ pnpm-workspace.yaml       # pnpm 루트를 저장소 맨 위로 올린다 (server/web/*, studio/canvas)
├─ CLAUDE.md                 # 셋 모두에 걸리는 규칙만
├─ shared/                   # 둘 이상의 제품이 쓰는 파이썬 멤버
│  ├─ contracts/  extension_api/  core/  llm/  qt/
│  └─ CLAUDE.md              # 엔진(core)·계약 규칙
├─ server/
│  ├─ center/  server_runner/  adapter_consumer/  service_kit/
│  ├─ web/                   # center-console, svc-console, packages/{ui,api-types,config}
│  ├─ deploy/                # compose, Dockerfile
│  ├─ docs/                  # 화면(CON·SVC)·설치·공백
│  └─ CLAUDE.md
├─ studio/
│  ├─ app/                   # 지금의 apps/studio
│  ├─ canvas/                # 지금의 web/packages/bpmn-canvas
│  ├─ docs/                  # 화면(STU)·설치·공백
│  └─ CLAUDE.md
├─ bot/
│  ├─ app/                   # 지금의 apps/bot_ui (PC 실행기 + 실행 프로세스)
│  ├─ docs/                  # 화면(BUI)·설치·공백
│  └─ CLAUDE.md
├─ packaging/                # Studio·PC 실행기를 함께 묶는다 (build.py 하나, 설치 스크립트 하나) — 그대로
├─ design/  scripts/  samples/  spikes/   # 그대로
├─ tests/
│  ├─ shared/  server/  studio/  bot/     # 한 제품 안의 시험
│  └─ integration/           # 제품을 가로지르는 시험 (M3·M5·M7 인수, 재통과, 의존 방향, 워크스페이스)
└─ docs/                     # 셋이 함께 보는 문서만
```

| 지금 | 옮길 자리 | 까닭 |
| --- | --- | --- |
| `packages/contracts`·`extension_api`·`core`·`llm` | `shared/` | 셋 모두 쓴다 (서버 실행기·어댑터 일꾼도 `core`를 쓴다) |
| `packages/qt` | `shared/qt` | Studio·PC 실행기 둘이 쓴다 |
| `packages/service_kit` | `server/service_kit` | 서비스 앱(서버)만 쓴다. `samples/`는 시험 거리라 제품으로 치지 않는다 |
| `apps/center`·`server_runner`·`adapter_consumer` | `server/` | 서버 (Linux) |
| `web/apps/*`, `web/packages/{ui,api-types,config}` | `server/web/` | 콘솔 둘만 쓴다 |
| `web/packages/bpmn-canvas` | `studio/canvas` | Studio의 캔버스 배포본을 만든다 (ADR-0029) |
| `deploy/` | `server/deploy/` | 서버 띄우기 |
| `apps/studio` | `studio/app` | |
| `apps/bot_ui` | `bot/app` | |

- **import 이름·배포 이름·CLI 이름은 이 ADR에서 바꾸지 않는다** — 폴더만 옮긴다(이름은 ADR-0130). src 레이아웃이라 폴더를 옮겨도 import 줄은 그대로다.
- **의존 방향은 그대로다**(`01-architecture.md` §5). 더해지는 규칙은 하나 — **제품끼리 import하지 않는다**(`server/*` ↔ `studio/*` ↔ `bot/*`). 지금도 앱끼리 import하지 않으므로 새로 막히는 것은 없고, `test_import_direction.py`의 표를 제품 단위로 다시 적는다.
- **서버 쪽 시험 표시**(ADR-0104)는 파일 이름 목록(`ci_scope.SERVER_SIDE`) 대신 `tests/server/`라는 폴더가 말한다. Windows CI는 그 폴더를 뺀다.
- `packaging/`은 옮기지 않는다 — 묶기 스크립트·설치 스크립트가 Studio·PC 실행기에 하나씩이라 나누면 같은 코드가 두 벌이 된다.

### 문서

| 지금 | 옮길 자리 |
| --- | --- |
| `00-vision`·`01-architecture`·`02-glossary`·`03-contracts/`·`05-roadmap`·`07-style-guide`·`08-business-examples/`·`decisions/`·`reference/` | **`docs/`에 그대로** (계약·용어·ADR은 제품을 가로지른다. ADR 번호도 하나로 이어 간다) |
| `06-screens/center-console.md`·`service-app-console.md` | `server/docs/screens/` |
| `06-screens/studio.md` | `studio/docs/screens.md` |
| `06-screens/bot-ui.md` | `bot/docs/screens.md` |
| `06-screens/README.md` (공통 규칙·화면 id 표) | `docs/06-screens.md` (한 파일로) |
| `04-setup.md` | 공통(도구·포트·환경변수 규칙·건너뛰는 시험)은 `docs/04-setup.md`, 제품별 띄우기는 `<제품>/docs/setup.md` |
| `09-gaps.md` | 줄마다 임자 제품의 `<제품>/docs/gaps.md`. 계약을 가로지르는 줄만 `docs/09-gaps.md`에 남긴다 |
| `CLAUDE.md` §7 | 「엔진」 → `shared/CLAUDE.md`, 「Center·콘솔」·서버 실행기 → `server/CLAUDE.md`, 「Studio」 → `studio/CLAUDE.md`, 「Bot UI·실행기」 → `bot/CLAUDE.md`. 맨 위 `CLAUDE.md`에는 §1~6과 「짓고 검사하기」·「시험」만 |

- 하위 폴더의 `CLAUDE.md`는 그 폴더의 파일을 다룰 때 함께 읽힌다 — 서버를 고칠 때 Studio 규칙을 읽지 않아도 된다.
- 계약 문서는 나누지 않는다. 계약 하나는 양쪽 제품의 약속이라 한쪽 제품 폴더에 두면 다른 쪽이 「남의 문서」가 된다.

### 옮기는 순서

PR 셋으로 한다. 각 PR은 **내용을 바꾸지 않고 자리만** 옮겨서 git이 이름 바꾸기로 알아보게 한다.

1. **코드 자리** — `git mv`로 위 표대로 옮기고, 경로를 적은 곳만 고친다: 워크스페이스 멤버, `[tool.mypy]`·`[tool.ruff]` 경로, `tests/test_workspace.py`의 `MEMBERS`, `test_import_direction.py`, CI(`ci.yml`·`desktop.yml`), Dockerfile·compose의 `COPY` 경로, `packaging/build.py`, 생성기(`scripts/gen_*.py`)의 출력 경로, pnpm 워크스페이스.
2. **시험 자리** — `tests/`를 제품별 하위 폴더로 나누고 `ci_scope.SERVER_SIDE`를 폴더 규칙으로 바꾼다.
3. **문서 자리** — 위 문서 표대로 나누고 `CLAUDE.md`를 쪼갠다. 문서 안 링크는 스크립트로 한 번에 고치고, 깨진 링크를 찾는 시험을 하나 더한다.

PR마다 확인: `uv sync --all-packages` → 전체 `pytest`·`ruff`·`mypy`·`mypy --platform win32`, 생성물 `--check` 넷, `pnpm typecheck`·`test`·`build`, `docker compose up`으로 서버가 뜨는지, 1번 PR은 Windows CI(`workflow_dispatch`)와 데스크톱 묶기 워크플로까지.

시작하기 전에: 진행 중인 브랜치(`long-external-tasks` 등)를 머지하거나 닫는다. 폴더를 옮긴 뒤에는 옛 브랜치가 대부분 충돌한다.

## 결과

- 이 결정으로 쉬워지는 것: 제품 하나를 고칠 때 볼 폴더·문서가 정해진다. Windows CI가 뺄 시험을 폴더가 정한다. 나중에 저장소를 나누면 `git filter-repo`로 폴더째 떼어 낼 수 있다.
- 어려워지거나 포기하는 것: 한 번에 거의 모든 경로가 바뀌어 진행 중인 브랜치가 충돌한다. `01-architecture.md` §8, `04-setup.md`, 기존 ADR 안의 옛 경로는 **ADR만 고치지 않는다**(ADR은 그때의 기록이다) — 새 경로는 이 ADR의 표로 찾는다.
- 다시 볼 조건: 제품마다 출시 주기가 달라져 판을 따로 매겨야 할 때, 또는 제품마다 다른 사람이 맡게 될 때 — 그때 저장소 나누기(선택지 C)를 다시 본다.
