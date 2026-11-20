/**
 * CON-20a·20c 프로젝트가 쓰는 셈 — **화면을 모르는 것만** 여기 둔다 (`pnpm test`가 잰다).
 */

/** 거르기 — 이름·id에 **치는 글자가 들어 있으면** 남긴다 (대소문자 가리지 않음, 앞뒤 빈칸은 버린다). */
export function filterProcesses<T extends { id: string; name: string }>(rows: T[], text: string): T[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((one) => one.id.toLowerCase().includes(needle) || one.name.toLowerCase().includes(needle));
}
