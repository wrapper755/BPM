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
  // 열린 모드에서 스스로 들어온 일꾼 — 「누가」가 사람이 아니다 (ADR-0142 §2).
  if (source === "open") return "열린 모드";
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

/** 「맡을 연결 앱」의 한 줄 — 토픽은 곧 연결 앱 id다 (CON-18, ADR-0138). */
export interface AppChoice {
  id: string;
  name: string;
  /** 「외부 정의」/「일꾼 앱」 (CON-18 「구현」) */
  impl: string;
  /** 「AI·API」처럼 이미 읽기 좋게 만든 것 */
  kinds: string;
  /** 그 앱을 맡은 일꾼 이름들 */
  workers: string[];
}

/** 맡는 토픽 = 체크한 연결 앱 + 「직접 적기」 — 겹침 없이, 체크한 것 먼저. */
export function pickTopics(checked: Array<FormDataEntryValue>, text: string): string[] {
  return [...new Set([...checked.map(String).filter(Boolean), ...parseTopics(text)])];
}

/** 편집 창을 채운다 — 목록에 있는 토픽은 체크로, 없는 것은 「직접 적기」로. */
export function splitTopics(topics: string[], choices: AppChoice[]): { checked: string[]; other: string[] } {
  const listed = new Set(choices.map((one) => one.id));
  return { checked: topics.filter((one) => listed.has(one)), other: topics.filter((one) => !listed.has(one)) };
}

/** 「맡을 연결 앱」 둘째 줄 — 「외부 정의 · API · 이미 맡은 일꾼 worker」. */
export function appChoiceLine(one: AppChoice): string {
  const held = one.workers.length ? `이미 맡은 일꾼 ${one.workers.join(", ")}` : "맡은 일꾼 없음";
  return [one.impl, one.kinds, held].join(" · ");
}
