# 07. 스타일 가이드

> 상태: **확인 (2026-10-01, 미리보기 검토 완료).** 모든 화면(Studio, PC 실행기, Center 콘솔, 서비스 앱 관리 콘솔)이 이 문서와 `design/tokens.json` 하나를 따른다 ([ADR-0017](decisions/0017-web-nextjs-design-system.md)).
> 미리보기: `design/preview.html`을 브라우저로 연다 (밝게/어둡게 전환 단추, 명암비 표 포함). 생성물이다.
> 화면 배치·문구의 개별 결정은 `06-screens/`, 공통 UX 원칙 U1~U17은 [docs/06-screens.md](06-screens.md) §2.

## 1. 원칙

| # | 원칙 | 뜻 |
| --- | --- | --- |
| D1 | **같은 것은 같게** | 같은 상태·동작은 모든 앱에서 같은 말·같은 색·같은 위치. "실행 중"은 Studio·PC 실행기·콘솔 어디서나 `active` 색 + 「실행 중」 |
| D2 | **일하는 화면** | 장식보다 정보 밀도와 읽기 쉬움. 운영자는 하루 종일 표를 본다. 그림자·그라데이션·애니메이션은 최소 |
| D3 | **토큰만 쓴다** | 색·크기·간격 값을 코드에 직접 쓰지 않는다. 필요한 값이 없으면 토큰을 추가한다 (PR에서 이 문서와 함께) |
| D4 | **색만으로 말하지 않는다** | 상태는 항상 점(색) + 글자 (U7). 색맹·흑백 인쇄에서도 구분된다 |
| D5 | **모른다고 말한다** | 닿지 못한 값은 추측하지 않고 「알 수 없음」·「(오프라인 — 마지막 확인 <시각>)」 (U8) |
| D6 | **접근성 AA** | WCAG 2.2 AA: 본문 글자 명암비 4.5:1, 큰 글자·UI 경계 3:1, 키보드로 모든 동작, 포커스가 항상 보임 |

## 2. 토큰

원본은 `design/tokens.json`. 아래 표는 이름과 쓰임만 적는다 (값은 원본에서). 토큰 이름은 웹에서 `--bg-surface`처럼 점을 `-`로 바꾼 CSS 변수, Qt에서 `tokens.BG_SURFACE` 상수가 된다.

### 2-1. 색 — 바탕·선·글자

| 토큰 | 쓰임 |
| --- | --- |
| `bg.canvas` | 페이지·창의 바탕 |
| `bg.surface` | 패널·카드·표·대화상자 |
| `bg.subtle` | 표 머리, 줄 위에 올렸을 때, 읽기 전용 칸 |
| `bg.inverse` / `text.inverse` | 툴팁 |
| `border.default` / `border.strong` | 구분선 / 입력칸·보조 단추 테두리 |
| `text.primary` / `text.secondary` / `text.muted` | 본문 / 표 머리·보조 설명 / 설명 줄·빈 상태 (모두 바탕 셋 위에서 4.5:1 이상 확인됨) |
| `primary` / `primary.hover` / `primary.subtle` / `primary.fg` | 주 단추·링크·선택된 메뉴 / 위에 올림 / 선택 바탕·Studio 위 띠(§4-2) / 주 단추 글자 |
| `focus` | 포커스 테두리 (2px, 2px 띄움), 데스크톱 고른 탭의 밑줄 (§3 Tabs — `primary`보다 연한 보라) |
| `chrome.bg` / `chrome.fg` / `chrome.muted` / `chrome.hover` / `chrome.border` / `chrome.side` / `chrome.side.hover` / `chrome.edge` | 웹 콘솔의 **남색 틀**(위 막대·왼쪽 탐색, §4-1) — 위 막대 바탕(가장 짙다) / 글자 / 보조 글자 / 위 막대에서 올림 / 구분선 / 왼쪽 탐색 바탕(위 막대보다 분명히 밝다 — 비슷하면 둘의 경계가 보이지 않는다) / 탐색에서 올림 / 위 막대 아래 띠(라벤더 2px — 위 막대와 탐색을 가른다). 남색 단계는 로그인 배경 그림(ADR-0120)에서 골랐다(`.chrome-side`가 탐색에 바꿔 끼운다). 틀 안에서는 `.chrome`이 `bg.surface`·`text.*`·`border.*`를 이것으로 바꿔 끼워 구성요소를 그대로 쓴다 (글자는 바탕·`chrome.hover` 위 둘 다 4.5:1 이상 확인됨) |
| `danger.fg` | 위험 단추 글자 (`status.failed.solid` 바탕 위) |

브랜드 색은 `primary` 하나다(남보라 — NowView와 같은 값, [ADR-0119](decisions/0119-match-nowview-style.md)). 남색 틀(`chrome.*`)은 틀에만 쓴다. 그 밖의 색은 모두 **상태 색**이다.

### 2-2. 색 — 상태 7가지

상태마다 세 값: `fg`(글자), `bg`(배지 바탕), `solid`(점·막대·아이콘). `fg`는 `bg`와 `bg.surface` 위에서 모두 4.5:1 이상.

| 상태 토큰 | 뜻 | 대표 예 |
| --- | --- | --- |
| `neutral` | 아직·멈춤·의미 없음 | 대기, 취소됨, 비활성, 폐기됨 |
| `active` | 지금 움직이는 중 | 실행 중, 전달됨, 요청 처리 중 |
| `done` | 정상·성공 | 완료, 연결됨, 정상, 사용 중 |
| `failed` | 실패·막힘 | 실패, 오류, 실행 불가, 응답 없음 |
| `waiting` | **사람이나 차례를 기다림** | 결재 대기, 확인 대기, 대기열, 검증 전 |
| `warning` | 주의 (곧 문제가 될 수 있음) | 만료, 연결 끊김, 다시 띄우는 중, 저하 |
| `replayed` | 학습한 대로 다시 함 | 재생됨 |

화면 표기 → 상태 토큰 대응은 `tokens.json`의 `status_map`이 원본이다 ([docs/06-screens.md](06-screens.md) §3의 표와 같아야 한다). 새 상태를 만들면 `status_map`에 먼저 넣는다.

### 2-3. 글자

| 토큰 | 값 | 쓰임 |
| --- | --- | --- |
| `font.family.sans` | **Geist**(라틴) → **Pretendard**(한글) (둘 다 OFL, 앱에 포함) → 맑은 고딕 → 시스템 | 모든 글자. 웹은 영문·숫자가 Geist, 한글이 Pretendard다(NowView와 같은 모양). 데스크톱은 Geist를 등록하지 않아 Pretendard로 그린다 |
| `font.family.mono` | JetBrains Mono → D2Coding → Consolas | id, 키 앞자리, 로그, JSON, 코드 |
| `size.display` 30 / `h1` 24 / `h2` 20 / `h3` 18 | 제목 (굵기 600~700, 줄 높이 1.3) | 페이지 제목 = h1, 섹션 = h2·h3 |
| `size.body-lg` 16 | | 대화상자 본문 |
| `size.body` **14** | 기본 (줄 높이 1.5) | 대부분의 글자 |
| `size.body-sm` 13 | | 표 머리, 촘촘한 표 |
| `size.caption` 12 | | 배지, 보조 정보, 시각 |

- 숫자 열은 `font-variant-numeric: tabular-nums` + 오른쪽 정렬.
- 글꼴 파일은 저장소에 포함한다 (Windows 현장 PC에 Pretendard가 없으므로). **외부 CDN 금지** — 사내망이다.
  - 웹: `server/web/packages/ui/src/fonts/`의 가변 woff2(`GeistVariable-latin` — 라틴 부분 집합, `PretendardVariable`)를 `@font-face`로 자체 호스팅한다. 패밀리 이름을 토큰의 글꼴 스택에 적힌 이름(`Geist`, `Pretendard Variable`)과 **같게** 선언해, 화면 코드가 토큰만 보면 되게 한다.
  - 데스크톱: `shared/qt/src/bpm/qt/fonts/`의 **굵기별 정적 OTF**를 `load_fonts()`가 등록한다 (Qt는 가변 글꼴의 굵기 축을 고르게 다루지 못한다).
  - 라이선스 파일(SIL OFL 1.1)을 글꼴과 함께 둔다.

### 2-4. 간격·크기·모양

| 종류 | 토큰 |
| --- | --- |
| 간격 (4px 단위) | `space.1`=4, `2`=8, `3`=12, `4`=16, `5`=20, `6`=24, `8`=32, `10`=40, `12`=48, `16`=64 |
| 둥글기 | `radius.sm` 4 (배지 안쪽·체크) / `md` 6 (단추·입력칸) / `lg` 8 (패널·카드) / `xl` 12 (대화상자) / `full` (배지·점) |
| 그림자 | `sm` 카드(표·빈 상태 — 선 + 옅은 그림자로 연회색 바탕에서 떠 보이게, NowView와 같은 결) / `md` 펼침 메뉴·팝오버 / `lg` 대화상자 |
| 컨트롤 높이 | `control.sm` 28 / `md` **32**(기본) / `lg` 40 |
| 표 줄 높이 | `row.default` 36 / `row.compact` 32 (Studio·PC 실행기 표) |
| 칸 줄 간격 | 데스크톱 **이름–입력 칸의 줄 사이는 `space.3`(12) 하나**다 — 설정·속성 패널·대화상자·결재 창 모두(`QFormLayout`·이름 열이 있는 `QGridLayout`의 `setVerticalSpacing`). 창마다 달리 두면 같은 칸이 창에 따라 빽빽하거나 헐겁다. `tests/shared/test_qt_form_spacing.py`가 지킨다 |
| 콘솔 틀 | 왼쪽 탐색 `nav.width` 224 (접으면 64), 위 막대 `topbar.height` 48, 본문 여백 24 |
| 움직임 | `motion.fast` 120ms (올림·포커스), `base` 200ms (펼침·대화상자). 운영체제의 "동작 줄이기"를 따른다 |

## 3. 구성요소

웹은 `server/web/packages/ui`(shadcn/ui를 우리 토큰으로 맞춘 것), 데스크톱은 `shared/qt`(같은 이름의 위젯). **이름을 같게** 해서 화면 설계서가 둘 다를 가리킬 수 있게 한다.

| 구성요소 | 규칙 | 웹 | Qt |
| --- | --- | --- | --- |
| **Button** | 종류: `primary`(채움, **영역마다 하나** — 데스크톱은 **연한 채움**: `primary.subtle` 바탕에 `primary` 글자·테두리. 회색 화면에서 진한 채움 하나가 너무 튄다) / `secondary`(테두리) / `ghost`(글자만) / `danger`(되돌릴 수 없는 동작). 창을 여는 단추는 글자 끝에 「...」. 할 일이 없으면 끄고, 왜 꺼졌는지 가까이에 적는다 (U3). 위치는 영향을 주는 영역의 오른쪽 위 (U14) | `Button` | `ChkButton` |
| **StatusBadge** | 점 + 글자, `status_map`으로 색 결정. 글자를 생략하지 않는다 | `StatusBadge` | `ChkStatusBadge` |
| **DataTable** | 머리 고정, 줄 높이 토큰, 숫자 오른쪽, id는 mono + 짧게(툴팁에 전체, U2), 업무 값 열은 기본 접음 (U10). 정렬·필터 상태는 주소(URL)에 남긴다 | `DataTable` | `ChkTableView` |
| **FilterBar** | 표 위, 접을 수 있음. 「최근 n건」은 숫자 상자 | `FilterBar` | — |
| **Field** | 라벨은 위, 필수는 ` *`, 도움말은 아래 회색, 오류는 아래 `failed.fg` 한 줄. 저장 전 변경은 U11의 세 갈래 질문 | `Field` | `ChkField` |
| **Dialog / Confirm** | 제목은 동사로 (「키를 폐기할까요?」). 위험 확인 창은 **기본 단추 「취소」**, 위험 단추는 `danger` (U9) | `Dialog`, `ConfirmDialog` | `ChkConfirm` |
| **결재·확인 창** | CMN-01. 제목부터 결재/확인을 구분 (U16) | (CON-04 안) | `ApprovalDialog` |
| **Toast / 알림** | 성공 5초, 실패 8초, 사람이 답해야 하는 것은 사라지지 않음 (BUI-05와 같은 규칙) | `Toast` | 트레이 알림 |
| **EmptyState** | 다음에 할 일을 말한다 (U12): 「작업 지시가 없습니다. 「새 작업...」으로 만드세요.」 | `EmptyState` | `ChkEmpty` |
| **ErrorBanner** | 한 줄 요약(굵게) → 「상세 보기」 접힘 (U13). 오류 코드는 mono | `ErrorBanner` | `ChkErrorBanner` |
| **KeyReveal** | 키 원문은 **발급 직후 한 번만**, 복사 단추 + 「다시 볼 수 없습니다」. 그 뒤에는 앞자리 16자만 | `KeyReveal` | `ChkKeyReveal` |
| **Timeline** | CON-01 노드 막대: 상태 `solid` 색, 재생됨은 점선, 이어 돈 지점은 세로 점선 | `RunTimeline` | Studio 캔버스 표시 |
| **LogView** | mono 13px, 최대 5000줄, 실패 줄은 `failed.fg` | `LogView` | `ChkLogView` |
| **Section (묶음)** | 한 화면 안의 기능 묶음. 제목은 **카드 안쪽 맨 위**에 `text.primary`·굵게(`weight.bold`)·`size.body-lg`로 쓰고, **그 아래 묶음 폭 전체에 옅은 선**(`border.default` 1px, 카드 양끝까지)을 긋는다. 꾸밈(세로 막대·이름표·아이콘)은 달지 않는다 — 진한 막대는 화면마다 줄지어 너무 셌고, 아이콘은 묶음이 하는 일이 아니라 갈래라 뜻을 싣지 못한다(§6은 하는 일로 고른다). 선은 제목 칸의 밑줄을 오른쪽으로 길게 늘여 긋는다(묶음이 넘친 것을 자른다) — 앱 전체에 거는 Python 걸러 내기는 캔버스(QtWebEngine)와 함께 앱을 죽여 쓰지 않는다. 제목과 내용 사이는 `space.3`, 묶음과 묶음 사이도 `space.3`. 테두리 위에 걸친 회색 제목은 쓰지 않는다 — 내용과 붙어 보이고 묶음이 갈리지 않는다 | — | `QGroupBox` 스타일 |
| **Tabs / Nav** | 웹: 탭은 둥근 알약(`radius.md`) — 선택된 것은 `primary.subtle` 바탕 + `primary` 글자 + 굵게, 나머지는 흰 바탕 + 선. **데스크톱: 앱의 모든 탭이 한 모양** — 위가 둥근 탭(`radius.md`)이고 고른 것은 `bg.surface` 바탕 + `text.primary` 굵게(`weight.semibold`) + **연한 보라 밑줄 2px(`focus`)**, 나머지는 머리 바탕(§4-2) + `text.secondary`. `primary` 밑줄은 너무 셌다. 밑줄 자리는 다른 탭도 같은 두께로 비워 고를 때 높이가 바뀌지 않는다. 웹 콘솔의 왼쪽 탐색(남색 틀)은 고른 줄이 `primary` 바탕 + `primary.fg` 글자다 | `Tabs`, `SideNav` | `QTabWidget` 스타일 |

- **웹 화면에서 손으로 쓴 칸·묶음도 같은 모양이다** — `<select>`·`<input>`·`<textarea>`는 입력칸(Field)처럼 `radius.md` + `border.strong`, `details`·`fieldset` 묶음은 카드처럼 `radius.lg` + `bg.surface`. 상태 배지는 `radius.full`. 섹션 제목(h2)은 굵기 `semibold` 하나다.

## 4. 배치

### 4-1. 웹 콘솔 (CON-00, SVC-00)

```
+------------------------------------------------------------------+
| [T] top bar 48px (full width, chrome): mark | user | [Refresh]   |
+--------------------+---------------------------------------------+
| [N] side nav 224px |
| (chrome)           | [H] header band (white): crumb               |
|                    |     h1                         [sec] [prim]  |
|                    | [F] filter card            [Reset] [Narrow]  |
|                    | [B] body: table → detail below / side panel  |
+------------------------------------------------------------------+
```

- **틀은 NowView와 같다** ([ADR-0119](decisions/0119-match-nowview-style.md)) — 화면 폭 전체의 남색 위 막대(48)와 그 아래 남색 왼쪽 탐색(224)이 고정이고, 본문만 스크롤한다. 탐색은 위 막대보다 밝은 남색이고 위 막대 아래에 라벤더 띠(`chrome.edge`)가 있어 둘이 갈린다. 본문 바탕은 `bg.canvas`(연회색), 카드·표는 `bg.surface`(흰색). 본문 맨 위는 **흰 머리 띠**(`bg.surface`, 아래 `border.default`)에 지금 자리(「상위 메뉴 › 메뉴 줄」, `body` 보조 글자)와 제목 한 줄만 담고(설명 줄은 없다 — 화면 전용 단추·링크는 제목 오른쪽), 필터는 흰 카드(`radius.lg`) 하나에 담는다. 탐색의 고른 줄은 `primary` 바탕에 `primary.fg` 글자다. 탐색의 상위 메뉴는 `body` 굵게, 하위 메뉴는 `body.sm`으로 들여 쓰고 왼쪽에 `chrome.border` 세로선을 둔다.
- 기준 폭 1280 이상, 최소 1024에서 깨지지 않는다. **결재함(CON-04)은 휴대폰(360px)에서도 답할 수 있어야** 한다 (결재자가 밖에 있을 수 있다). 그 밖의 페이지는 좁은 화면에서 읽기만 되면 된다.
- 목록 → 고르면 아래에 상세 (프로토타입 습관 유지). 상세가 길면 오른쪽 패널(폭 480).
- 쓰기 단추는 「관리자」 모드에서만 보인다 (CON-00 쓰기 권한).

### 4-2. 데스크톱 (Studio, PC 실행기)

- 창 최소 크기는 각 화면 설계서의 값. 화면 배율 125%·150%에서 확인한다 (Per-Monitor DPI).
- 테마: 「시스템 따름」(기본) / 밝게 / 어둡게 (STU-10 「외형」, PC 실행기도 같음).
- 트레이 아이콘의 상태 점은 상태 `solid` 색, 툴팁에 글자.
- 표는 `row.compact`(32), 컨트롤은 `control.md`(32).
- **`control.md` 최소 높이는 한 줄 칸(입력줄·콤보·숫자 칸)에만** 건다. 여러 줄 글상자는 그 칸을 만든 쪽이 보일 줄 수로 높이를 정한다 — 설명·본문처럼 긴 글은 다섯 줄 이상.
- **표 칸 안의 콤보**(타입 고르기 같은 칸 위젯)는 칸 선에 붙지 않게 위아래 `space.0.5`·양옆 `space.1`을 띄우고, 안쪽 여백은 `space.1`, 높이는 줄을 따른다(`control.md` 최소 높이를 걸지 않는다). 그 열은 내용 폭에 맞춰 글자가 잘리지 않게 한다.
- 칸 여럿을 한 자리에 모을 때는 **레이아웃**으로 모은다 — 맨 `QWidget` 그릇은 앱 바탕(`bg.canvas`)을 칠해 칸 사이로 회색이 보인다.
- **카드 안의 묶음은 흰 바탕 위에 선으로만 갈린다** — 속성 패널의 편집기 탭(스크롤 영역 `EditorHolder`)도 바탕이 `bg.surface`다 — 맨 `QWidget`은 앱 바탕(`bg.canvas`)을 칠하므로 그 그릇에 이름을 붙여 칠한다. 묶음 사이로 회색 틈이 보이는 것은 메인 창의 카드 사이뿐이다.
- **Studio 메인 창은 영역을 색으로 가른다** (STU-01) — 메뉴 막대·도구 모음은 하나로 이어진 **연한 보라 띠**(`primary.subtle` 바탕 — 남색 틀(`chrome.*`)은 데스크톱 창 위에서 너무 세다. 글자·아이콘 `text.primary`, 꺼진 것 `text.muted`, 올림·켜진 체크 `bg.surface`, 구분선 `border.strong`, 띠 아래 `border.default` 선). 그 아래 작업 영역은 **틈 바탕**(밝게 `bg.subtle` / 어둡게 `bg.canvas` — 어느 테마에서나 카드보다 한 단계 가라앉는 쪽) 위의 흰 카드(`bg.surface`·`border.default`·`radius.lg`)다. 카드 머리띠는 **머리 바탕**(밝게 `bg.canvas` / 어둡게 `bg.subtle` — 틈과 카드 사이 단계)에 `text.secondary`·`weight.semibold`, 아래 `border.default` 선. 탭이 있는 카드는 탭 줄이 머리띠이고 탭 모양은 앱의 다른 탭과 같다(§3 Tabs — 고른 것은 흰 바탕 + 굵게 + 연한 보라 밑줄). 띠를 쓰는 창은 객체 이름이 아니라 **`band` 속성**(`QMenuBar[band="true"]`·`QToolBar[band="true"]`)으로 고른다 — PC 실행기 같은 다른 창은 그대로다.
- 펼친 메뉴(메뉴 막대·문맥 메뉴)는 `bg.surface` 바탕에 `border.strong` 테두리, 고른 줄은 `primary`·`primary.fg`. 메뉴에는 아이콘을 보이지 않는다(체크 표시를 가린다) — 아이콘은 도구 모음·탐색기 줄·보조 단추에만(§6).
- 글자 하나의 뜻은 `QLabel`의 **`role` 속성**으로 준다 — 색·크기를 코드에 쓰지 않는다. 생성 QSS(`gen_tokens.py`)가 칠한다. **`bpm.qt.theme.set_role(위젯, 뜻)`으로 준다** — Qt는 스타일시트를 처음 보일 때 한 번 입히므로 `setProperty`만 부르면 보인 뒤에 준 뜻이 칠해지지 않는다.

  | `role` | 쓰는 곳 | 모양 |
  | --- | --- | --- |
  | `error` | 막는 까닭·검증 오류 (U3 「바로 아래에 빨간 글자로」) | `status.failed.fg` |
  | `warning` | 막지는 않는 주의 | `status.warning.fg` |
  | `muted` | 덜 중요한 설명 | `text.muted` |
  | `h2` | 창 안의 큰 제목 | `size.h2`·`weight.semibold` |

  모르는 `role`은 기본 글자로 보인다. 도구 모음의 실행 단추는 실행 중에 **`running` 속성**(`QToolButton[running="true"]`)으로 강조색(`primary`·`primary.fg`)이 된다 (U5). 새 `role`을 쓰려면 이 표와 생성기를 함께 고친다 (시험이 코드에서 쓰는 `role`을 모아 대조한다).

## 5. 문구

| 항목 | 규칙 | 예 |
| --- | --- | --- |
| 말투 | 합니다체, 짧게. 느낌표·이모지 없음 (상태 기호 ●○✅⛔는 표에서 글자와 함께만) | 「저장했습니다.」 |
| 단추 | 동사 하나 또는 명사+동사. 창을 열면 「...」 | 「실행」, 「새 작업...」, 「키 폐기...」 |
| 오류 | 무엇이 + 왜 + 무엇을 하면 되는지 | 「Center에 닿지 못했습니다 — 주소와 포트를 확인하세요」 |
| 빈 상태 | 없다 + 다음 할 일 (U12) | 「설치된 BPM 프로세스가 없습니다. Center에서 배포하면 여기에 나타납니다.」 |
| 용어 | [02-glossary.md](02-glossary.md)만 쓴다. "프로세스" 단독 금지, BPM 프로세스 / 서버 BPM 프로세스 / PC 실행기 구분 | |
| 시각 | 24시간, 로컬 시간대. 목록은 오늘이면 「10:15」, 아니면 「10-01 10:15」, 상세는 「2026-10-01 10:15:03」. 상대 시각(「3분 전」)은 툴팁에 절대 시각과 함께 | |
| 기간 | 「42초」, 「1분 20초」, 「2시간 5분」 | |
| 숫자 | 천 단위 쉼표, 단위 붙여 씀 | 「1,204초」, 「토큰 12,400」 |
| id | mono, 앞부분만 + 툴팁에 전체, 옆에 복사 단추 | `run_20261001…a1b2c3` |
| 키 | 앞자리 16자 + 「…」 | `bpm_svc_a1b2c3d4…` |

## 6. 아이콘

- **웹은 Lucide** 한 벌만 (`lucide-react`, ISC). 선 굵기 기본(2)을 바꾸지 않는다.
- **데스크톱(Qt)은 우리가 그린 한 벌**이다 ([ADR-0132](decisions/0132-desktop-icons-are-drawn-masks.md)) — 둥근 끝의 고른 선(「선」 시안), 채움·음영·글자 없음. `shared/qt`의 테마 폴더에 `icon-<이름>.png`(128×128, 검정 + 알파 마스크)로 두고 `bpm.qt.theme.icon(이름, 색)`이 모양대로 토큰 색(팔레트)을 칠한다. 테마가 바뀌면 다시 칠한다. 새 아이콘은 `spikes/s12-studio-icons/`로 같은 결로 뽑아 판에 나란히 보고 들인다.
- 데스크톱에서 아이콘을 두는 곳: 도구 모음(아이콘 + 글자), 탐색기 줄(그룹·BPM 프로세스·정의), **단추 전부**(아이콘 + 글자 — 보조 단추와 대화상자 아래 단추·「적용」 같은 주 단추까지), 창 아이콘. **메뉴에는 두지 않는다.** Qt가 제 스타일로 붙이는 표준 단추 아이콘(초록 체크·빨간 X)은 쓰지 않는다(QSS `dialogbuttonbox-buttons-have-icons: 0`) — 우리가 짓는 대화상자 아래 단추(`QDialogButtonBox`)는 그 창이 단추 글자를 정한 뒤 `dress_button_box`를 불러 글자로, 없으면 역할로 우리 아이콘을 고른다(`check`·`x`·`save`·`upload` …). **메시지 상자(`QMessageBox`)는 글자만**이다 — 단추를 Qt가 지어 부를 자리가 없고, 앱 전체 이벤트 필터로 입히면 Wayland에서 Studio가 시작하다 죽었다. 창 아이콘(`app`)은 `primary`, 나머지는 그 자리의 글자색으로 칠한다 — 보조 단추(테두리)·도구 모음은 `ButtonText`, 주 단추(연한 채움)는 `primary`, 위험 단추는 `danger.fg`, 탐색기 줄은 `Text`.
- **채운 단추는 단추 무리마다 하나다.** 대화상자 아래 단추는 받는 쪽 하나(`AcceptRole` → `YesRole` → `ApplyRole` 차례로 처음 것)만 채우고 나머지(취소·닫기·반려 …)는 테두리다. 메시지 상자는 기본 단추(`:default`) 하나만 채운다(QSS). 「적용」 한 단추로 닫는 창은 `Apply`가 아니라 `Ok` 단추에 글자를 「적용」으로 준다 — `Apply`는 Qt가 「취소」 뒤에 놓아 다른 창과 순서가 뒤집힌다. 따로 이름(`Danger` 등)을 준 단추는 그대로 둔다. 창 안의 잔일 단추(새로 고침·켜기·끄기·찾아보기 …)는 테두리다.
- 크기 16 (본문 옆·탐색기 줄), 20 (단추·도구 모음).
- 아이콘만 있는 단추는 툴팁·`aria-label` 필수.

### 6-1. BPM 흐름 마크

화면에 제품 이름을 쓰지 않는다 — 「BPM」는 저장소 이름이다 ([ADR-0118](decisions/0118-no-product-name-on-screens.md)). 그 자리(웹 콘솔 탐색 맨 위·로그인 제목 위·브라우저 탭)에는 **BPM 흐름 마크**를 둔다: 시작 이벤트(빈 원) → 태스크(채운 둥근 네모) → 배타 게이트웨이(빈 마름모) → 끝 이벤트(굵은 원), 색은 `primary` 하나.

- 원본은 `design/bpm-mark.svg` 하나(`currentColor`)다. `scripts/gen_tokens.py`가 웹 구성요소 `BpmMark`(`server/web/packages/ui/src/bpm-mark.tsx`)와 콘솔마다 탭 아이콘 `app/icon.svg`(밝게·어둡게 `primary`)를 짓는다 — **생성물이니 직접 고치지 않는다**.
- 그림만 있는 자리에는 툴팁·`aria-label`로 이름을 준다(「Center 콘솔」, 서비스 앱 이름). 글 옆에 붙는 자리(로그인 제목)는 장식이라 읽지 않는다.
- Studio 창 아이콘(`app`)은 이 마크를 판에 새긴 그림이다(§6). PC 실행기 아이콘은 아직 이것으로 바꾸지 않았다.

## 7. 구현 규칙 (코드 리뷰 체크리스트)

- [ ] 색·크기·간격 값을 직접 쓰지 않았다 (`#`, `px` 검색). 토큰만.
- [ ] 상태 표시는 `StatusBadge`(또는 같은 규칙)로, `status_map`에 있는 표기만.
- [ ] 빈 상태·오류·불러오는 중 세 가지를 모두 그렸다.
- [ ] 키보드만으로 동작하고 포커스가 보인다. 아이콘 단추에 이름이 있다.
- [ ] 밝게/어둡게 둘 다 확인했다 (스크린샷 테스트는 M3부터).
- [ ] 문구가 §5와 용어집을 따른다.
- [ ] 웹: 브라우저로 토큰·비밀이 내려가지 않는다 (BFF).

## 8. 바꾸는 법

1. `design/tokens.json`을 고친다 (새 토큰은 이름 규칙 `<분류>.<이름>[.<변형>]`).
2. 생성기를 돌린다 (`uv run python scripts/gen_tokens.py`) → `server/web/packages/ui/src/tokens.css`, `shared/qt/…/theme/{tokens.py,theme-light.qss,theme-dark.qss}`, `design/preview.html`, BPM 흐름 마크(§6-1)가 바뀐다. **모두 생성물이니 직접 고치지 않는다.**
3. 명암비 검사가 통과해야 한다 (생성기가 §2의 기준으로 검사하고, 실패하면 **아무것도 쓰지 않고** 멈춘다). `--check`가 CI와 pytest에 들어 있다.
4. 이 문서의 표를 함께 고친다.
