# C17. Center API: 작업공간 (설계)

| 항목 | 값 |
| --- | --- |
| 상태 | **초안** (2026-11-13) — 아직 아무것도 돌지 않는다. [ADR-0143](../decisions/0143-design-happens-in-the-console.md)이 정한 「작업 폴더는 서버에 산다」를 전송으로 적은 것이다. 시험 실행의 알맹이(`bpm.core.testrun`)는 이미 돈다 (M11 조각 3a) |
| schema | 1 |
| 보내는 쪽 → 받는 쪽 | 콘솔(BFF) → Center, Center → 서버 실행기 (시험 실행·짓기는 C12 작업으로 내려간다) |
| 코드 위치 | (예정) Center `api/workspaces.py`, 서버 실행기 `testmode.py`. 알맹이는 `bpm.core.testrun` |
| 관련 ADR | [0143](../decisions/0143-design-happens-in-the-console.md), [0145](../decisions/0145-console-is-workspace-shaped.md), [0022](../decisions/0022-studio-canvas.md)(캔버스를 거쳐 고친다 — 웹에서도 그대로), [0109](../decisions/0109-studio-writes-decision-tables.md)(결정표는 캔버스 밖), [0028](../decisions/0028-replay-memory.md)(배운 것), [0082](../decisions/0082-batch-start.md)(맡기기), [0142](../decisions/0142-open-mode.md)(이 계약이 보안을 더 급하게 만든다) |
| 관련 화면 | CON-20 작업공간 (STU-01·02·04·05·06·07·08·09·12를 대신한다) |

## 목적

**설계자가 브라우저에서 BPM 프로세스를 만들고, 돌려 보고, 배포 후보로 만든다.** 작업 폴더가 서버에
살므로 그것을 읽고 고치는 길이 있어야 한다. 이것이 없으면 콘솔 안의 편집기가 고칠 파일이 없다.

**작업공간 하나 = BPM 프로세스 한 벌**이다 (ADR-0143 §1). 새 개념을 만들지 않는다 — 데스크톱
Studio의 「다른 이름으로 저장」 단위가 이미 그것이었다(정의 하나만 복사하면 그림의 process id가 겹친다).

## 전송

- 방식: HTTP `/api/v1/workspaces…` (C5와 같은 공통 규칙 — 오류 모양·`X-BPM-Actor`·페이지 넘기기).
- 인증: **콘솔 로그인 세션**(관리자 계정). 회사가 정해진 계정은 **제 회사의 작업공간만** 보고 고친다 (C16).
  자동화용 관리자 토큰도 받는다. **읽기 토큰은 읽기만** 하고 **Studio 키 종류는 없다** (ADR-0143 §4 —
  설계자의 키가 없어졌다).
- 남의 회사 것: **404**다 (있다는 것조차 알리지 않는다 — C16과 같은 결).
- 파일 본문은 `text/plain; charset=utf-8`(`.bpmn`·`.dmn`) 또는 `application/json`(`process.json`·케이스).

> **보기 전용 계정에 설계 권한을 주지 않는다.** 로그인 하나가 그림까지 고치게 되므로 역할을 가르는 일이
> 이 계약과 함께 급해졌다 ([ADR-0142](../decisions/0142-open-mode.md), `docs/09-gaps.md` §3-33).

## 모델

### WorkspaceInfo

| 필드 | 타입 | 필수 | 뜻 | 추가된 schema |
| --- | --- | --- | --- | --- |
| `id` | str | ✓ | `^[a-z0-9][a-z0-9._-]{0,63}$` — **C1 매니페스트 `id`와 같은 규칙**이다. 배포 후보를 지을 때 그대로 쓴다 | 1 |
| `name` | str | ✓ | 화면 이름 (1~100자) | 1 |
| `version` | str | ✓ | 다음에 지을 판 (C1 `version`) | 1 |
| `description` | str | | 설명 — 패키지로 간다 (C1 `description`) | 1 |
| `company` | str | ✓ | 이 작업공간의 회사 (C16). 만들 때 정해지고 바뀌지 않는다 | 1 |
| `place` | object | | 업무 자리 `{company, department?, staff?}` (C16, [ADR-0127](../decisions/0127-studio-picks-the-work-place.md)) | 1 |
| `entry` | str | | 진입 정의의 경로 (`process/<이름>.bpmn`). 없으면 아직 고르지 않았다 | 1 |
| `updated_at` | str | ✓ | 마지막으로 파일이 바뀐 때 | 1 |
| `updated_by` | str | ✓ | 그때의 행위자 | 1 |

`process.json`(작업 폴더 기록)이 원본이고 이 모델은 **그것을 읽어 보인 것**이다 — 담당자·태그처럼
매니페스트에 칸이 없는 값도 파일에는 그대로 남는다.

### FileInfo

| 필드 | 타입 | 뜻 |
| --- | --- | --- |
| `path` | str | 작업 폴더 안 **상대 경로** (`process/main.bpmn`, `cases/main.cases.json`, `libs/erp.shared@1.2.0/…`) |
| `size_bytes` | int | |
| `revision` | str | **내용 해시**다 (C2 `content_hash`와 같은 셈). 고칠 때 되돌려 보내 **덮어쓰기를 막는다** |
| `updated_at`·`updated_by` | str | |

### 경로 규칙

**받는 쪽이 경로를 믿지 않는다.** 다음을 모두 지켜야 하고 하나라도 어기면 422 `bad_path`다.

- 상대 경로이고 `/`로 가른다. `..`·절대 경로·드라이브 문자·심볼릭 링크를 받지 않는다.
- 첫 칸은 `process` · `cases` · `memory` 중 하나이거나, 뿌리의 `process.json`이다.
- 확장자는 자리마다 정해져 있다: `process/`는 `.bpmn`·`.dmn`, `cases/`는 `.cases.json`, `memory/`는 `specs.json`.
- `libs/`는 **쓸 수 없다** — 받아 둔 공유 BPM 프로세스라 설치가 넣는다 (§공유 BPM 프로세스 설치).

## 작업공간

| 길 | 권한 | 하는 일 |
| --- | --- | --- |
| `GET /workspaces` | 읽기 | 목록 (`?company=`·`?q=`) |
| `POST /workspaces` | 관리자 | 만들기 — 빈 한 벌(`process/`·`cases/`와 `process.json`). 같은 id가 있으면 409 `exists` |
| `GET /workspaces/{id}` | 읽기 | `WorkspaceInfo` |
| `PATCH /workspaces/{id}` | 관리자 | 이름·판·설명·업무 자리·진입 정의 (STU-06이 하던 일) |
| `DELETE /workspaces/{id}` | 관리자 | 지운다. **배포된 패키지는 그대로다** (패키지가 원본이고 작업공간은 그것을 짓는 자리다) |
| `POST /workspaces/{id}/import` | 관리자 | `.bpmn` 하나 또는 **옛 작업 폴더 zip**을 받아 넣는다 (ADR-0143 §2 — 밖에서 그린 그림이 들어오는 자리) |

## 파일

| 길 | 권한 | 하는 일 |
| --- | --- | --- |
| `GET /workspaces/{id}/files` | 읽기 | `FileInfo[]` — 탐색기가 그린다 |
| `GET /workspaces/{id}/files/{path}` | 읽기 | 본문. `ETag`가 `revision`이다 |
| `PUT /workspaces/{id}/files/{path}` | 관리자 | 쓰기. **`If-Match`에 지금 `revision`을 싣는다** — 다르면 409 `stale`이고 **아무것도 쓰지 않는다** |
| `DELETE /workspaces/{id}/files/{path}` | 관리자 | 지우기. 진입 정의는 거절(409 `entry_in_use`) |

- **Center는 BPMN을 해석하지 않는다.** 글자 그대로 담고 돌려준다 — 그림을 고치는 것은 **캔버스(bpmn-js)**이고
  (ADR-0022가 정한 규칙이 웹에서도 그대로다: 실행 취소 한 걸음·DI 순서·모르는 요소 보존) 결정표(.dmn)만
  캔버스 밖이라 편집기가 직접 쓴다 (ADR-0109).
- **검사는 쓰기를 막지 않는다** — C14 B1~B17·실행 전 검사는 **돌리기 전에** 본다 (§실행 전 검사).
  반쯤 그린 그림을 저장하지 못하면 설계가 되지 않는다.
- 두 사람이 같은 파일을 열면 **나중 사람이 409 `stale`을 받는다**. 합치지 않는다 — 합치면 XML이 깨진다.

## 시험 실행

**돌리는 것은 서버 실행기다** (ADR-0143 §3). Center는 **BPMN을 모르고 엔진도 없다** — `bpm-center`는
`bpm-core`를 의존하지 않는다(01-architecture §5). 그래서 Center가 하는 일은 **작업공간을 묶어 내려보내고
결과를 받아 적는 것**뿐이고, 엔진·케이스·판정은 모두 `bpm.core.testrun`이다.

| 길 | 권한 | 하는 일 |
| --- | --- | --- |
| `POST /workspaces/{id}/test-runs` | 관리자 | 시험 실행을 만든다. 본문 `{case?, mode}` (`mode`: `autonomous`\|`deterministic`). 케이스를 비우면 **비교하지 않는다** |
| `GET /workspaces/{id}/test-runs` | 읽기 | 목록 (최근 것부터) |
| `GET /workspaces/{id}/test-runs/{run_id}` | 읽기 | `TestRunInfo` — 상태·판정·로그 줄·노드 색·변수 |
| `DELETE /workspaces/{id}/test-runs/{run_id}` | 관리자 | 멈춘다 (「중지」 — 판정하지 않는다) |

### 내려보내기

- Center는 그 자리에서 **작업공간을 zip으로 묶는다** — 파일을 그대로 담을 뿐 매니페스트를 짓지 않는다
  (짓는 것은 그림을 읽는 일이라 Center가 못 한다). **케이스도 담는다** — 배포 패키지와 다른 점이다 (C1).
- 실행기는 C12 하트비트로 받는다. **배포와 같은 길이라 볼륨을 나눠 갖지 않는다** — 승인 봉투(C2)·서명이
  없고 `source: test`다. 실행 id는 `test_`로 시작한다 (C3 — 운영 실행과 한눈에 갈린다).
- 실행기의 **시험 모드 규칙**은 데스크톱 Studio가 지키던 것과 같다: 케이스가 답하고, **바깥으로 웹훅을
  쏘지 않고**(시험 수신기로만, C14 `$test_receiver`), 메일은 담아 두고, **맡기기는 케이스가 적어 둔
  결과로 끝낸다** (ADR-0082 — 맡길 패키지의 그림이 여기 없다).

> 미정: 시험 실행을 C12 `jobs[]`에 섞을지, 칸을 따로 둘지 (`test_jobs[]`). 섞으면 「빈자리만큼만」 규칙이
> 그대로 걸려 **운영 작업이 밀린다**. 따로 두면 상한을 따로 정해야 한다. 조각 3b에서 정한다.

### 결재와 확인은 C6으로 간다

**시험 실행의 결재도 Center 결재함에 올라온다** (C6). 답하는 길을 둘로 만들지 않는다 — 확인이 결재함으로
온 것과 같은 까닭이다 ([ADR-0144](../decisions/0144-remove-the-pc-runner.md)). 케이스가 답을 적어 두었으면
**실행기가 그 자리에서 답하므로 결재함에 오지 않는다**; 적지 않은 결재만 사람을 기다린다(기한 초과 시험).
목록에서 가르는 것은 **실행 id**다(`test_`).

### 배운 것은 돌려주고 Center가 적는다

자율 수행이 배운 재생 명세(`Run.learned`, [ADR-0028](../decisions/0028-replay-memory.md))는 **결과에 실려
올라오고 Center가 작업공간의 `memory/specs.json`에 적는다**. 엔진은 파일을 쓰지 않고, 실행기의 디스크는
그 실행이 끝나면 사라진다. **끝까지 간 실행만** 적는다.

### TestRunInfo

| 필드 | 타입 | 뜻 |
| --- | --- | --- |
| `run_id` | str | `test_`로 시작한다 |
| `state` | str | `queued`·`running`·`waiting`·`done`·`failed`·`cancelled` |
| `verdict` | str | `통과`·`실패`·`비교 안 함`·`중지`·`오류` (C14 비교 규칙 그대로) |
| `detail` | str | 한 줄 |
| `case` | str | 케이스 이름 (없으면 빈 글) |
| `mode` | str | `autonomous`\|`deterministic` |
| `log[]` | str | 로그 줄 (`Listener.said`가 낸 것) |
| `node_states` | object | `{노드 id: running\|done\|failed\|waiting}` — 캔버스 색 |
| `variables` | object | 지금 값. **업무 값이라 목록에는 키만** 보인다 (원칙 6·U10) |
| `learned` | int | 적은 재생 명세 수 |

## 실행 전 검사

| 길 | 권한 | 하는 일 |
| --- | --- | --- |
| `POST /workspaces/{id}/check` | 읽기 | C14 B1~B17 + 실행 전 검사를 `Violation[]`로 준다 |

**검사도 실행기가 한다** — 그림을 읽고(`contracts.bpmn_ext`) 확장이 깔렸나를 보는 일이라 Center가 못 한다.
결과 모양은 `core.testrun.readiness`가 내던 것 그대로이고 **오류만 돌리기를 막는다**(경고는 보인다).

> 미정: 매번 실행기를 거치면 느리다. 그림 검사(B1~B17)는 **contracts만** 있으면 되므로 Center가 직접 할
> 수 있고 사전 점검(확장·설정)만 실행기의 일이다. 가를지 말지는 조각 4f에서 정한다.

## 배포 후보로 만들기

| 길 | 권한 | 하는 일 |
| --- | --- | --- |
| `POST /workspaces/{id}/package` | 관리자 | 본문 `{kind}` (`bpm_process`\|`process_lib`). 지어서 **C5 패키지 후보로 등록한다** |

- **짓는 코드는 데스크톱 Studio가 쓰던 것 그대로다** (`core.testrun.packaging` — 매니페스트를 그림에서
  모으고, 시험 케이스는 넣지 않고, `content_hash`는 받는 쪽이 다시 계산한다, C1·C2).
- 그래서 **짓는 것도 실행기가 한다** — Center는 받은 zip을 **오늘 올리기와 똑같이** 검사한다 (C5
  `POST /packages`). 받는 쪽 코드가 바뀌지 않는 것이 이 길의 값이다.
- 올린 것은 **후보**다. 승인·배포는 바뀌지 않는다 (C2·C5·CON-06·CON-15) — 콘솔에서 설계한 것이 저절로
  현장에 가지 않는다.

> 미정: 실행기가 C5에 올리려면 **올리기 권한**이 있어야 한다 (지금 권한표는 Studio 키만 받는다, C5).
> 실행기 키에 그 권한을 더할지, Center가 실행기에서 zip만 받아 **제 이름으로** 등록할지 — 후자가 권한을
> 좁게 둔다. 조각 4f에서 정한다.

## 공유 BPM 프로세스 설치

| 길 | 권한 | 하는 일 |
| --- | --- | --- |
| `POST /workspaces/{id}/libs` | 관리자 | 본문 `{package_id, version}` — 그 공유 패키지를 `libs/`에 푼다 (STU-11이 하던 일, [ADR-0048](../decisions/0048-installing-shared-packages.md)) |
| `DELETE /workspaces/{id}/libs/{package_id}` | 관리자 | 제거 |

- 받은 것은 **편집 대상이 아니다** — 파일 쓰기가 `libs/`를 거부하는 까닭이다.
- 판은 `process.json`에 남고 배포 후보를 지을 때 `requires.libs`로 간다 (C1).
- **결정표(.dmn)도 함께 푼다** — 한쪽만 읽으면 「편집기에서는 되는데 현장에서 안 된다」가 된다.

## 오류

| 코드 | `code` | 언제 |
| --- | --- | --- |
| 400 | `bad_request` | |
| 403 | `forbidden` | 보기 전용 계정이 고치려 함 |
| 404 | `not_found` | 없는 작업공간·파일, **남의 회사 것** |
| 409 | `exists` | 같은 id의 작업공간 |
| 409 | `stale` | `If-Match`가 지금 `revision`과 다르다 — 아무것도 쓰지 않았다 |
| 409 | `entry_in_use` | 진입 정의를 지우려 함 |
| 422 | `bad_path` | §경로 규칙을 어겼다 |
| 422 | `no_entry` | 진입 정의 없이 돌리거나 지으려 함 |
| 503 | `no_runner` | 시험 실행·검사·짓기를 맡을 서버 실행기가 없다 |

## 호환 규칙

C5와 같다 — 모르는 칸은 **무시하고 버리지 않는다**(파일은 글자 그대로 담는다), 새 칸은 선택으로 더한다.

## 변경 이력

| 날짜 | schema | 바뀐 것 | ADR |
| --- | --- | --- | --- |
| 2026-11-13 | 1 | 초안 — 작업공간·파일·시험 실행·실행 전 검사·배포 후보로 만들기·공유 BPM 프로세스 설치 | [0143](../decisions/0143-design-happens-in-the-console.md) |
