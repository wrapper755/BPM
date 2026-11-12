# ADR-0144. PC 실행기를 걷는다 — BPM 프로세스는 서버에서만 돌고, PC가 필요한 일은 나중에 데스크톱 일꾼이 가져간다

| 항목 | 값 |
| --- | --- |
| 상태 | 수락 |
| 날짜 | 2026-11-12 |
| 관련 | 계약 C1·C2·**C4**·C5·C6·C12·C14·C15, [ADR-0016](0016-server-first.md)(서버 우선 — 이 결정이 그것을 끝까지 민다), [ADR-0102](0102-calling-outside-is-pull.md)(바깥 기능은 Pull), [ADR-0114](0114-remove-ui-automation.md)(UI 자동화를 걷어 PC가 할 일이 비었다), [ADR-0143](0143-design-happens-in-the-console.md)(같은 묶음의 결정), [ADR-0135](0135-agentic-automation-and-unified-consumer.md)(통합 일꾼 — RPA가 돌아올 자리), 화면 BUI-01~11·CMN-01 폐기 |

## 배경

**PC 실행기**는 현장 PC에 늘 떠 있는 트레이 앱으로, Center에 30초마다 하트비트를 보내 배포를 설치하고(C2) 작업 지시를
받아 BPM 프로세스를 자식 프로세스로 돌린다(C4·ADR-0023). 시작은 「화면을 조작하는 일은 사람 PC에서만 된다」였다.

그 전제가 둘로 무너졌다.

1. **서버 우선**(ADR-0016)으로 업무 대부분이 서버에서 돈다. PC BPM 프로세스는 「UI 조작·현장 확인·PC 전용 자원」일
   때만 쓴다.
2. 그중 **UI 조작이 없어졌다** — UI 자동화 확장을 통째로 걷었다(ADR-0114). 그래서 지금 PC 실행기가 PC여야만 하는
   까닭으로 하는 일은 **현장 확인 하나**이고, 업무 예제에서도 PC 실행 예제가 **FX-19 하나**, PC 위임이 **BX-16 하나**다.

사용자가 2026-11-12에 이렇게 짚었다: 「bot은 bpm 프로세스가 서버에서 실행하는 방식이고, rpa 관련작업만 desktop에
있는 worker가 작업하는 방식이 더 나을 것 같아서 존재이유가 계속없어짐.」

그 말이 **이미 있는 길을 가리킨다.** 바깥 기능을 부르는 길은 모두 **Pull**이다(ADR-0102·C15) — 부르는 쪽이 Center에
외부 작업을 올리고 **일꾼**이 가져간다. RPA도 「바깥 기능」이고, 통합 일꾼에 `rpa` 종류 칸이 **이미 있다**(ADR-0135,
지금은 시험용 가짜 처리기뿐). 즉 RPA는 **BPM 프로세스를 PC로 보내는 일**이 아니라 **외부 작업 하나를 PC의 일꾼이
가져가는 일**이다. 그러면 PC에 있어야 하는 것은 **일꾼**이고, 실행기·배포·대기열·하트비트가 아니다.

한편 PC 실행기를 들고 있는 값이 작지 않다 — 6,163줄, 시험 145개 파일 중 **66개**, 계약 C4 하나 통째, 그리고
**Windows 산출물·설치 파일·주간 Windows CI**가 그것 때문에 있다.

## 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| A. 그대로 둔다 | 현장 확인·PC 위임이 산다 | 쓰지 않는 길에 6,163줄과 시험 66개 파일, 계약 하나, OS 둘짜리 CI가 묶여 있다. 「있는데 안 쓴다」가 계약·화면·시험에 남는다 |
| B. **걷는다** — 실행은 서버뿐, 현장 확인은 Center 결재함으로, RPA는 나중에 데스크톱 일꾼 | 실행 경로가 **하나**다. C4의 절반·C2의 PC 쪽·PC 위임·전환 확인의 PC 갈래가 함께 없어진다. 데스크톱 산출물이 사라진다. RPA를 들일 때 **이미 있는 Pull**에 붙인다 | 되돌리기 비싸다. 현장 확인이 **PC 앞 사람**에서 **결재함**으로 바뀐다(아래 3). 「PC 전용 자원」(그 PC의 파일·장치)에 닿을 길이 없다 |
| C. 지우지 않고 로드맵에서만 내린다 | 되살리기 쉽다 | 시험 66개 파일이 계속 돌아 유지 비용이 그대로다. 사용자가 말한 「존재 이유」가 코드에 남는다 |
| D. 지금 데스크톱 일꾼까지 함께 만든다 | RPA 자리가 비지 않는다 | 걷을 RPA 확장이 **지금 없다**(ADR-0114). 쓰는 곳 없는 일꾼을 또 만드는 꼴이다 |

## 결정

**B다.** PC 실행기를 걷는다. 걷은 것과 그 자리는 이렇다.

### 1. 제품과 계약

- `bot/` 전부, 워크스페이스 멤버 `bot/app`, 명령 `bpm-bot-ui`·`bpm-bot-runner`, 화면 **BUI-01~11**.
- **계약 C4는 이름을 바꿔 산다** — `C4. Center API: 실행기 등록·하트비트`. PC 실행기만의 경로 넷
  (`POST /bot-ui/enroll`·`GET /bot-ui/enroll/{id}`·`POST /bot-ui/register`·`POST /bot-ui/heartbeat`)을 걷고,
  **서버 실행기가 함께 쓰는 모델**(`Readiness`·`ExtensionState`·`DeploymentResult`·`JobDispatch`·`JobAck`·
  `ApprovalDispatch`·`HeartbeatRequest`)은 남겨 `bpm.contracts.bot_ui` → **`bpm.contracts.runner`**로 옮긴다.
  C12(서버 실행기)가 그 위에 그대로 선다.
- **C2는 그대로다** — 설치 검증 V1~V7·`reconcile`(ADR-0113)은 서버 실행기가 쓴다. PC 설치 서술만 걷는다.
- PC 전용 코드: `core.processes`(Windows Job Object·프로세스 그룹), `core.outputs`(위임이 돌려주는 값),
  제어 파일(ADR-0031), 호출 토큰의 PC 쪽(`POST /call-tokens`는 서버 실행기가 쓰지 않으면 함께 걷는다).

### 2. 실행 위치 칸을 걷는다

- `bpm:process.runLocation`(C14)과 매니페스트 `run_location`(C1)을 **칸째로** 걷는다. 값이 하나뿐인 칸은 거짓말을
  하기 쉽다 — 「pc로 적으면 어떻게 되나」를 아무도 지키지 않게 된다. 옛 그림의 그 칸은 **B7이 모르는 칸으로 경고
  한 줄**을 말한다(판을 올리지 않는다 — 선택 칸이었다).
- B6(「서버에서 못 하는 것」)은 **없어지고** C1 R2는 **좁아진다** — 확인(`human.confirmation`)과
  현장 결재(`human.approval_field`)가 서버에서 되므로, 남는 것은 웹·데스크톱 AI 태스크뿐이다
  (그것은 ADR-0114가 걷은 판을 아직 못 돌린다). C1 R3·R10·R12(PC 공유 BPM 프로세스 호출·PC
  위임의 임자·자기 위임)는 **규칙째로** 없어진다.
- **C13 `task_types[].run_locations`도 걷는다** — 확장 태스크가 돌 자리가 서버뿐이라 그 선언이
  가릴 것이 없다(`KNOWN_RUN_LOCATIONS`·E 규칙·`extension_api`의 `run_location` 문맥·서버
  실행기의 `ExtensionHost(run_location=…)`·사전 점검 `task_types_wrong_location`도 함께).
  나중에 데스크톱 일꾼이 오면 그 일은 **확장 태스크가 아니라 외부 작업**으로 오고, 거기에는
  이미 종류 칸(`kind`)이 있다 (ADR-0135).
- [ADR-0015](0015-run-location.md)가 대체된다. 실행은 **Center가 관리하는 서버 실행기**가 맡고 동시 실행을
  허용한다는 쪽만 남는다.

### 3. 현장 확인은 Center 결재함으로 간다

확인(`manualTask` + `bpm:approval`)은 **기능을 잃지 않는다** — 답하는 자리만 바뀐다.

- 전에는 **어디서 답하나**를 그림이 골랐다 — `bpm:approval.location`이 `follow`·`center`·`field`이고,
  확인은 `field`(화면 앞 사람)로 고정이었다. 답하는 자리가 **하나뿐이 되었으니 칸을 걷는다** — 결재도
  확인도 **Center 결재함**이다(C6·CON-02). B6의 `location: field`·확인 조항, B12의 `location: center`
  경고, B13의 시간 제한 조항도 함께 걷는다.
- 확인에는 **담당자가 없다**는 규칙은 그대로 둔다 — 적으면 B12 경고다. 결재함에 보이는 확인은 **그 실행을 보는
  사람 누구나** 답한다. 「누가 답했나」는 `answered_by_as`로 변수에 받는다(ADR-0096).
- 공용 창 **CMN-01이 폐기된다**(`shared/qt`와 함께). 결재·확인을 그리는 자리는 콘솔 하나다.

### 4. PC 위임을 걷는다

[ADR-0062](0062-pc-delegation.md)(서버 BPM 프로세스가 한 부분을 PC에 맡긴다)가 **대체된다** — 맡길 PC가 없다.
C14 호출의 `delegate` 칸, C1 `requires.delegations`, C4 `JobAck.outputs`, C3 `source: delegation`·`parent_run_id`,
오류 코드 `DELEGATION_FAILED`, B14의 위임 대조, 케이스의 `delegations`(C14), 그리고 STU-06a 「PC BPM
프로세스로 나누기」([ADR-0071](0071-splitting-a-task-into-a-pc-bot.md))를 함께 걷는다.

전환 확인·결과 모름 확인([ADR-0106](0106-pc-escalation-asks-a-person.md)·[ADR-0107](0107-outcome-unknown-asks-a-person.md))은
**서버 갈래만 남는다** — 「서버는 늘 이 경계다」가 이제 규칙 전부다(`ESCALATED`·`TASK_FAILED`). 사람에게 묻는
갈래는 그 두 ADR의 본문에 남아 **결재함으로 물을 때** 다시 꺼낸다.

### 5. RPA는 나중에 데스크톱 일꾼이 가져간다 (지금은 기록만)

- 들일 때의 모양은 **이미 정해져 있다** — C15 외부 작업을 PC의 **일꾼**이 가져가고(ADR-0102), 종류는 `rpa`이며
  (ADR-0135) 통합 일꾼(`server/unified_consumer`)이 그 처리기를 엔트리 포인트로 찾는다. 즉 **새 계약이 필요 없다.**
- 그러므로 지금 만들지 않는다. 걷힌 RPA 확장(ADR-0114)을 다시 들일 때 **그때 새 ADR로** 정한다.
- **크로스플랫폼 코드 규칙(맨 위 `CLAUDE.md` §5)은 남긴다** — `pathlib`·`platformdirs`·`encoding="utf-8"`·
  stdout UTF-8·`sys.platform == "win32"`·인자 리스트. 데스크톱 일꾼이 Windows를 다시 데려온다.
- **Windows CI는 걷는다** ([ADR-0104](0104-windows-ci-runs-the-client-side.md)·[ADR-0108](0108-windows-ci-weekly.md)
  대체) — 볼 클라이언트가 없다. 인코딩 실수를 Linux에서 잡는 시험
  (`tests/integration/test_generators_on_windows_encoding.py`)은 **남긴다**(생성기·CLI는 그대로 한글을 찍는다).

### 6. 업무 예제

- **FX-19**(현장 확인)는 **서버 실행 + 결재함 확인**으로 바꾼다 — 예제를 지우지 않는다. 확인이라는 기능이 남았으니
  그것을 밟는 예제도 남아야 한다.
- **BX-16**의 PC 위임을 걷는다 — 그 조각은 서버에서 그대로 한다.
- 그래서 서버 예제가 48개 → **49개 전부**가 되고 `tests/integration/test_m5_pc_rerun.py`가 없어진다.
  예제는 `_source/spec_*.py`를 고쳐 다시 만든다 — **그림을 손으로 비틀지 않는다**.

## 결과

- 쉬워지는 것: 실행 경로가 **하나**다(서버 실행기). 계약 C4의 절반·C2의 PC 쪽·PC 위임·전환 확인의 두 갈래가
  없어져 「어느 쪽 이야기인가」를 묻지 않는다. 시험 66개 파일과 OS 둘짜리 CI가 가볍다. 결재와 확인을 그리는 자리가
  콘솔 하나다. [ADR-0143](0143-design-happens-in-the-console.md)과 합쳐 **데스크톱 산출물이 하나도 없다**.
- 어려워지거나 포기하는 것: **PC 전용 자원에 닿을 길이 없다** — 그 PC의 파일·장치·로그인된 세션. 현장 확인이
  「그 PC 앞 사람」에서 「결재함을 보는 사람」으로 바뀌므로 **「화면을 보고 답한다」는 보증이 사라진다**(담당자를
  두지 않는 규칙이 그 대신이다). 화면 조작 자동화는 ADR-0114에 이어 **더 멀어진다** — 다시 들일 때 실행기가 아니라
  일꾼으로 들어온다. 되돌리려면 C4의 PC 쪽·C2 설치·대기열을 **다시 짜야 한다**(본문은 아래 대체된 ADR에 남는다).
- 다시 볼 조건: RPA(또는 PC 전용 자원)가 실제로 필요해질 때 — **데스크톱 일꾼**으로 들인다(C15 Pull, 종류 `rpa`).
  BPM 프로세스를 PC로 보내는 길은 되살리지 않는다. 그때 Windows CI도 함께 되살린다.
- 대체한 것: [ADR-0012](0012-bot-ui.md)·[0014](0014-one-bot-per-pc.md)·[0015](0015-run-location.md)·
  [0023](0023-bot-ui-process-supervision.md)·[0031](0031-runner-control-file.md)·[0062](0062-pc-delegation.md)·
  [0071](0071-splitting-a-task-into-a-pc-bot.md)·[0104](0104-windows-ci-runs-the-client-side.md)·
  [0108](0108-windows-ci-weekly.md) 전부, 그리고 [0042](0042-extension-contributed-panels.md)·
  [0043](0043-turned-off-extensions.md)·[0063](0063-stopping-a-running-server-run.md)·[0092](0092-keys-are-issued-and-delivered-by-center.md)·
  [0106](0106-pc-escalation-asks-a-person.md)·[0107](0107-outcome-unknown-asks-a-person.md)·
  [0113](0113-field-follows-withdrawn-deployments.md)의 PC 쪽, 그리고
  [0038](0038-approval-request-channel.md)의 **현장 갈래**(요청 파일·제어 파일·`answered_in_field`) —
  결재 요청이 Center로 간다는 쪽은 그대로 산다.
