# Studio — 띄우기와 설정

공통 도구·포트·환경변수 규칙·시험(건너뛰는 것)은 [04-setup.md](../../docs/04-setup.md)에 있다. 여기에는 이 제품만의 것을 둔다 ([ADR-0129](../../docs/decisions/0129-product-folders.md)).

## 설정과 비밀

- Studio 시험 실행의 서비스 앱 태스크: **키가 없다** — Studio가 제 Center API 키로 C15 외부 작업을 올린다(`origin: test` — 시험 쪽으로 보낼지는 일꾼이 정한다, ADR-0102 §6). 모델 키는 「LLM」에서 넣거나 `BPM_STUDIO__LLM__API_KEY`(이것이 이긴다). 확장의 **비밀 설정 칸**(C13 `configuration[].secret`, scope `studio`)은 STU-10 「확장별 설정」에서 넣으면 `ext:<확장>:<칸>`으로 가고 `BPM_STUDIO__EXT__<확장>__<칸>`이 이긴다 ([ADR-0073](../../docs/decisions/0073-studio-settings-only-what-is-used.md)).
- Studio: `uv run bpm-studio` (캔버스는 QtWebEngine이라 `pyside6-addons`가 함께 깔린다). 작업 폴더·설정은 사용자 데이터 폴더의 `studio/`이고 환경변수로 덮어쓴다 — `BPM_STUDIO__DATA_DIR`, `BPM_STUDIO__CENTER__URL`, `BPM_STUDIO__LLM__BASE_URL`, `BPM_STUDIO__LLM__MODEL`, `BPM_STUDIO__READABLE_DIRS`.
