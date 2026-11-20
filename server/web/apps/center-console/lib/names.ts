import "server-only";

import { center } from "@/lib/center";

/**
 * 목록에 id 대신 보일 **이름** (U2, [ADR-0165](../../../../../docs/decisions/0165-lists-filter-as-you-go-and-page.md)).
 * **못 받아도 목록은 그린다** — 빈 표면 부르는 쪽이 id 그대로 보인다.
 */

/** BPM 프로세스 이름표 (C5 `PackageInfo.name`) — 열쇠는 `<id>@<version>`. 실행 기록·결재에는 id만 있다. */
export async function loadProcessNames(): Promise<Map<string, string>> {
  try {
    const found = await center.packages({ kind: "bpm_process" });
    return new Map(found.flatMap((one) => (one.name ? [[`${one.id}@${one.version}`, one.name] as const] : [])));
  } catch {
    return new Map();
  }
}

/**
 * 그림의 노드 이름 (C5 `GET …/nodes`) — 열쇠는 `<id>@<version>#<node_id>`. 판마다 **한 번만** 묻는다
 * (결재함은 같은 판의 결재가 여럿이다). 이름이 없는 노드는 빠진다.
 */
export async function loadNodeNames(versions: Array<[string, string]>): Promise<Map<string, string>> {
  const wanted = [...new Set(versions.map(([id, version]) => `${id}@${version}`))];
  const found = await Promise.all(
    wanted.map(async (key) => {
      const [id, version] = [key.slice(0, key.lastIndexOf("@")), key.slice(key.lastIndexOf("@") + 1)];
      try {
        const nodes = await center.packageNodes(id, version);
        return nodes.flatMap((node) => (node.name ? [[`${key}#${node.id}`, node.name] as const] : []));
      } catch {
        return [];
      }
    }),
  );
  return new Map(found.flat());
}
