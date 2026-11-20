import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { InstalledLibInfo } from "@bpm/api-types/c17-workspace-info";
import type { ServiceAppResource } from "@bpm/api-types/c7-service-app-resource";
import type { TaskSpec } from "@bpm/bpmn-canvas";

/**
 * CON-20b 「리소스」 탭이 그릴 줄들 — **화면을 모른다** ([ADR-0155](../../../../docs/decisions/0155-resources-are-a-tab-in-the-explorer.md)).
 *
 * 세는 자리를 페이지에 두면 `pnpm test`가 재지 못한다 (CLAUDE.md §짓고 검사하기) — 그래서
 * 「무엇이 줄이 되고, 무엇이 꺼지고, 그 줄이 어떤 노드를 만드는가」가 여기 있다.
 */

/** 묶음 머리(패키지·앱)이거나 고를 수 있는 줄 하나다. */
export interface ResourceRow {
  /** React 열쇠이자 시험이 짚는 이름. 뿌리마다 겹치지 않는다. */
  key: string;
  kind: "group" | "item";
  label: string;
  /** 줄 아래의 작은 글 — 설명이나 id. */
  note?: string;
  /** 꺼진 줄의 까닭 (말풍선). 있으면 끌 수도 누를 수도 없다. */
  blocked?: string;
  /** 이 줄이 만드는 노드. 묶음 머리와 꺼진 줄에는 없다 — **만들 것이 없는 줄은 끌리지 않는다**. */
  spec?: TaskSpec;
}

export interface ResourceRoot {
  label: string;
  rows: ResourceRow[];
  /** 줄이 하나도 없을 때 할 말 (U12). */
  empty: string;
}

const hit = (query: string, ...parts: Array<string | null | undefined>): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((one) => (one ?? "").toLowerCase().includes(needle));
};

/**
 * 공유 프로세스 뿌리 — C5 `process_lib` 패키지마다 머리 하나와 `provides.processes`의 정의들.
 *
 * **설치되지 않은 판의 줄은 끈다** ([ADR-0051](../../../../docs/decisions/0051-shared-process-conveniences.md)) —
 * 멤버십은 Center 목록 그대로이고 설치 여부만 줄에 덧붙인다. 설치되지 않은 호출은 B14가 막는다.
 */
export function sharedRows(
  packages: PackageInfo[],
  libs: InstalledLibInfo[],
  query = "",
): ResourceRow[] {
  const installed = new Set(libs.map((one) => `${one.id}@${one.version}`));
  const rows: ResourceRow[] = [];
  for (const one of packages) {
    const defs = one.manifest?.provides?.processes ?? [];
    const here = installed.has(`${one.id}@${one.version}`);
    const mine = defs.filter((def) => hit(query, def.name, def.process_id, one.name, one.id));
    if (!mine.length) continue;
    rows.push({
      key: `pkg:${one.id}@${one.version}`,
      kind: "group",
      label: `${one.name ?? one.id} v${one.version}`,
      note: here ? undefined : "설치 안 됨",
    });
    for (const def of mine) {
      rows.push({
        key: `proc:${one.id}@${one.version}:${def.process_id}`,
        kind: "item",
        label: def.name ?? def.process_id,
        note: def.process_id,
        blocked: here ? undefined : "「정보」 탭에서 설치해야 부를 수 있습니다",
        spec: here
          ? {
              bpmn: "bpmn:CallActivity",
              name: def.name ?? def.process_id,
              attrs: { calledElement: def.process_id },
            }
          : undefined,
      });
    }
  }
  return rows;
}

/**
 * 서비스 앱 뿌리 — C7의 앱마다 머리 하나와 그 `operations`.
 *
 * **입력·출력 짝은 짓지 않는다** (ADR-0155) — 내 변수 이름을 알아야 하는 일이라 지어내지 않는다.
 */
export function appRows(apps: ServiceAppResource[], query = ""): ResourceRow[] {
  const rows: ResourceRow[] = [];
  for (const app of apps) {
    const operations = app.operations ?? [];
    const mine = operations.filter((one) =>
      hit(query, one.name, one.description, app.name, app.app_id),
    );
    if (!mine.length) continue;
    rows.push({ key: `app:${app.app_id}`, kind: "group", label: app.name ?? app.app_id, note: app.app_id });
    for (const one of mine) {
      rows.push({
        key: `op:${app.app_id}:${one.name}`,
        kind: "item",
        label: one.name,
        note: one.description ?? undefined,
        spec: {
          bpmn: "bpmn:ServiceTask",
          name: one.name,
          bpm: { serviceCall: JSON.stringify({ app_id: app.app_id, operation: one.name }) },
        },
      });
    }
  }
  return rows;
}

/** 뿌리 둘 — 확장이 기여한 자원의 뿌리는 **두지 않는다** (깔린 확장이 없다, ADR-0114). */
export function resourceRoots(
  packages: PackageInfo[],
  apps: ServiceAppResource[],
  libs: InstalledLibInfo[],
  query = "",
): ResourceRoot[] {
  return [
    {
      label: "공유 프로세스",
      rows: sharedRows(packages, libs, query),
      empty: query ? "찾는 것이 없습니다." : "공유 프로세스가 없습니다 — CON-06에서 옵니다.",
    },
    {
      label: "서비스 앱",
      rows: appRows(apps, query),
      empty: query ? "찾는 것이 없습니다." : "서비스 앱이 없습니다 — CON-18에서 옵니다.",
    },
  ];
}

/** 칸에 띄울 고를 거리 하나 — `value`가 칸에 들어가고 `label`은 옆에 보이는 이름이다. */
export interface Suggestion {
  value: string;
  label?: string;
}

export interface ServiceCallHints {
  apps: Suggestion[];
  operations: Suggestion[];
  /** 적은 값이 등록된 것에 없을 때의 한 줄. 막지 않는다 — 검사는 쓰기를 막지 않는다 (C17). */
  appWarning?: string;
  operationWarning?: string;
}

/**
 * 서비스 앱 태스크(`bpm:serviceCall`)의 `app_id`·`operation` 칸에 띄울 거리 — 「리소스」 탭과
 * **같은 목록**(C7 서비스 앱)에서 온다. 손으로 친 오타를 실행 전 검사까지 가서야 알지 않게.
 *
 * **목록이 비면 아무 말도 하지 않는다** — 못 읽은 것(또는 아직 등록된 앱이 없는 것)을 「없는 앱」으로
 * 단정하면 멀쩡한 그림에 경고가 붙는다. 칸이 비어 있을 때도 말하지 않는다 (필수는 검사가 본다).
 */
export function serviceCallHints(apps: ServiceAppResource[], appId: string, operation: string): ServiceCallHints {
  const found = apps.find((one) => one.app_id === appId.trim());
  const operations = (found?.operations ?? []).map((one) => ({
    value: one.name,
    label: one.description ?? undefined,
  }));
  const hints: ServiceCallHints = {
    apps: apps.map((one) => ({ value: one.app_id, label: one.name ?? undefined })),
    operations,
  };
  if (apps.length > 0 && appId.trim() && !found) {
    hints.appWarning = `등록된 서비스 앱에 「${appId.trim()}」이 없습니다.`;
  }
  if (found && operations.length > 0 && operation.trim() && !operations.some((one) => one.value === operation.trim())) {
    hints.operationWarning = `「${found.app_id}」에 「${operation.trim()}」 작업이 없습니다.`;
  }
  return hints;
}
