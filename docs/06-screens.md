# 06. 화면 설계서

> 상태: **검토 완료 (2026-10-01, 독립 검토 22건 반영).** 프로토타입에서 실제로 쓰며 다듬은 화면을 바탕으로, 새 용어·새 구조(서비스 앱, 확장)에 맞게 다시 설계했다. "신규" 표시는 프로토타입에 없던 화면이다.
> 화면이 바뀌면 **코드보다 이 문서를 먼저** 고친다 ([ADR-0002](decisions/0002-docs-first-and-adr.md)).

## 0. 구현 기술과 모양

- 웹 화면(Center 콘솔, 서비스 앱 관리 콘솔)은 **Next.js**, 데스크톱(Studio)은 **PySide6**. 둘 다 같은 디자인 토큰(`design/tokens.json`)과 [스타일 가이드](07-style-guide.md)를 따른다 ([ADR-0017](decisions/0017-web-nextjs-design-system.md)).
- 화면 설계서는 **무엇을 어디에 보이는가**를 정하고, **어떻게 보이는가**(색·글자·구성요소)는 스타일 가이드가 정한다.

## 1. 문서 구성

| 파일 | 앱 | 화면 ID |
| --- | --- | --- |
| ~~Studio (Windows 데스크톱)~~ | **폐기** — 설계가 콘솔 안으로 옮겼다 ([ADR-0143](decisions/0143-design-happens-in-the-console.md), M11 조각 5) | ~~STU-01 ~ STU-16~~ → CON-20 |
| [server/docs/screens/center-console.md](../server/docs/screens/center-console.md) | Center 콘솔 (웹) — 관리자 계정으로 승인·배포까지 ([ADR-0090](decisions/0090-center-admin-accounts.md)) | CON-00 ~ CON-18 (CON-07~11 폐기) · CON-20은 아래 파일 |
| [server/docs/screens/center-console-connections.md](../server/docs/screens/center-console-connections.md) | Center 콘솔 — 일꾼·연결 앱 (위 파일을 나눈 것) | CON-17 · CON-18 |
| [server/docs/screens/center-console-workspace.md](../server/docs/screens/center-console-workspace.md) | Center 콘솔 — 작업공간 (설계가 콘솔 안으로, [ADR-0143](decisions/0143-design-happens-in-the-console.md)) | CON-20 |
| [server/docs/screens/service-app-console.md](../server/docs/screens/service-app-console.md) | 서비스 앱 관리 콘솔 (웹, 앱마다) | SVC-00 ~ SVC-03 |


### 표기 규칙

- **화면 ID:** `<앱>-<두 자리 번호>`. 번호는 재사용하지 않는다. 화면을 없애면 "폐기"로 남긴다.
- **배치도:** 영문 글자 영역 표시(`[A]`, `[B]`…)로 그리고, 영역 내용은 바로 아래 표에 쓴다. 한글은 글꼴마다 폭이 달라 상자 안에 넣으면 줄이 어긋나기 때문이다.
- **라벨:** 화면에 보이는 문구는 `「」`로 감싼다. 예: 「실행...」.
- **단축키:** Windows 기준으로 쓴다.

## 2. 공통 UX 원칙 (프로토타입에서 배운 것)

| # | 원칙 | 왜 (프로토타입에서 일어난 일) |
| --- | --- | --- |
| U1 | 사용자에게 보이는 단위는 **BPM 프로세스**다. 파일을 고르면 그것이 속한 BPM 프로세스로 열고, 속한 곳이 없으면 가져와 새 BPM 프로세스로 만든다 — **BPM 프로세스 없이 파일만 열지 않는다** | `.bpmn` 파일을 직접 열면 어느 BPM 프로세스에 속하는지 잃어버렸다 |
| U2 | 내부 id는 숨기고 이름과 한국어 종류를 먼저 보인다. id는 툴팁에 | id가 앞에 나오면 사용자가 무엇인지 알아보지 못했다 |
| U3 | 고를 수 없는 선택지는 **그 자리에 이유를 쓴다.** 툴팁에 숨기지 않는다 | 회색 버튼 세 개의 이유가 툴팁에만 있어 아무도 몰랐다 |
| U4 | 문맥 메뉴는 **지금 고른 항목의 동작만** 보인다 | 회색 항목이 섞인 긴 메뉴가 어지러웠다 |
| U5 | 실행 버튼은 실행 중에 **중지 버튼**이 된다 (모든 실행 방식에서) | 7분 동안 같은 셀을 읽는 태스크를 앱을 죽여서만 멈출 수 있었다 |
| U6 | 판정은 세 갈래: 「통과」 / 「실패」 / 「비교 안 함」 | 기대 결과가 비어 있는데 「통과」로 보였다 |
| U7 | **색만으로 뜻을 전하지 않는다.** 색 옆에 항상 글자 | 트레이 점 색만으로는 상태를 구분하지 못했다 |
| U8 | 서버에 닿지 못하면 **"모른다"고 쓴다.** 추측해서 "새 화면" 등으로 말하지 않는다 | 오프라인일 때 등록된 화면을 새 화면이라고 안내했다 |
| U9 | 되돌릴 수 없는 동작은 경고 창 + **기본 단추는 취소**. 서버가 409(다른 것이 참조 중)를 주면 두 번째 확인 후에만 강제한다 | 화면 삭제가 다른 화면의 경로를 말없이 끊었다 |
| U10 | 업무 값은 기본으로 **접어 둔다.** 목록에는 키만, 값은 펼쳐야 보인다 | 실행 기록·결재 목록에 개인정보가 그대로 보였다 |
| U11 | 저장 안 한 변경은 「저장」 / 「저장 안 함」 / 「취소」로 묻는다. 적용 안 한 속성 편집은 「적용」 / 「버리기」 / 「머무르기」 | 다른 요소를 누르는 순간 편집이 사라졌다 |
| U12 | 빈 상태 문구는 **다음에 할 일**을 말한다. 예: 「BPM 프로세스가 없습니다. 파일 → 새 프로세스...로 만드세요.」 | 빈 화면에서 무엇을 할지 몰랐다 |
| U13 | 실패는 **한 줄 요약 먼저**, 상세(스택 등)는 그 아래 | 스택 맨 끝에서 원인을 찾아야 했다 |
| U14 | 버튼은 **영향을 주는 영역의 오른쪽 위**에 둔다. 할 일이 없는 버튼은 비활성. 영역 제목·단계 번호·불필요한 「확인」 버튼을 두지 않는다 | 화면 등록 탭에서 버튼 위치가 흩어져 순서를 헷갈렸다 |
| U15 | 상주 앱은 창을 닫아도 계속 돈다. 그래도 **메뉴에 「종료」가 항상 있다** | OS가 트레이를 숨기면 끌 방법이 없었다 |
| U16 | 결재(업무)와 확인(실행 중 막힘)은 **창 제목부터 다르게** 보인다 | 둘 다 "HITL"이라 누가 답해야 하는지 헷갈렸다 |
| U17 | 진행 중 작업은 화면을 멈추지 않는다. 느린 일은 배경에서 하고, 결과는 상태 줄·알림으로 | 등록 중 창이 굳었다 |

## 3. 공통 상태 표기

같은 상태는 모든 앱에서 같은 글자·같은 색으로 보인다. 색 이름은 상태 토큰이다. **원본은 `design/tokens.json`의 `status_map`** 이고, 이 표와 다르면 토큰 파일이 맞다. 색값·구성요소·문구 규칙은 [스타일 가이드](07-style-guide.md).

| 대상 | 상태 (화면 표기) | 색 토큰 |
| --- | --- | --- |
| 실행·노드 | 대기 / 실행 중 / 기다리는 중(서버) / 완료 / 실패 / 재생됨 / 취소됨 | neutral / active / waiting / done / failed / replayed / neutral |
| 서버 실행기 | 동작 / 일시 중지 / 재시작 중 / 오류 / 오프라인 | done / neutral / active / failed / warning |
| 확장 | 켜짐 / 꺼짐 / 호환 안 됨 / 필요하지만 없음 | done / neutral / warning / failed |
| 수행 모드 | 자율 수행 / 결정 수행 | 글자로만 표시 (색 없음) |
| API 키 (Center) | 사용 중 / 만료 / 폐기됨 | done / warning / neutral |
| 패키지 | 후보 / 승인됨 / 지원 종료 / 철회 / 로컬만 | waiting / done / warning / failed / neutral |
| 서명·준비·온라인·외부 작업·배치 결정·조직·관리자 계정·배포·등록 요청·기능 | `tokens.json` `status_map` 참고 | — |
| 시험 실행 | 대기열 / 실행 중 / 기다리는 중 / 완료 / 실패 / 중지됨 | waiting / active / waiting / done / failed / neutral |
| 시험 판정 | 통과 / 실패 / 비교 안 함 / 중지 / 오류 | done / failed / neutral / neutral / failed |
| 결재 | 대기 / 답함 / 시간 초과 / 회수됨 (실행하는 쪽이 답을 거절하면 다시 「대기」 + 안내 띠) | waiting / done / warning / neutral |
| 작업 | 대기 / 전달됨 / 대기열 / 수락 / 거절 / 만료 / 취소됨 | neutral / active / waiting / done / failed / warning / neutral |
| 서비스 앱 | 정상 / 저하 / 응답 없음 / 확인 전 | done / warning / failed / neutral |
| 사전 점검 | 정상 / 경고 / 실행 불가 | done / warning / failed |

캔버스 노드 표시(Studio): 실행 중 = active 외곽선, 완료 = done 외곽선, 실패 = failed 외곽선 + 옅은 채움, 재생됨 = replayed 점선.

## 4. 전체 흐름 (화면 순서)

새 업무 하나가 만들어져 운영되기까지 거치는 화면이다.

0. **준비 (서버)** — 설치하는 사람이 `.env`에 첫 관리자 아이디·비밀번호를 적고 Center를 띄운다. 서비스 앱·어댑터 일꾼은 관리자가 [CON-17](../server/docs/screens/center-console.md#con-17-일꾼-신규) 「일꾼」에서 만들고 받은 토큰과 Center 주소를 주어 띄운다(함께 배포되는 일꾼은 일꾼 폴더의 파일로 처음 한 번 들어온다 — `bpm-center consumer-file`) — 외부 확장 정의는 어댑터 일꾼이 들고 있다가 올리고, 외부 앱의 주소·키는 어댑터 일꾼의 설정에만 넣는다 ([ADR-0102](decisions/0102-calling-outside-is-pull.md), [ADR-0137](decisions/0137-consumers-are-managed-in-the-console.md)). 들어왔는지·마지막으로 가져간 때도 CON-17에서 본다. 서버 BPM 프로세스를 쓸 거면 서버 실행기에 Center 주소를 주고 띄운 뒤, 로그의 요청 코드와 같은 줄을 [CON-12](../server/docs/screens/center-console.md#con-12-서버-실행-신규-m7) 「승인 대기」에서 승인한다 (컨테이너는 환경변수로 키를 준다 — C12).
1. **준비 (설계자)** — 관리자가 [CON-14](../server/docs/screens/center-console.md#con-14-관리자-계정) 「관리자 계정」에서 계정을 만들어 준다. **설계자의 키는 없다** — 설계가 콘솔 안에서 일어나므로 로그인 하나뿐이다 ([ADR-0143](decisions/0143-design-happens-in-the-console.md) §4). **서비스 앱 키도 없다** — BPM 프로세스는 바깥 기능을 Center의 외부 작업으로 부르고, 불러도 되는가는 7 「배포」가 정한다 (C15).
3. **BPM 프로세스 만들기** — 설계자가 콘솔에서 작업공간 하나를 만든다. **실행 자리는 서버 하나다** ([ADR-0016](decisions/0016-server-first.md)·[ADR-0144](decisions/0144-remove-the-pc-runner.md)). [CON-20a](../server/docs/screens/center-console-workspace.md#con-20a-작업공간-홈), [CON-20b](../server/docs/screens/center-console-workspace.md#con-20b-작업공간) 「정보」 탭
4. **그리기** — BPMN을 그리고 태스크마다 속성을 채운다. [CON-20b](../server/docs/screens/center-console-workspace.md#con-20b-작업공간) 「설계」 탭
5. **시험** — 시험 케이스를 만들고 자율 수행으로 돌려 본다. **돌리는 것은 서버 실행기다** (C17). AI 태스크는 학습되어 재생 명세가 생기고, 결정 수행(재생)으로 운영과 같은 방식을 미리 확인한다. [CON-20b](../server/docs/screens/center-console-workspace.md#시험-실행-탭) 「시험 실행」 탭
6. **배포 후보로 만들기** — 콘솔이 그 자리에서 패키지를 지어 후보로 올린다. 패키지에는 키가 없다. [CON-20b](../server/docs/screens/center-console-workspace.md#배포-후보로-만들기), [CON-02](../server/docs/screens/center-console.md#con-02-프로세스)
7. **승인·배포** — 관리자가 콘솔에서 승인하고([CON-02](../server/docs/screens/center-console.md#con-02-프로세스)) 서버 실행기에 배포한다([CON-15](../server/docs/screens/center-console.md#con-15-배포-신규)). 봉투는 Center가 서명한다.
8. **적용** — 서버 실행기가 하트비트로 배포를 받아 BPM 프로세스를 설치하고 사전 점검(확장 포함)을 한다 ([CON-12](../server/docs/screens/center-console.md#con-12-서버-실행-신규-m7)).
9. **작업 지시** — 운영자가 콘솔에서 작업을 만들거나, 외부 시스템(연동용 키)·감시 모드·일정·메시지로 시작된다. [CON-05](../server/docs/screens/center-console.md#con-05-작업-지시)
10. **실행** — 서버 실행기가 여러 건을 동시에 실행한다 ([CON-12](../server/docs/screens/center-console.md#con-12-서버-실행-신규-m7)).
11. **결재** — 결재자가 콘솔 결재함에서 답한다. **확인(`manualTask`)도 같은 자리다** ([ADR-0144](decisions/0144-remove-the-pc-runner.md)). [CON-04](../server/docs/screens/center-console.md#con-04-결재함)
12. **확인** — 운영자가 로그·BPM 프로세스 화면을, 서비스 앱 관리자가 사용 기록을 본다. [CON-01](../server/docs/screens/center-console.md#con-01-프로세스-로그), [CON-02](../server/docs/screens/center-console.md#con-02-프로세스), [SVC-03](../server/docs/screens/service-app-console.md#svc-03-사용-기록)

## 5. 공용 창 CMN-01 — 폐기

결재·확인 창(`shared/qt`)은 **PC 실행기와 함께 걷었다** ([ADR-0144](decisions/0144-remove-the-pc-runner.md)).
결재와 확인은 둘 다 **Center 결재함**([CON-04](../server/docs/screens/center-console.md#con-04-결재함))에서
답하고, **시험 실행은 시험 케이스가 답한다** (C14 `approvals`).

## 6. 화면 목록 총괄

| ID | 화면 | 앱 | 주 사용자 | 마일스톤 | 출처 |
| --- | --- | --- | --- | --- | --- |
| STU-01 ~ STU-16 | (폐기 — 데스크톱 Studio 화면. **CON-20이 대신한다**, [ADR-0143](decisions/0143-design-happens-in-the-console.md)) | — | — | — | — |
| BUI-01 ~ BUI-11 | (폐기 — PC 실행기 화면, [ADR-0144](decisions/0144-remove-the-pc-runner.md)) | — | — | — | — |
| CON-00 | 공통 틀 | Center 콘솔 | 모두 | M2 | 프로토타입 |
| CON-01 | 실행 기록 | Center 콘솔 | 운영자 | M3 | 프로토타입 (이름은 [ADR-0149](decisions/0149-console-menu-follows-the-work.md)) |
| CON-02 | 프로세스 | Center 콘솔 | 운영자 | M3 | 프로토타입 |
| CON-03 | 앱 — 없어짐 ([ADR-0149](decisions/0149-console-menu-follows-the-work.md) — Studio 키 목록뿐이었다. 서버 실행기는 CON-12, 이력은 CON-16) | Center 콘솔 | 운영자 | M2 | 폐기 (쓰는 앱이 없는 키 종류가 남았다 — `docs/09-gaps.md` §3-35) |
| CON-04 | 결재함 | Center 콘솔 | 결재자 | M5 | 프로토타입 |
| CON-05 | 작업 지시 | Center 콘솔 | 운영자 | M5 | 프로토타입 확장 (만들기 추가) |
| CON-06 | 공통 패키지 | Center 콘솔 | 운영자 | M5 | 프로토타입 |
| CON-07 | 리소스 — 없어짐 (ADR-0128) | Center 콘솔 | 운영자 | M5 | 폐기 |
| CON-11 | API 키 — 없어짐 (ADR-0124, 키 동작은 대상 화면으로) | Center 콘솔 | 운영자 | M2 | 폐기 |
| CON-12 | 서버 실행 | Center 콘솔 | 운영자 | M7 | 신규 |
| CON-13 | 조직 | Center 콘솔 | Center 관리자·회사 관리자 | — | 신규 ([ADR-0125](decisions/0125-organization-and-work-placement.md) — 가상 직원 화면은 걷었다) |
| CON-14 | 관리자 계정 | Center 콘솔 | 관리자 | — | 신규 ([ADR-0090](decisions/0090-center-admin-accounts.md)) |
| CON-15 | 배포 | Center 콘솔 | 관리자 | — | 신규 (ADM-03을 옮겼다, ADR-0090) |
| CON-16 | 변경 이력 | Center 콘솔 | 운영자 | — | 신규 ([ADR-0121](decisions/0121-center-console-says-process.md), 이름은 [ADR-0149](decisions/0149-console-menu-follows-the-work.md)) |
| CON-17 | 일꾼 | Center 콘솔 | Center 관리자 | — | 신규 ([ADR-0137](decisions/0137-consumers-are-managed-in-the-console.md)) |
| CON-18 | 연결 앱 | Center 콘솔 | 운영자 | — | 신규 ([ADR-0138](decisions/0138-console-app-catalog.md) — 보기만) |
| CON-20 | 작업공간 (설계) | Center 콘솔 | 설계자 | M11 | 신규 ([ADR-0143](decisions/0143-design-happens-in-the-console.md)·[ADR-0147](decisions/0147-workspace-has-three-tabs.md) — STU-01·02·04·05·06·07·08·09·12를 대신한다) |
| SVC-00 | 공통 틀 | 서비스 앱 관리 콘솔 | 서비스 앱 관리자 | M2 | 신규 (`service_kit`) |
| SVC-01 | 상태 | 서비스 앱 관리 콘솔 | 서비스 앱 관리자 | M2 | 신규 |
| SVC-02 | API 키 — **없어졌다** (ADR-0102, 서비스 앱 키가 없다) | 서비스 앱 관리 콘솔 | — | M2 | 폐기 |
| SVC-03 | 사용 기록 | 서비스 앱 관리 콘솔 | 서비스 앱 관리자 | M5 | 신규 |
| CMN-01 | 결재 / 확인 창 — **폐기** ([ADR-0144](decisions/0144-remove-the-pc-runner.md), 결재함으로 옮겼다) | — | — | M3 | 폐기 |

폐기된 ID: BOT-01~05 → BUI-01~05, WRK-01~05 (프로토타입 Worker 화면), BUI-06~08·TOL-01~05(UI 셀렉터 등록·Tool UI)·BUI-09·STU-13·CON-08~10·UIA-01~03(UI 자동화 확장의 화면) — 확장과 함께 없어졌다 ([ADR-0114](decisions/0114-remove-ui-automation.md)), ADM-01~06 → CON-02·06(승인)·CON-14(계정)·CON-15(배포)·CON-07(외부 확장) — Admin 명령·창은 없어졌다 ([ADR-0090](decisions/0090-center-admin-accounts.md)), BUI-01~11·CMN-01 — PC 실행기와 그 결재 창은 없어졌다 ([ADR-0144](decisions/0144-remove-the-pc-runner.md)).

## 7. 열린 질문

- 콘솔 로그인: 지금은 Center의 관리자 계정이다 ([ADR-0090](decisions/0090-center-admin-accounts.md)). 사내 로그인(OIDC)이 필요해지면 계정 확인만 그쪽으로 넘긴다 (제안).
- 서비스 앱 관리 콘솔의 로그인: 처음에는 앱별 관리자 토큰, 나중에 Center와 같은 OIDC로 묶는다 (제안).
