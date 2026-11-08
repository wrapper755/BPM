/**
 * CON-17 일꾼 (ADR-0137)이 같이 쓰는 것 — 화면을 모르는 함수만 둔다(vitest가 잰다).
 */
import { TASK_KIND } from "./summary";

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

/** 일꾼의 종류 — 체크박스 셋의 차례이기도 하다 (C15 `ConsumerKind`, ADR-0139). */
export const CONSUMER_KINDS = ["ai", "api", "rpa"] as const;

/** 정하지 않은 일꾼의 「종류」 툴팁 (화면 문서). */
export const KINDS_UNSET = "모든 종류의 일감을 가져갑니다. 「편집...」에서 정하세요.";

/** 체크박스 → 종류들. 모르는 값은 버린다(Center도 거절한다). */
export function parseKinds(values: Array<FormDataEntryValue>): string[] {
  const picked = new Set(values.map(String));
  return CONSUMER_KINDS.filter((kind) => picked.has(kind));
}

/** 「종류」 — 이 일꾼의 종류를 「AI·API·RPA」 순으로 (C15 `ConsumerInfo.kinds`). 정하지 않았으면 「정하지 않음」. */
export function kindsLabel(kinds: string[] | null | undefined): string {
  if (!kinds || kinds.length === 0) return "정하지 않음";
  const known: readonly string[] = CONSUMER_KINDS;
  const rank = (kind: string) => (known.includes(kind) ? known.indexOf(kind) : known.length);
  return [...new Set(kinds)]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((kind) => TASK_KIND[kind] ?? kind)
    .join("·");
}

/**
 * 어긋남 — 맡은 토픽에 이 일꾼이 맡지 않는 종류의 작업이 있으면 토픽마다 한 줄 (C15 `topic_kinds`, ADR-0139).
 * 정하지 않은 일꾼은 모두 가져가므로 어긋남이 없다. 없으면 빈 목록.
 */
export function kindMismatches(
  kinds: string[] | null | undefined,
  topicKinds: Record<string, string[]> | null | undefined,
): string[] {
  if (!kinds || kinds.length === 0) return [];
  const held = new Set(kinds);
  return Object.entries(topicKinds ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([topic, some]) => {
      const missing = some.filter((kind) => !held.has(kind)).map((kind) => TASK_KIND[kind] ?? kind);
      if (missing.length === 0) return [];
      const said = missing.join("·");
      return [`${topic}은 ${said} 작업이 있는데 이 일꾼은 ${said}를 맡지 않습니다 — 그 일감을 가져가지 않습니다.`];
    });
}
