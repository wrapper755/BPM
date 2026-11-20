/**
 * 시각·기간을 사람의 말로 — **한 자리다** (스타일 가이드 §5 「시각」·「기간」).
 *
 * 화면마다 제 `time()`을 두었더니 같은 시각이 「11-10 22:16」·「2026-11-10 22:16」·
 * 「2026. 11. 10. 오후 10:16:00」 셋으로 보였다. 화면은 여기 것만 쓴다.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** 오늘이면 시:분, 올해면 월-일 시:분, 다른 해면 연도까지. 못 읽는 값은 그대로 보인다. */
export function time(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (now.toDateString() === at.toDateString()) return clock;
  const day = `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock}`;
  return now.getFullYear() === at.getFullYear() ? day : `${at.getFullYear()}-${day}`;
}

/**
 * **연도까지** 적는 시각 — 배포 유효 기간처럼 「언제까지냐」가 요점인 자리에 쓴다.
 * 목록의 「언제 했나」는 `time()`이다 (올해가 아니면 그것도 연도를 붙인다).
 */
export function fullTime(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * 두 시각 사이(초) — 끝이 없으면 지금까지 (결재함 「기다린 시간」: 대기면 지금까지, 답했으면 답할 때까지).
 * 시작을 못 읽으면 `null`이다 (「—」로 보인다).
 */
export function between(from: string | null | undefined, to?: string | null, now: Date = new Date()): number | null {
  const start = from ? new Date(from).getTime() : NaN;
  if (Number.isNaN(start)) return null;
  const end = to ? new Date(to).getTime() : now.getTime();
  return Number.isNaN(end) ? null : Math.max(0, (end - start) / 1000);
}

/**
 * 걸린 시간(초) → 「0.4초」·「1분 20초」·「2시간 5분」·「1일 3시간」.
 *
 * 1분 아래는 소수 한 자리를 남긴다 — 0.1초에 끝나는 노드와 0초가 다르다. 그 위로는 큰 단위로 접는다
 * (「1298.3초」는 사람이 다시 나눠야 한다). 모르면 「—」다 (0과 다르다).
 */
export function took(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const value = Math.max(0, seconds);
  // 59.96초를 「60초」로 반올림하지 않게 경계를 반올림 자리에 맞춘다.
  if (value < 59.95) return `${Math.round(value * 10) / 10}초`;
  const whole = Math.round(value);
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return whole % 60 ? `${minutes}분 ${whole % 60}초` : `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
  return hours % 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간` : `${Math.floor(hours / 24)}일`;
}
