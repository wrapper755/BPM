"""결재 설명(C14 「결재 설명」)을 그리는 한 함수 — 결재 창(CMN-01)과 Studio 미리보기가 같이 쓴다.

**HTML은 그리지 않는다** (ADR-0134) — 설명에 적힌 태그는 글자로 보인다. 링크는 `http`·`https`만 연다.
"""

from __future__ import annotations

import re

from PySide6.QtCore import QUrl
from PySide6.QtGui import QDesktopServices, QTextDocument

#: 그리는 방언 — GitHub 방언에서 HTML만 뺀다.
FEATURES = (
    QTextDocument.MarkdownFeature.MarkdownDialectGitHub | QTextDocument.MarkdownFeature.MarkdownNoHTML
)
#: 브라우저로 여는 링크.
OPENS = ("http", "https")
_BODY_FONT = re.compile(r"<body[^>]*>")


def to_html(text: str) -> str:
    """Markdown 글 → Qt 서식 글(HTML). 빈 글은 빈 글."""
    if not text.strip():
        return ""
    document = QTextDocument()
    document.setMarkdown(text, FEATURES)
    # 글꼴은 그리는 칸의 것을 따른다 — Qt가 `<body>`에 적는 기본 문서 글꼴(9pt)을 남기면
    # 옆 입력 칸보다 글자가 작아진다 (테마 글꼴·크기가 끼어들 자리가 없다).
    return _BODY_FONT.sub("<body>", document.toHtml(), count=1)


def open_link(link: str) -> bool:
    """`http`·`https` 링크만 브라우저로 연다 — 그 밖(파일·스크립트)은 열지 않는다."""
    url = QUrl(link)
    if url.scheme().lower() not in OPENS:
        return False
    return QDesktopServices.openUrl(url)


__all__ = ["FEATURES", "OPENS", "open_link", "to_html"]
