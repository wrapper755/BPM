/**
 * 위 막대의 글자 단추 — 묶음과 같은 14·보통 굵기·`text-secondary`다 (ADR-0166·0167). `Button`의 중간 굵기를
 * 이겨야 해서 `!`로 적는다(`cn`은 겹친 유틸리티를 가려 주지 않는다). 서버 틀(`Shell`)과 브라우저 단추(`Refresh`)가
 * 함께 쓰므로 "use client" 밖의 파일에 둔다.
 */
export const BAR_BUTTON =
  "px-2 text-body! font-normal! text-text-secondary! hover:text-text-primary! sm:px-3";
