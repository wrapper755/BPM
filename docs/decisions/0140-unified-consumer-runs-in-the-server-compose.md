# ADR-0140. 통합 일꾼을 BPM 서버 구성(compose)에서 띄우고, 회사 업무 처리기는 그 이미지 위에 패키지로 얹는다

| 항목 | 값 |
| --- | --- |
| 상태 | 제안 |
| 날짜 | 2026-11-09 |
| 관련 | 계약 C15(일꾼 토큰·가져가기), `server/deploy/compose.yaml`, [ADR-0100](0100-server-runner-secrets-dir.md)(비밀 볼륨), [ADR-0122](0122-consumer-folder.md)(일꾼 폴더), [ADR-0135](0135-agentic-automation-and-unified-consumer.md)(통합 일꾼·업무 처리기), [ADR-0137](0137-consumers-are-managed-in-the-console.md)(CON-17), [ADR-0141](0141-adapter-definitions-are-edited-in-the-console.md) |

## 배경

통합 일꾼(`bpm-unified-consumer`, ADR-0135)은 BPM의 프로그램이고, 회사의 업무 처리기는 엔트리 포인트 `bpm.consumer_handlers`로 그 안에 실린다. 그런데 서버 구성(`server/deploy/compose.yaml`)이 띄우는 것은 Center·콘솔·서버 실행기 셋뿐이라, 통합 일꾼은 **회사 쪽 스크립트·systemd 유닛이 회사 저장소 폴더에서** 띄운다. 운영자 눈에는 일꾼이 회사 시스템의 서버 하나로 보이고 BPM 구성요소로 보이지 않는다 — 사용자가 「앞뒤가 안 맞는다, 일꾼은 BPM 안에서 돌아야 한다」고 했다(2026-11-09).

지켜야 할 것도 있다. **회사 업무 규칙은 BPM 저장소에 들이지 않는다**(ADR-0135 §5 — 플랫폼은 특정 회사의 처리기를 import하지 않는다). 그러니 「BPM 안에서 돈다」는 코드를 옮기는 것이 아니라 **BPM이 짓는 일꾼 이미지·서비스 자리에서 돈다**는 뜻이어야 한다.

## 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| A. 지금대로 — 회사 쪽이 띄운다 | 바꿀 것이 없다. 처리기를 고치면 그 자리에서 다시 띄운다 | 일꾼이 BPM 구성요소로 보이지 않는다. 서버마다 띄우는 방법이 다르다(스크립트·systemd·손) |
| B. **BPM compose에 `unified-consumer` 서비스를 두고(BPM 이미지, 처리기 없음), 회사는 그 이미지를 `FROM`으로 받아 처리기 패키지만 더한 이미지를 지어 compose 덧붙임 파일로 바꿔 끼운다** | BPM 저장소에 회사 이름·코드가 없다. 일꾼이 Center·서버 실행기와 같은 구성에서 같은 방법으로 뜬다. 처리기가 없어도 그 서비스가 외부 정의만 돌리는 API 일꾼으로 쓸모가 있다 | 회사가 이미지를 짓는 단계가 하나 는다. 회사 이미지가 BPM 이미지 판에 묶인다 |
| C. BPM 이미지가 빌드 인자로 처리기 패키지(git 주소·wheel)를 받아 설치한다 | 회사가 Dockerfile을 쓰지 않는다 | BPM 빌드가 바깥 저장소에 닿아야 한다(비공개 저장소면 자격 증명). 처리기의 의존성이 BPM 이미지 빌드를 깨뜨릴 수 있다 |
| D. 처리기 폴더를 볼륨으로 붙이고 뜰 때 설치한다 | 이미지를 다시 짓지 않는다 | 뜰 때마다 의존성을 받는다(네트워크·시간). 같은 이미지가 날마다 다른 코드를 돌린다 |

## 결정

> 제안: **B.** 사용자 확인 전이다.

1. **`unified-consumer` 서비스**를 `server/deploy/compose.yaml`에 둔다. 이미지는 `server/deploy/Dockerfile.unified-consumer`(BPM 패키지만 — 처리기 없음)이다. 처리기가 없는 통합 일꾼은 `BPM_CONSUMER__DEFINITIONS`의 외부 정의만 돌리는 API 일꾼이다(ADR-0135 §4).
2. **기본으로는 뜨지 않는다** — compose 프로필 `consumer`에 둔다. 일꾼 토큰이 없는 서버에서 `docker compose up`이 실패하지 않게 하기 위해서다. 쓰는 서버는 `.env`의 `COMPOSE_PROFILES=consumer`로 켠다.
3. **Center 주소는 컨테이너 이름**(`http://center:8800`), 일꾼 토큰은 `.env`의 `BPM_CONSUMER__CENTER__TOKEN`이다. 일꾼 행은 지금처럼 CON-17에서 만들거나 일꾼 폴더로 처음 들인다(ADR-0122·0137) — 이 결정은 토큰을 받는 방법을 바꾸지 않는다.
4. **작업 상태는 볼륨 `unified-consumer-data:/data`**(`BPM_CONSUMER__DATA_DIR`)에 둔다. 다시 띄워도 멱등 저장소와 처리기의 SQLite가 남는다.
5. **관리 API(8770)는 compose 망 안에만** 연다. 서비스 앱 콘솔(SVC)을 compose에 더할 때 그 콘솔이 부른다.
6. **회사 업무 처리기**는 회사 저장소가 짓는다.
   - Dockerfile은 `FROM <BPM 일꾼 이미지>:<판>` + 처리기 패키지 설치 한 단계다. 처리기의 BPM 고정 커밋과 `FROM` 판을 같은 것으로 맞춘다.
   - compose 덧붙임 파일(`compose.<회사>.yaml`)이 `unified-consumer`의 `image`와 처리기 설정 칸(`BPM_CONSUMER__HANDLERS`, `BPM_CONSUMER__HANDLERS__<이름>__*`)을 채운다. 그 파일은 회사 저장소에 있고 BPM 저장소에는 없다.
   - 처리기가 부르는 회사 시스템이 같은 호스트에서 돌면 `host.docker.internal`로 부른다(서버 실행기와 같은 `extra_hosts`).
7. **운영 서버를 옮기는 일은 따로 한다.** 회사 쪽 systemd 일꾼을 멈추고 compose 서비스로 바꾸는 것은 백업부터 사용자에게 묻고 진행한다.

## 결과

- 이 결정으로 쉬워지는 것: 일꾼이 Center·서버 실행기와 같은 구성에서 뜨고, 서버를 새로 꾸릴 때 compose 하나로 끝난다. 처리기가 없는 일꾼(외부 정의만)도 같은 서비스로 띄운다. BPM 저장소는 회사를 모른 채로 남는다.
- 어려워지거나 포기하는 것: 처리기를 고치면 회사 이미지를 다시 지어야 한다(지금은 프로세스만 다시 띄운다). BPM 이미지 판을 올리면 회사 이미지도 다시 지어야 한다. 회사 시스템을 컨테이너 밖에서 부르는 길(`host.docker.internal`, 방화벽)을 서버마다 확인해야 한다.
- 다시 볼 조건: 처리기를 둘 이상 한 서버에 띄워야 할 때(서비스를 처리기마다 나눌지), 처리기 이미지 짓기가 운영에 부담이 될 때(C·D를 다시 본다).
