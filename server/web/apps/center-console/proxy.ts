import { NextResponse, type NextRequest } from "next/server";
import { loginUrl } from "@/lib/next-path";

/**
 * 로그인 쿠키가 없는 화면 요청은 **가려던 곳을 실어** 로그인으로 보낸다 (U19, ADR-0162).
 *
 * 쿠키가 **있는지만** 본다 — 풀어 보는 것은 화면이 `session()`으로 한다(비밀 키를 여기에 끌어오지 않는다).
 * 쿠키 이름은 `lib/session.ts`의 `COOKIE_NAME`과 같다(그 파일은 `server-only`라 여기서 부르지 않는다).
 * 서버 액션(POST)은 건드리지 않는다 — 폼의 답을 돌려 버리면 그 자리의 오류 표시가 사라진다.
 */
const COOKIE_NAME = "chk_console_session";

export function proxy(request: NextRequest) {
  if (request.method !== "GET" || request.cookies.has(COOKIE_NAME)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(loginUrl(`${pathname}${search}`), request.url));
}

export const config = {
  // 로그인 화면·Next 자산·공개 파일(아이콘·글꼴·그림)은 빼고 화면만.
  matcher: ["/((?!login|_next/|icon|favicon|brand/|fonts/|.*\\.[a-z0-9]+$).*)"],
};
