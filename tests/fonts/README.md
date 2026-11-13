# 시험용 글꼴

**한글이 든 표본 PDF를 만드는 데만 쓴다** (`tests/sample_files.py` → `fpdf2`). 제품에는 들어가지
않는다 — 웹 화면의 글꼴은 `server/web/packages/ui/src/fonts/`(woff2)이고, 그것은 fpdf2가 읽지
못한다.

Qt Studio를 걷으면서(ADR-0143, M11 조각 5) `shared/qt/.../fonts/`에 있던 것을 **쓰는 자리 하나로**
옮겨 왔다. 라이선스는 OFL이고 전문은 `OFL-Pretendard.txt`에 있다.

표본 PDF에 한글이 없으면 `pdf_text_tool` 시험이 거짓이 된다 — 업무 문서는 한글이고, 라틴 전용
기본 글꼴로 만든 PDF는 그 길을 지나가지 않는다.
