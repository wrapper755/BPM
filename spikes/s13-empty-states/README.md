# s13 — 빈 화면 그림 시안

콘솔의 빈 상태(결재함 비었음·프로젝트 없음·실행 없음 …)에 둘 큰 그림을 Gemini(nano banana)로 뽑아 본다.
생성기는 `spikes/s12-studio-icons/gen.py`를 그대로 쓴다. 제품 코드가 이 폴더를 import하지 않는다.

- `prompts.py` — 한 판(여섯 칸)의 프롬프트, 결 A~D
- `out/` — 뽑은 판. **고른 판 `sheet-D.png`(점선 연결)만 커밋한다** — `cut.py`가 그것을 잘라 콘솔 `public/empty/`에 쓴다
- `cut.py` — 칸마다 잘라 한 색 마스크 PNG로 (`python cut.py out/sheet-D.png ../../server/web/apps/center-console/public/empty`)

고른 것만 한 색 마스크로 만들어 제품에 넣는다 (ADR-0132의 결 — 밝게·어둡게는 칠할 토큰만 바뀐다).
