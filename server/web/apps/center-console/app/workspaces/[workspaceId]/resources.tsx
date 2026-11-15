"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ErrorBanner, Field } from "@bpm/ui";
import type { TaskSpec } from "@bpm/bpmn-canvas";
import type { InstalledLibInfo } from "@bpm/api-types/c17-workspace-info";
import type { PackageInfo } from "@bpm/api-types/c5-package-info";
import type { ServiceAppResource } from "@bpm/api-types/c7-service-app-resource";

import { loadWorkspaceResources } from "@/app/actions";
import { resourceRoots, type ResourceRow } from "@/lib/resources";

/**
 * CON-20b 탐색기의 **「리소스」 탭** — 부를 수 있는 것을 고른다
 * ([ADR-0155](../../../../../../docs/decisions/0155-resources-are-a-tab-in-the-explorer.md)).
 *
 * **만드는 몸짓은 둘이고 결과는 같다** — 캔버스로 **끌어다 놓거나** 줄의 「+」를 누른다.
 * 둘 다 `CanvasEditor.createTask` 하나를 불러 **실행 취소가 한 걸음**이다 (ADR-0044의 결).
 *
 * 줄을 세우고 끄는 판정은 **화면을 모르는 `lib/resources.ts`**에 있다 — `pnpm test`가 잰다.
 */

/** 끌고 가는 짐의 이름 — **우리 것만 받는다**. bpmn-js 제 팔레트의 드래그를 살려 둔다 (ADR-0044). */
export const RESOURCE_MIME = "application/x-bpm-resource";

export function ResourcePanel({
  libs,
  canWrite,
  onAdd,
}: {
  libs: InstalledLibInfo[];
  canWrite: boolean;
  /** 「+」를 눌렀을 때 — 자리를 주지 않으니 캔버스가 보이는 곳의 빈 자리에 만든다. */
  onAdd: (spec: TaskSpec) => void;
}) {
  const [shared, setShared] = useState<PackageInfo[]>([]);
  const [apps, setApps] = useState<ServiceAppResource[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState(false);

  // **들고 있지 않는다** — 탭을 처음 열 때 한 번 읽고, 닿지 못하면 그 자리에서 까닭을 말한다.
  useEffect(() => {
    void (async () => {
      const found = await loadWorkspaceResources();
      setShared(found.shared);
      setApps(found.apps);
      setErrors(found.errors);
      setAsked(true);
    })();
  }, []);

  const roots = useMemo(() => resourceRoots(shared, apps, libs, query), [shared, apps, libs, query]);

  return (
    <>
      <Field
        label="찾기"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="이름이나 id"
      />

      {errors.map((one) => (
        <div key={one} className="mt-2">
          <ErrorBanner message={one} />
        </div>
      ))}

      {roots.map((root) => (
        <section key={root.label} className="mt-4">
          <h3 className="mb-1 text-caption font-semibold text-text-muted">{root.label}</h3>
          {root.rows.length === 0 ? (
            <p className="text-caption text-text-muted">{asked ? root.empty : "읽는 중..."}</p>
          ) : (
            <ul>
              {root.rows.map((row) => (
                <li key={row.key}>
                  <Line row={row} canWrite={canWrite} onAdd={onAdd} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

/** 줄 하나 — 묶음 머리이거나 고를 수 있는 것이다. **만들 것이 없는 줄은 끌리지 않는다.** */
function Line({
  row,
  canWrite,
  onAdd,
}: {
  row: ResourceRow;
  canWrite: boolean;
  onAdd: (spec: TaskSpec) => void;
}) {
  if (row.kind === "group") {
    return (
      <p className="mt-2 flex items-baseline gap-1 px-2 text-caption font-semibold text-text-secondary">
        <span className="min-w-0 truncate">{row.label}</span>
        {row.note ? <span className="shrink-0 font-normal text-text-muted">· {row.note}</span> : null}
      </p>
    );
  }

  const makes = canWrite ? row.spec : undefined;
  return (
    <div
      // 끌 수 있는 것은 **만들 것이 있는 줄**뿐이다. 짐에는 만들라는 말(`TaskSpec`)을 그대로 싣는다.
      draggable={Boolean(makes)}
      onDragStart={(event) => {
        if (!makes) return;
        event.dataTransfer.setData(RESOURCE_MIME, JSON.stringify(makes));
        event.dataTransfer.effectAllowed = "copy";
      }}
      title={row.blocked ?? (makes ? "캔버스로 끌어다 놓거나 「+」를 누르세요" : undefined)}
      className={
        row.blocked
          ? "flex items-center gap-1 rounded-md px-2 py-1 text-text-muted"
          : "group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-bg-subtle"
      }
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm">{row.label}</span>
        {row.note ? <span className="block truncate text-caption text-text-muted">{row.note}</span> : null}
      </span>
      {makes ? (
        <button
          type="button"
          onClick={() => onAdd(makes)}
          aria-label={`${row.label} — 캔버스에 추가`}
          title="캔버스에 추가"
          className="shrink-0 rounded-md p-1 opacity-0 hover:bg-bg-surface focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus size={16} aria-hidden />
        </button>
      ) : null}
      {row.blocked ? <span className="shrink-0 text-caption">잠김</span> : null}
    </div>
  );
}
