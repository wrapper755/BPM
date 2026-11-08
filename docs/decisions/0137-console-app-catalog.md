# ADR-0137. Center 콘솔에 연결 앱 카탈로그(CON-17)를 둔다 — 앱 하나 = 토픽 하나, 보기만 한다

| 항목 | 값 |
| --- | --- |
| 상태 | 수락 |
| 날짜 | 2026-11-08 |
| 관련 | 화면 CON-17, 계약 C15(`GET /external-topics/{topic}/operations`, 정의 올릴 때 `address`)·C13·C11(`app_group`·`keywords`·`groups`·`group`)·C7, [ADR-0102](0102-calling-outside-is-pull.md), [ADR-0122](0122-consumer-folder.md), [ADR-0128](0128-console-drops-the-resources-screen.md), [ADR-0135](0135-agentic-automation-and-unified-consumer.md) |

## 배경

Company1 일꾼이 올린 외부 앱 정의(`external`)에는 작업이 140개 있다. 정의는 Center가 서명해 보관하고 C7로 읽을 수 있지만, 리소스 화면(CON-07)을 걷은 뒤(ADR-0128) 콘솔에는 **어떤 앱·작업이 있고 그 작업이 지금 일감을 처리하고 있는지** 볼 자리가 없다. 사용자가 그 작업들을 Center 콘솔에서 관리할 페이지를 원했다(2026-11-08). ADR-0128은 「진단 자리가 필요해지면 다시 정한다」를 다시 볼 조건으로 적었다.

첫 화면(외부 정의만, 작업 표)을 본 사용자가 셋을 더 말했다(같은 날).

1. 외부 앱 주소는 바뀔 수 있으니 고칠 수 있어야 한다.
2. 140개를 묶거나 형식을 정해 관리할 수 있어야 한다.
3. 연결되는 앱은 사이트·AI·RPA 등 여러 형태다 — **앱마다 정의가 있는 것이 맞지 않나, Camunda는 어떻게 정의하는지 보고 반영하라.**

### Camunda 8의 정의 (조사, 2026-11-08)

| Camunda | 뜻 | 우리 것 |
| --- | --- | --- |
| job type | 태스크의 「종류」. 일꾼(job worker)은 그 종류를 구독해 일감을 가져간다 | **토픽** (= 앱 id, C15) |
| Connector | 앱 하나와의 연결. 종류(type) 하나에 **작업(operation) 여럿** — 작업마다 이름·설명·**keywords**(찾기용) (Connector SDK Operations API) | 정의 하나(C13 외부 정의 또는 C11 manifest)와 그 `operations` |
| element template | 커넥터 코드에서 빌드 때 지어지는 모델러 양식. **`category{id, name}`가 템플릿 고르기 목록에서 앱을 묶고**, `groups`는 입력 칸을 묶는다 | 앱 수준 묶음이 없었다 |
| 커넥터 종류 | 프로토콜(REST — 범용 HTTP), 앱 커넥터(Slack 등), 사용자 job worker, AI Agent(하위 프로세스 안 활동이 도구), RPA(job worker + 스크립트) | 작업의 `kind` = `ai`·`api`·`rpa` (ADR-0135), 구현은 외부 정의(어댑터) 또는 일꾼 앱 |

Camunda의 결은 **「앱(커넥터) = 단위, 앱 목록은 category로 묶고, 작업은 keywords로 찾는다」**이다. 앱 하나에 작업이 너무 많으면 커넥터를 나눈다 — 앱 안에서 작업을 묶는 칸은 없다. OpenAPI(작업 `tags` + 최상위 `tags`)·Power Automate(태그 + `x-ms-visibility`)는 앱 안에서도 묶는다.

## 선택지

| 화면 | 장점 | 단점 |
| --- | --- | --- |
| A. 외부 정의(C13)만, 보기만 | 계약이 거의 그대로다 | 일꾼 앱(C11 — AI·사이트 처리기·모의 앱)은 볼 곳이 없다. 「여러 형태의 앱」이 한 자리에 없다 |
| B. **연결 앱 카탈로그** — 외부 정의든 일꾼 앱이든 토픽 하나 = 한 줄, 앱 묶음(`app_group`)으로 묶고 작업별 일감 집계 | Camunda의 커넥터 목록과 같은 결. 구현이 달라도 한 화면 | 정의 칸이 는다(C13·C11) |
| C. B + 작업 끄기·콘솔에서 정의 고치기 | 콘솔에서 끝난다 | 정의의 원본이 일꾼 쪽이라는 결정(ADR-0122)과 부딪힌다 |

| 많은 작업 | 장점 | 단점 |
| --- | --- | --- |
| ㄱ. 앱 안 `groups` + 작업 `group`·`keywords` | Company1은 정의 파일만 고친다 | Camunda에 없는 한 단계 |
| ㄴ. Camunda처럼 앱을 나눈다 | Camunda와 같다 | Company1 BPMN 16개의 `app_id`·일꾼 토픽·일꾼 파일을 바꾸고 다시 승인·배포해야 한다 |

| 주소 | 장점 | 단점 |
| --- | --- | --- |
| 가. 일꾼이 쓰는 주소를 올려 콘솔이 보인다 (바꾸는 곳은 일꾼 설정) | ADR-0102 그대로. 화면이 실제 주소를 말한다 | 콘솔에서 바로 바꾸지 못한다 |
| 나. 콘솔에서 바꾸고 일꾼이 Center에서 받는다 | 한 화면에서 끝난다 | 주소 출처가 둘이 된다. ADR-0102를 일부 뒤집는다 |

## 결정

**B·ㄱ·가 — 콘솔 「배포·자원 › 연결 앱」(CON-17)에 연결 앱 카탈로그를 두고 쓰기는 두지 않는다** (사용자 결정, 2026-11-08).

- **앱 하나 = 토픽 하나**다. 외부 정의(C13 `tier: external`)와 일꾼이 올린 앱(C11 manifest, 외부 정의가 없는 토픽)이 한 목록에 「구현」(외부 정의 / 일꾼 앱)과 「종류」(작업들의 `kind` — AI·API·RPA)로 보인다.
- **앱 수준 칸** (C13 정의·C11 manifest 둘 다, 선택): `app_group{id, name}` — 목록에서 앱을 묶는다(Camunda `category`. C11의 `category`(`business`·`system`)와 뜻이 달라 이름을 달리했다), `keywords[]` — 찾기.
- **작업 수준 칸** (C13 어댑터 작업·C11 작업 둘 다, 선택): `group` — 앱의 `groups[{id, name, description?}]` 중 하나(없는 id는 C13 E3·C11 모델 검사가 거부), `keywords[]` — 찾기.
- **주소는 가** — 일꾼이 정의를 올릴 때 `address{base_url, test_base_url?}`를 함께 올리고(C15) Center는 일꾼 줄에 적어 `ConsumerInfo.addresses`로 보인다. 외부 정의 앱만 해당한다.
- 재료: C7 `GET /resources?type=extension`·`?type=service_app`·`GET /resources/extensions/{id}`, C15 `GET /consumers`·`GET /external-topics`, **새 C15 `GET /external-topics/{topic}/operations`**(작업마다 기다림·처리 중·최근 7일 끝남·실패·마지막으로 끝난 때 — 업무 값 없음, 원칙 6).
- 정의 고치기·등록 해제·작업 끄기는 두지 않는다 — 정의의 원본은 일꾼 쪽이다(ADR-0122). 화면은 그 사실을 제목 툴팁으로만 말한다.
- CON-07을 되살리는 것이 아니다 — 일꾼 폴더·키·기여 자원은 이 화면에 없다.

## 결과

- 이 결정으로 쉬워지는 것: 사이트·AI·RPA·외부 HTTP 어느 형태든 연결 앱과 그 작업, 작업마다 일감이 쌓이거나 실패하는지를 한 화면에서 본다. 앱이 늘어도 `app_group`으로 묶이고 `keywords`로 찾는다.
- 어려워지거나 포기하는 것: 작업 하나만 멈추는 손잡이는 없다. 주소를 바꾸려면 일꾼 설정을 고치고 일꾼을 다시 띄운다. 묶음·키워드는 정의를 쓰는 쪽이 달아야 보인다. 최근 7일 집계는 읽을 때 센다.
- 다시 볼 조건: 앱 하나의 작업이 다시 수백 개로 불면 Camunda처럼 앱을 나눌지(ㄴ) 정한다. 주소를 콘솔에서 바로 바꿔야 하는 일이 잦으면 나를 새 ADR로 정한다. 작업을 콘솔에서 멈춰야 하는 일이 생기면 Center 쪽 스위치를 따로 정한다.
