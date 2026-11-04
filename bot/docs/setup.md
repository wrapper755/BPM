# PC 실행기 — 띄우기와 설정

공통 도구·포트·환경변수 규칙·시험(건너뛰는 것)은 [04-setup.md](../../docs/04-setup.md)에 있다. 여기에는 이 제품만의 것을 둔다 ([ADR-0129](../../docs/decisions/0129-product-folders.md)).

## 설정과 비밀

- PC 실행기 대기열 크기: 기본 20, `BPM_BOT_UI__QUEUE__MAX`. 실행 자리(동시 실행 BPM 프로세스 수)는 1로 고정이라 설정이 없다 ([ADR-0014](../../docs/decisions/0014-one-bot-per-pc.md)).
- PC 실행기(실행기)의 호출 토큰 (C15): PC 실행기가 제 Center API 키로 `POST /api/v1/call-tokens`에 청해(24시간) 실행 프로세스에게 넘긴다(환경변수 `BPM_BOT_UI__CALL_TOKEN`·제어 파일, 만료 2시간 전부터 새것). **메모리에만 들고** 비밀 저장소에 두지 않는다. 사람이 넣는 것은 없다.
- PC 실행기의 메일 보내기(BUI-03 「보내기」): 설정 파일에 **주소·보안·사용자·보내는 주소·첨부 상한·웹훅 허용 호스트**가 가고, **비밀번호는 OS 비밀 저장소**(`bpm-bot-ui`, 이름 `smtp-password`)다. 개발·CI에서는 `BPM_BOT_UI__SMTP__PASSWORD`로 주고, 나머지도 `BPM_BOT_UI__SMTP__HOST`·`__PORT`·`__SECURITY`·`__USERNAME`·`__FROM`·`BPM_BOT_UI__WEBHOOK__ALLOWED_HOSTS`(쉼표)로 덮어쓸 수 있다 ([ADR-0059](../../docs/decisions/0059-sending-mail-and-webhooks.md) — **비우면 보내지 않고 실패한다**). 실행 프로세스에는 **비밀번호를 명령줄로 넘기지 않는다** — 자식이 같은 저장소에서 제 손으로 읽는다.
- PC 실행기: `uv run bpm-bot-ui` (트레이에 뜬다. 트레이가 없는 환경이면 메인 창으로 뜬다). 설정은 BUI-03 창에서 하고 파일은 사용자 데이터 폴더의 `settings.json`이다. 환경변수로 덮어쓸 수 있다 — `BPM_BOT_UI__CENTER__URL`, `BPM_BOT_UI__QUEUE__MAX`, `BPM_BOT_UI__AUTOSTART`, `BPM_BOT_UI__DATA_DIR`. **Center API 키는 등록 승인으로 받아 OS 비밀 저장소**에 둔다(사람이 넣는 칸은 없다 — BUI-03). 비밀 저장소가 없는 환경(헤드리스 CI)에서는 `BPM_BOT_UI__CENTER_API_KEY`로 주고, 그러면 등록 요청을 보내지 않는다.

## 판 올리기

**사람이 설치 파일을 다시 돌린다** ([ADR-0069](../../docs/decisions/0069-upgrading-by-reinstall.md)) — Center는 프로그램을
내려 주지 않는다. BPM 프로세스의 판은 이것이 아니라 배포로 오간다(C2·C5).

1. 설치 파일은 **산출물 워크플로가 올린 것**(`installers-windows`)에서 받는다. 처음 설치와 같은 파일이다.
2. **PC 실행기는 빈 때 깐다** — 설치 파일이 PC 실행기를 닫으면 도는 BPM 프로세스와 대기열을 잃는다. CON-03에서 그 PC를
   「비활성화...」하면 새 작업이 그 PC로 가지 않고(Center에서 기다린다) 도는 BPM 프로세스는 끝까지 돈다. 「실행 중」·
   「대기열」이 비면 깐다. 결재를 기다리는 BPM 프로세스를 기다릴지 멈출지는 사람이 정한다.
3. 설치 파일을 돌린다 — 덮어쓰기이고 설정·설치한 BPM 프로세스·실행 기록은 남는다. 끝 화면의 「실행」으로 다시 띄운다.
4. CON-03에서 그 PC의 「버전」이 새 판으로 바뀌었는지 보고 「다시 활성화」한다.
5. 문제가 있으면 **옛 판의 설치 파일로 다시 깐다**(낮은 판으로 덮어써도 된다). **옛 설치 파일은 받은 사람이
   보관한다** — 산출물 워크플로는 30일만 남긴다(`desktop.yml` `retention-days`).


Studio도 같은 순서다 — 2번(대기열을 비우는 걸음)만 없다.
