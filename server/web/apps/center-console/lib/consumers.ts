/**
 * CON-17 일꾼 (ADR-0137)이 같이 쓰는 것 — 화면을 모르는 함수만 둔다(vitest가 잰다).
 */

/** 「토픽 (한 줄에 하나)」 칸 → 토픽들. 쉼표로 적어도 받고, 빈 줄·겹친 것은 버린다. 모양은 Center가 본다. */
export function parseTopics(text: string): string[] {
  const seen = new Set<string>();
  for (const one of text.split(/[\n,]/)) {
    const topic = one.trim();
    if (topic) seen.add(topic);
  }
  return [...seen];
}

/** 「들어온 길」 — 「콘솔 · <만든 계정>」 / 「일꾼 폴더」 (C15 `ConsumerInfo.source`·`approved_by`). */
export function cameFrom(source: string | null | undefined, by: string | null | undefined): string {
  if (source === "folder") return "일꾼 폴더";
  return by ? `콘솔 · ${by}` : "콘솔";
}
