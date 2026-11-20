/**
 * 위 막대의 아이콘 단추 — 정사각 36, `text-secondary` (ADR-0173). `Button`의 색·여백을 이겨야 해서 `!`로
 * 적는다(`cn`은 겹친 유틸리티를 가려 주지 않는다). 서버 틀(`Shell`)과 브라우저 단추(`Refresh`)가 함께 쓰므로
 * "use client" 밖의 파일에 둔다.
 */
export const BAR_BUTTON = "size-9 px-0! text-text-secondary! hover:text-text-primary!";
