# C7. Center API: 리소스 목록과 Center API 키 관리

| 항목 | 값 |
| --- | --- |
| 상태 | **구현됨** (2026-10-10, [09-gaps](../09-gaps.md) §1 대조 — 상태는 토픽에서 온다, C15) |
| schema | 1 |
| 보내는 쪽 → 받는 쪽 | Center ↔ 서비스 앱(공개 정보 읽기), Studio·PC 실행기·서버 실행기·Center 콘솔 → Center |
| 코드 위치 | `shared/contracts/src/bpm/contracts/resources.py`, `…/center_keys.py` (import `bpm.contracts.resources`, [ADR-0019](../decisions/0019-package-names.md)) |
| JSON Schema | 리소스 [`c7-extension-resource.json`](../../shared/contracts/schemas/c7-extension-resource.json) · [`c7-service-app-resource.json`](../../shared/contracts/schemas/c7-service-app-resource.json) · [`c7-contributed-resource.json`](../../shared/contracts/schemas/c7-contributed-resource.json) · [`c7-runtime-resource.json`](../../shared/contracts/schemas/c7-runtime-resource.json) / 키 [`c7-center-key-create-request.json`](../../shared/contracts/schemas/c7-center-key-create-request.json) · [`c7-center-key-info.json`](../../shared/contracts/schemas/c7-center-key-info.json) · [`c7-center-key-created.json`](../../shared/contracts/schemas/c7-center-key-created.json) — `uv run python scripts/gen_schemas.py`로 모델에서 생성 |
| 관련 ADR | [0010](../decisions/0010-service-apps.md), [0013](../decisions/0013-api-keys.md), [0015](../decisions/0015-run-location.md), [0018](../decisions/0018-extensions.md), [0092](../decisions/0092-keys-are-issued-and-delivered-by-center.md), [0094](../decisions/0094-service-app-keys-ride-the-deployment.md) |
| 관련 화면 | STU-03 리소스 탐색기, STU-14·15, BUI-11 |

> [ADR-0102](../decisions/0102-calling-outside-is-pull.md) (2026-10-29): 서비스 앱 주소 등록·`/manifest`·`/healthz` 읽기, 외부 앱 키(운영·시험용), 외부 확장 주소 덮어쓰기는 **없다**. 주소·키는 일꾼만 들고, manifest·카탈로그는 일꾼이 올리며(C15 `PUT …/consumers/self/manifest`) 상태는 「마지막으로 가져간 때」가 말한다.

## 목적

이 계약은 두 가지를 정한다.

**1. 리소스 목록.** BPM 프로세스가 실행에 필요로 하는 바깥 자원을 Center 한곳에서 보이게 한다. 자원 종류는 다음과 같다.

- 확장
- 서비스 앱(확장의 서버 부분)과 그 작업
- **확장이 기여한 자원** (예: 사내 확장의 인감 견본)
- 런타임

이 목록은 두 곳에서 쓴다 (콘솔의 리소스 화면 CON-07은 걷었다 — ADR-0128).

- Studio: 리소스 탐색기와 태스크 편집기
- Center: 배포 전 누락 검사

**2. Center API 키 관리** (CON-11).

> 상태: **돈다.** 2026-10-29부터 **Center는 바깥 기능을 읽으러 가지 않는다** ([ADR-0102](../decisions/0102-calling-outside-is-pull.md)) — 서비스 앱은 C15 **일꾼**으로 들어와 manifest·카탈로그를 **올리고**, 살아 있음은 「마지막으로 가져간 때」가 말한다. 외부 확장은 정의를 등록하고(관리자 — Center가 봉투에 서명한다, C13 E6·ADR-0090) 그 토픽을 **어댑터 일꾼**이 가져간다. **런타임·확장은 따로 등록받지 않는다** — C4·C12 보고와 일꾼이 올린 manifest에서 모은다. Center API 키 관리는 M2부터 돈다.

**플랫폼 계약은 특정 확장을 모른다** (ADR-0018). 확장이 기여한 자원은 C13 §5의 **공통 카탈로그 형식**으로만 다룬다. 자원의 모양(`data`)은 그 확장이 정하고, Center는 해석하지 않고 넘긴다.

**Center는 바깥 기능의 주소도 키도 들지 않는다** (ADR-0102). 서비스 앱 키는 없어졌고(「누가 불러도 되나」는 배포가 가린다 — C15 §올리기), 외부 앱의 주소·키는 어댑터 일꾼의 설정에만 있다. Center에서 나가는 연결도 없다 — 일꾼이 Center로 들어온다.

## 리소스 모으는 방식

| 종류 | 출처 | 갱신 |
| --- | --- | --- |
| 확장 | 내장·사내: 일꾼 manifest의 `extension` 필드와 실행하는 쪽의 보고(C4·C12 `extensions`). 외부: **그 토픽의 일꾼이 올린 정의**(C15 `PUT …/consumers/self/extension`, Center가 서명 — C13, ADR-0122) | 보고·manifest·정의 올림 때, Center가 뜰 때(일꾼이 빠진 확장 철회) |
| 서비스 앱 | 내장·사내: 그 앱 id를 토픽으로 맡은 **일꾼이 올린 manifest** (C15). 외부: 외부 확장 등록과 함께 생기고 작업 목록은 정의의 어댑터 작업에서 만든다 | 일꾼이 올릴 때 |
| 확장 기여 자원 | **일꾼이 올린 카탈로그** (C15 `PUT …/consumers/self/catalogs/{type}`) — 내장·사내는 서비스 앱이, 외부는 어댑터 일꾼이 정의의 `contributes.resources[].catalog_url`을 읽어 올린다. Center가 외부 주소를 읽지 않는다 | 올릴 때. `revision`이 같으면 다시 쓰지 않는다 |
| 런타임 | PC 실행기 등록·하트비트(C4), 서버 실행기(C12) | 하트비트 때 |

- **상태는 토픽이 말한다** — 그 앱 id를 가져가는 일꾼이 하나라도 있고 마지막으로 가져간 지 90초 안이면 `ok`, 일꾼은 있는데 그보다 오래면 `unreachable`, 들인 일꾼이 없으면 `unknown`(「확인 전」). 외부 확장도 같다(어댑터 일꾼).

## 전송

기본 경로는 `/api/v1`. 권한은 C5 권한표를 따른다. 리소스 읽기는 읽기·관리자 토큰, Studio·PC 실행기·서버 실행기 키가 할 수 있다.

| 메서드·경로 | 인증 | 뜻 |
| --- | --- | --- |
| `GET /resources?type=extension\|service_app\|contributed\|runtime[&resource_type=<종류>]` | 읽기 | 목록 |
| `GET /resources/extensions/{id}` | 읽기 | 확장 하나 (C13) |
| `POST /resources/extensions` `ExtensionCreateRequest` | Center 관리자 | HTTP 어댑터 앱 만들기 — 원본 `console` (§콘솔에서 고치는 외부 확장) |
| `PUT /resources/extensions/{id}` `ExtensionUpdateRequest` | Center 관리자 | 고치기 = 새 판 |
| `DELETE /resources/extensions/{id}` | Center 관리자 | 내리기 — 철회하지 않은 판을 모두 철회 (`ExtensionRevoked`) |
| `GET /resources/extensions/{id}/versions` | 읽기 | 판 기록 (`ExtensionVersionInfo[]`, 새 판부터) |
| `GET /resources/extensions/{id}/dependents` | 읽기 | 그 확장을 요구하는 살아 있는 배포의 BPM 프로세스 (`ExtensionDependent[]`) |
| `POST /resources/extensions/{id}/test-calls` `ExtensionTestCall` | Center 관리자 | 시험 호출 (`ExtensionTestResult`) |
| `GET /resources/extensions/{id}/test-calls/{task_id}?wait_s=` | Center 관리자 | 시험 호출 결과 다시 묻기 |
| `GET /resources/consumer-folder` | 읽기 | Center가 **마지막으로 뜰 때** 일꾼 폴더를 읽은 결과 (`ConsumerFolderScan`, ADR-0122·0137) |
| `GET /resources/service-apps/{app_id}` | 읽기 | 서비스 앱 하나 (manifest 전체) |
| `GET /resources/contributed/{resource_type}/{id}` | 읽기 | 확장 기여 자원 하나 |
| `GET /signing-keys` | **없음** (공개키다) | 믿는 키 목록 (C2 `AdminKey[]` — 하트비트의 `admin_keys`와 같은 것). 어댑터 일꾼이 외부 확장 봉투를 다시 검증하려고 받는다 |

외부 확장의 정의는 **원본이 둘 중 하나다** — 그 토픽의 일꾼이 올리거나(C15 `PUT …/consumers/self/extension`, ADR-0122) Center 관리자가 콘솔에서 만들고 고친다(HTTP 어댑터 앱만, ADR-0141). 어느 쪽이든 Center가 봉투에 서명한다. 서비스 앱을 **등록하는 길도 없다** — 일꾼(C15 §일꾼 관리)이 그 자리다.

## 모델

### ExtensionResource

| 필드 | 뜻 |
| --- | --- |
| `id`, `version`, `name`, `publisher`, `tier`, `definition_hash` | C13 |
| `protocol` | `bpm-c11` / `http-adapter` / 없음 (클라이언트 기여만) |
| `contributes_summary` | 기여 지점별 이름 (예: `task_types: [seal_check]`) |
| `service_app_id`? | 서버 부분 |
| `installed_on` | 이 확장을 가진 PC 실행기·서버 실행기 수와 버전 분포 (C4·C12 보고. Studio는 세지 않음) |
| `status` | 서버 부분 상태. 값은 `ServiceAppResource.status`와 같고 **서버 부분이 아예 없으면 `n/a`**다. 그 토픽을 가져가는 일꾼으로 본다 (§리소스 모으는 방식) |
| `status_reasons`, `checked_at`? | 상태의 사유와 마지막으로 본 때. 서버 부분이 없으면 비어 있다 |
| `definition`, `envelope` | 외부 확장만. 실행하는 쪽이 받아 검증한다 |
| `source`? | 외부 확장만 — 정의의 원본 `console` / `consumer` (ADR-0141). 이 칸 전에 등록된 것은 `consumer` |

### 콘솔에서 고치는 외부 확장 ([ADR-0141](../decisions/0141-adapter-definitions-are-edited-in-the-console.md))

> 상태: **돈다** — Center API(`center/api/console_extensions.py`), 일꾼(C15 §콘솔이 원본인 정의 받기), 콘솔 CON-18(`app/connected-apps/editor.tsx`).

**HTTP 어댑터 앱의 정의는 Center가 원본일 수 있다** — 관리자가 CON-18에서 만들면 원본이 `console`이고, 그 뒤로 그 id는 일꾼이 올리지 못한다(C15 409 `source_is_console`). 반대로 일꾼이 올린 id(원본 `consumer`)는 콘솔에서 만들거나 고치지 못한다(409 `source_is_consumer`). **정의마다 원본은 하나다.**

- **만들기** — `ExtensionCreateRequest{definition}`. C13 등록과 같은 관문(크기·모양·E1~E4)이고 `tier: external`·`protocol: http-adapter`만 받는다(아니면 422 `input_invalid`). `version`을 비우면 `0.1.0`. 이미 있는 id(어느 원본이든·철회된 것도)는 409 `id_conflict`. 201 + `ExtensionResource`.
- **고치기** — `ExtensionUpdateRequest{definition, base_version}`. 새 판은 **`base_version`의 끝자리 + 1**이고 정의의 `version`은 무시한다. `base_version`이 지금 판이 아니면 409 `version_conflict`(그 사이 다른 사람이 올렸다 — 덮어쓰지 않는다). 내용이 같으면 판을 올리지 않고 200. 옛 판은 철회하지 않는다 — 고정한 BPM 프로세스가 그 판으로 돈다(C1, ADR-0060). `id`는 바꿀 수 없다(토픽이다).
- **내리기** — 철회하지 않은 판을 모두 `extension_revoke` 봉투로 거둔다. 쓰는 배포가 있어도 막지 않는다(철회는 보안 동작이다 — C13). 되살리지 않는다. 같은 id로 다시 만들 수 없다(409 `id_conflict` — 철회된 판이 남아 있다).
- **판 기록**·**쓰는 곳**은 원본과 상관없이 읽힌다. `dependents`는 살아 있는 배포의 매니페스트 `requires.extensions`에 그 id가 있는 BPM 프로세스(판마다 한 줄)이고, 고정한 해시가 있으면 `pinned_hash`·`pinned_version`을 준다 — CON-18이 저장·내리기 확인 창에 보인다.
- **시험 호출** — Center가 C15 일감을 `origin: test`로 **스스로 올린다**(부르는 쪽 = 그 관리자, `caller.type: console`). 지금 판으로만 부르고(`definition_version` = 지금 판 — 원본이 일꾼이면 싣지 않는다) 맡은 일꾼이 시험 주소(`…__TEST_BASE_URL`, 없으면 운영 주소)로 부른다. 맡은 일꾼이 없거나 그 작업이 정의에 없으면 422 `no_consumer`·`operation_not_found`. 답은 C15 결과와 같은 모양이고 `wait_s` 안에 끝나지 않으면 `pending` — 결과 묻기로 다시 받는다. 값은 받은 뒤 지운다(C15와 같다).
- 주소·키 — 주소는 정의의 `base_url`·`test_base_url`이 기본이고 **일꾼 설정이 이긴다**(C15 §외부 확장 정의 올리기의 `address`가 실제로 쓰는 주소를 알린다). **키는 Center에 두지 않는다** — 정의의 `auth`는 방식만 적고 값은 일꾼 설정이다.

### ConsumerFolderScan (일꾼 폴더)

일꾼 폴더(`BPM_CENTER__CONSUMERS_DIR`, 기본 `<데이터>/consumers`)의 일꾼 파일(`<이름>.consumer.json`, C15 §일꾼 들이기)과 키 파일(§폴더 키)을 Center가 뜰 때 한 번 읽은 결과다 (ADR-0122). **일꾼 파일은 처음 들이기만 한다** — 이미 있는 일꾼은 `unchanged`이고 파일이 빠져도 일꾼을 지우지 않는다(일꾼은 콘솔이 다룬다, ADR-0137). 결과는 메모리에만 있고 다시 뜨면 새로 읽는다.

| 필드 | 뜻 |
| --- | --- |
| `configured` | 폴더가 있나(사람이 적었으면 늘 `true`). `false`면 나머지는 비어 있다 |
| `dir`?, `scanned_at`? | 읽은 폴더와 때 |
| `problem`? | 폴더 자체를 읽지 못한 까닭(없음·폴더가 아님). 있으면 `items`는 비어 있다 |
| `items[]` | 하나마다 `{kind, file?, id?, version?, outcome, code?, message?}`. `kind`: `consumer`(`id`가 일꾼 이름) / `key`(키 파일의 키, `id`가 키 이름 — §폴더 키) / `extension`(옛 Center가 맡은 일꾼이 없어 거둔 외부 확장 — 지금은 콘솔이 그 자리에서 거두어 나오지 않는다). `outcome`: `registered`(들였다·바꿨다 — 일꾼은 새로 들인 것만) / `unchanged`(그대로 — 일꾼은 이미 있으면 파일이 달라도 이것이고 `message`에 그 뜻을 단다) / `refused`(`unreadable`·`input_invalid`·`token_revoked`·`token_in_use`) / `revoked`(키 파일이 **빠져서** 거뒀다 — `file`이 없다) |

```json
{
  "configured": true,
  "dir": "/consumers",
  "scanned_at": "2026-10-31T09:00:00+09:00",
  "items": [
    {"kind": "consumer", "file": "worker.consumer.json", "id": "worker", "outcome": "unchanged",
     "message": "이미 들인 일꾼입니다 — 파일의 바뀐 값은 들이지 않습니다. 콘솔에서 고치세요"},
    {"kind": "consumer", "file": "ocr.consumer.json", "id": "ocr", "outcome": "registered"},
    {"kind": "key", "file": "site.key.json", "id": "site", "outcome": "registered"},
    {"kind": "key", "id": "old-site", "outcome": "revoked", "message": "폴더에서 빠져 키를 폐기했습니다"}
  ]
}
```

### ServiceAppResource

| 필드 | 뜻 |
| --- | --- |
| `app_id`, `name`, `version`, `category` | C11 manifest (외부는 C13 정의) |
| `extension_id` | 어느 확장의 서버 부분인가 |
| `base_url` | **없다**(빈 값) — Center는 서비스 앱의 주소를 모른다. 옛 읽는 쪽이 깨지지 않게 칸은 둔다 |
| `console_url` | http(s)만 — 일꾼이 올린 manifest의 값 |
| `operations` | C11 Operation 목록 (외부는 어댑터 Operation에서 만든 같은 모양) |
| `status` | `ok` / `degraded` / `unreachable` / `unknown` (열린 문자열). 화면 표기는 「정상」 / 「저하」 / 「응답 없음」 / 「확인 전」 |
| `status_reasons`, `checked_at`, `manifest_at` | `checked_at`은 마지막으로 가져간 때, `manifest_at`은 manifest를 올린 때 |
| `consumers` | 이 토픽을 가져가는 일꾼 수 |
| `used_by` | 이 앱을 쓰는 BPM 프로세스 (`id@version`, 승인·배포된 것) |
| `app_group`, `keywords`, `groups` | C11 manifest 그대로 — 연결 앱 목록(CON-18)이 묶고 찾는다 ([ADR-0138](../decisions/0138-console-app-catalog.md)) |

### ContributedResource (확장 기여 자원)

| 필드 | 뜻 |
| --- | --- |
| `resource_type` | 확장이 정한 종류 (예: `seal_specimen`) |
| `id`, `name`, `summary`, `updated_at` | 카탈로그 항목 (C13 §5) |
| `extension_id` | 이 자원을 기여한 확장 |
| `revision` | 카탈로그 판 번호 |
| `data` | 확장 고유 내용. Center는 해석하지 않는다 |
| `used_by` | 이 자원을 쓰는 BPM 프로세스 (C1 `requires.resources`와 대조) |

### RuntimeResource

| 모델 | 필드 |
| --- | --- |
| RuntimeResource | `host{type: bot_ui \| server_runner, id, name}`, `os`, `versions{bot_ui?, core}`, `browsers[]`, `desktop_backend`?, `extensions[]` |

### 목록 응답 공통

`{items: [...], fetched_at}`. Studio는 마지막으로 받은 목록을 캐시하고, 오프라인이면 「(오프라인 — 마지막 확인 <fetched_at>)」을 붙인다 (U8).

## 누락 검사

`contracts.resources.missing(manifest, resources)`가 C1 `requires`를 리소스 목록과 대조한다. 확장 종류를 가리지 않는 같은 규칙이다.

| 검사 | 결과 `type` / `reason` |
| --- | --- |
| `requires.extensions[]`가 있고 버전 범위가 맞나 (외부면 `definition_hash`도) | `extension` / `not_found` / `version_mismatch` / `hash_mismatch` |
| `requires.service_apps[].app_id`가 등록되어 있나 — 서비스 앱(C11)이거나 **같은 id의 외부 확장(HTTP 어댑터)**이면 등록된 것이다 (`bpm:serviceCall`은 둘을 가리지 않는다 — C13 §4) | `service_app` / `not_registered` |
| 그 작업이 있나, 결정 수행을 지원하나, 서버 BPM 프로세스면 `server_ok`인가 — 외부 확장이면 어댑터의 `operations[]`에서 본다 | `operation` / `not_found` / `not_deterministic` / `not_server_ok` |
| `requires.resources[]` (`{type, id}`)가 확장 기여 자원에 있나 | `resource` / `not_found` |

- 업로드할 때는 경고만 한다 (CON-02 띠).
- **배포할 때는** C1 R8에 걸리는 것(서버 BPM 프로세스의 작업)과 확장 누락·해시 불일치만 거부한다. 서비스 앱이 잠시 응답이 없다고 배포를 막지는 않는다.

## 외부 앱 키 · 외부 확장 주소 — 없다

외부 앱의 키와 주소는 **어댑터 일꾼의 설정**에만 있다 ([ADR-0102](../decisions/0102-calling-outside-is-pull.md), C13 §4) — Center에 넣는 칸(`PUT …/app-key`·`…/app-key/test`·`…/address`)은 없다. 시험용 키라는 것도 없다: Studio 시험 실행의 일감은 `origin: test`이고, 어댑터 일꾼이 확장마다 시험 쪽 주소·키를 따로 둘 수 있다 (ADR-0102 §6).

## Center API 키 관리 (CON-11)

| 메서드·경로 | 인증 | 뜻 |
| --- | --- | --- |
| `POST /center-keys` `{name, type, expires_at?}` | 관리자 토큰 | 발급. 응답에 **원문 `key`가 한 번만** 실린다 |
| `GET /center-keys?type=&state=` | 읽기·관리자 토큰 | 목록 (원문 없음) |
| `DELETE /center-keys/{key_id}` | 관리자 토큰 | 폐기 |
| `POST /center-keys/{key_id}/unbind` | 관리자 토큰 | PC 묶음 풀기 (PC 실행기용·서버 실행기용) |
| `POST /center-keys/{key_id}/purge` | 관리자 토큰 | **폐기된 키**의 행을 지운다 (204). 폐기되지 않았으면 409 `not_revoked` — 폐기 → 삭제 두 걸음이다 ([0095](../decisions/0095-deleting-revoked-center-keys.md)). 묶였던 PC·서버 자리는 「묶음 풀기」처럼 놓인 자리가 되고, 실행 기록·결재의 `owner_key_id`는 글자로 남는다 |

`type`: `bot_ui`, `studio`, `server_runner`, `integration`, `relay` (열린 문자열이지만 Center는 이 다섯만 발급한다).

- **`bot_ui`·`server_runner`·`studio` 키는 등록 승인이 만든다** (`studio`는 [0093](../decisions/0093-studio-is-let-in-by-approval.md)) (C5 §등록 승인, [0092](../decisions/0092-keys-are-issued-and-delivered-by-center.md)). 이 경로로 그 둘을 발급하는 길은 **자동화·시험용**으로 남고(관리자 토큰) CON-11 화면에는 없다. 승인이 만든 키는 `enrollment_id`를 가진다.

- `relay`(**대리 답용 키**, CON-11 표기 「대리 답용」)는 연동하는 쪽이 **사람 대신 결재에 답할 때만** 쓴다 — 결재 읽기·답뿐이고, 그 사람이 담당자일 때만 받는다 (C6, [ADR-0081](../decisions/0081-answering-on-behalf.md)). 연동용 키에 그 권한을 더하지 않은 것은 연동용 키가 **작업을 만드는 바깥 시스템 모두**에 나가기 때문이다. Center는 이 키를 `require_read`·작업·실행 기록 올리기에서 막는다.

CenterKeyInfo 필드:

| 필드 | 뜻 |
| --- | --- |
| `key_id` | `ck_<hex8>` |
| `name`, `type` | |
| `prefix` | 앞자리 16자 (`bpm_ctr_` + 무작위 8자) |
| `bound_to`? | `{type, id, name, machine_name?, first_seen}` |
| `enrollment_id`? | 등록 승인이 만든 키면 그 요청 (C5 §등록 승인). 없으면 사람이·자동화가 발급한 키다 |
| `created_at`, `expires_at`?, `last_used_at`?, `revoked_at`? | |
| `state` | `active` / `expired` / `revoked`. 화면 표기는 「사용 중」 / 「만료」 / 「폐기됨」 |

- 키 원문은 `bpm_ctr_<무작위 40자>`이고, Center는 해시만 저장한다.
- **연동용·대리 답용 키는 일꾼 폴더의 키 파일로도 들인다** (§폴더 키).

### 폴더 키

함께 설치되는 연동 시스템의 키는 설치가 짓는다 ([0123](../decisions/0123-folder-keys.md)) — 일꾼 폴더(`BPM_CENTER__CONSUMERS_DIR`, C15 §일꾼 들이기)의 `<이름>.key.json`(`FolderKey`)을 Center가 **뜰 때 한 번** 읽는다. 원문은 폴더에 없다.

```json
{"name": "nowview", "type": "integration", "token_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"}
```

| 필드 | 뜻 |
| --- | --- |
| `name` | CON-11에 보이는 키 이름 |
| `type` | `integration` / `relay`만. 다른 것은 `input_invalid` |
| `token_sha256` | 키 원문(UTF-8)의 SHA-256, 소문자 16진 64자. 원문의 권장 꼴은 위 키 원문과 같다(`bpm_ctr_` + 40자) — Center는 해시만 맞춘다 |

- **권한은 종류가 정한다** — `POST /center-keys`로 발급한 같은 종류의 키와 같다(C5 권한표). 앞자리(`prefix`)는 빈 글이고(CON-11 「—」) 만료·회전이 없다.
- 키의 자리는 **파일 이름**(확장자 앞)이다. 해시가 바뀌면 옛 키를 폐기하고 새 키를 만든다. **폐기된 토큰은 되살아나지 않고**(`token_revoked`), 다른 키(일꾼 키 포함)가 쓰는 해시는 `token_in_use`다. **파일이 빠지면 폐기한다**(행은 남는다). 읽지 못한 파일은 자리를 지킨다.
- 결과는 `ConsumerFolderScan.items[]`의 `kind: key` 줄이다. `bpm-center key-file <이름> --type integration|relay [--dir 폴더]`가 파일을 짓고 원문을 한 번 찍는다.
- **열린 모드에서는 이 키가 없어도 된다** ([ADR-0142](../decisions/0142-open-mode.md)) — 키 없는 호출이 관리자이므로 연동 시스템이 작업·메시지·대리 결재를 그냥 부른다(C5 §인증). 폴더 키는 그대로 살고, 스위치를 끄면 다시 그 키가 관문이다.

- 기본 만료는 1년. 만료 14일 전부터 CON-11에 보인다. **등록 승인이 만든 키는 Center가 그때부터 회전한다** (C4 §키 회전) — PC 실행기 알림(BUI-05)은 회전이 7일 전까지 닿지 않았을 때만, 회전하지 않는 키는 14일 전부터다.

## 오류

| 상태 코드 | `code` | 언제 |
| --- | --- | --- |
| 404 | `not_found` | |
| 409 | `not_revoked` | 폐기되지 않은 키를 지우려 함 (`POST /center-keys/{key_id}/purge`) |
| 409 | `id_conflict` | 같은 `id`가 이미 있음 (확장과 서비스 앱이 같은 이름 공간) |
| 422 | `manifest_invalid` | 일꾼이 올린 manifest가 C11과 맞지 않음 |
| 422 | `host_not_allowed` | 외부 주소가 `allowed_hosts` 밖이거나 사설망 |
| 422 | `key_type_unknown` | |

## 호환 규칙

- 상태·종류 값은 열린 문자열이다. 모르는 manifest·카탈로그 필드는 보관하고 무시한다.

## 변경 이력

| 날짜 | schema | 바뀐 것 | ADR |
| --- | --- | --- | --- |
| 2026-11-11 | 1 | **열린 모드**에서는 폴더 키(연동용·대리 답용)가 없어도 된다 — 키 없는 호출이 관리자다(C5 §인증). 폴더 키 규칙은 그대로다 | [0142](../decisions/0142-open-mode.md) |
| 2026-11-09 | 1 | §콘솔에서 고치는 외부 확장 — `POST·PUT·DELETE /resources/extensions…`, `…/versions`·`…/dependents`·`…/test-calls`(`ExtensionCreateRequest`·`ExtensionUpdateRequest`·`ExtensionVersionInfo`·`ExtensionDependent`·`ExtensionRevoked`·`ExtensionTestCall`·`ExtensionTestResult`), `ExtensionResource.source`. 새 엔드포인트와 선택 칸이라 schema는 그대로다 | [0141](../decisions/0141-adapter-definitions-are-edited-in-the-console.md) |
| 2026-11-08 | 1 | 일꾼 폴더는 일꾼을 **처음 들이기만** 한다 — 이미 있는 일꾼은 `unchanged`, 파일이 빠져도 일꾼을 지우지 않는다. 모양은 그대로다 | [0137](../decisions/0137-consumers-are-managed-in-the-console.md) |
| 2026-11-08 | 1 | `ServiceAppResource`에 `app_group`·`keywords`·`groups`(C11 manifest 그대로 — CON-18). 선택 칸이라 schema는 그대로다 | [0138](../decisions/0138-console-app-catalog.md) |
| 2026-11-01 | 1 | §폴더 키 — 일꾼 폴더의 `<이름>.key.json`(`FolderKey`)으로 연동용·대리 답용 키를 들인다. `ConsumerFolderItem.kind`에 `key`. 선택 칸이라 schema는 그대로다 | [0123](../decisions/0123-folder-keys.md) |
| 2026-10-31 | 1 | 일꾼 폴더 — `GET /resources/consumer-folder`(`ConsumerFolderScan`). 외부 확장의 출처가 **일꾼이 올린 정의**가 되었다(C15 `PUT …/self/extension`) — 등록·해제 경로는 C13에서 걷었다. 선택 칸이라 schema는 그대로다 | [0122](../decisions/0122-consumer-folder.md) |
| 2026-10-31 | 1 | 칸은 그대로다. 확장 기여 자원의 예(UI 화면)를 걷고 `RuntimeResource.versions`에서 `worker`를 뺐다 — UI 자동화 확장이 없다 | [0114](../decisions/0114-remove-ui-automation.md) |
| 2026-10-29 | 1 | **Center는 바깥 기능을 읽으러 가지 않는다** — 서비스 앱 등록·주소·해제·`/manifest`·`/healthz`·`trust` 읽기, 외부 앱 키(운영·시험용), 외부 확장 주소 덮어쓰기, 어댑터 `health` 두드리기를 걷었다. 서비스 앱·기여 자원은 일꾼이 올리고 상태는 토픽이 말한다(`consumers` 칸). `base_url`은 빈다 | [0102](../decisions/0102-calling-outside-is-pull.md) |
| 2026-10-25 | 1 | §외부 확장 주소 — `PUT/DELETE …/extensions/{id}/address`, `ExtensionResource.address{base_url, set_at, set_by}`, 사유 `address_outside_definition`. 선택 칸이라 schema는 그대로다 | [0097](../decisions/0097-external-extension-address-from-center.md) |
| 2026-10-25 | 1 | `GET /signing-keys`(인증 없음), §외부 앱 키(운영 `PUT/DELETE …/extensions/{id}/app-key`·시험용 `…/app-key/test`, `ExtensionResource.app_key{run, test}`), `trust`의 `pin_mismatch`, `ServiceAppResource.trust` | [0094](../decisions/0094-service-app-keys-ride-the-deployment.md) |
| 2026-10-25 | 1 | `bot_ui`·`server_runner` 키는 등록 승인이 만든다 — `CenterKeyInfo.enrollment_id?`. 이 경로로 발급하는 길은 자동화·시험용으로 남는다 | [0092](../decisions/0092-keys-are-issued-and-delivered-by-center.md) |
| 2026-10-20 | 1 | 키 종류 **`relay`(대리 답용 키)**를 더했다 — CON-11에서 발급한다 | [0081](../decisions/0081-answering-on-behalf.md) |
| 2026-10-12 | 1 | **툴팩 리소스를 뺐다** (`ToolpackResource`·`?type=toolpack`·누락 검사의 `toolpack`) — 툴팩이라는 패키지 갈래가 사라졌다. 고정 종류는 **넷**이다 (확장·서비스 앱·확장 기여 자원·런타임). 도구는 확장이 기여한다 | 0050 |
| 2026-10-01 | 1 | 초안 | 0010, 0013, 0015 |
| 2026-10-01 | 1 | 확장 반영·검토 반영 (아래) | 0018 |

확장 반영·검토 반영 내용:

- 확장 리소스를 더했다.
- UI 화면을 **확장 기여 자원**(공통 카탈로그)으로 일반화했다.
- 외부 앱 상태는 어댑터 `health`로 본다.
- 주소 출처를 하나로 했다 (`PUT …/service-apps`).
- 이름 공간을 하나로 했다.
- 읽기 권한에 PC 실행기·서버 실행기 키를 더했다.
- `installed_on`에서 Studio를 뺐다.
- 누락 검사가 확장 종류를 가리지 않게 했다.
