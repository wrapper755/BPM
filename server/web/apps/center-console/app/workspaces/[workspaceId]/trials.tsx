"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Dialog, EmptyState, ErrorBanner, StatusBadge } from "@bpm/ui";
import type { TrialInfo } from "@bpm/api-types/c17-test-run-info";
import { loadWorkspaceFile, startTrial } from "@/app/actions";
import { parseCases } from "@/lib/cases";
import { caseFilePath, caseLabel, elapsed, isLive, modeLabel, stateLabel } from "@/lib/trials";
import { time } from "@/lib/time";

/**
 * CON-20 「시험 실행」 — 돌려 보기 창과 목록·상세 (STU-08·STU-09가 하던 일).
 *
 * **돌리는 것은 서버 실행기다** (ADR-0143 §3) — 여기서 하는 일은 줄에 세우고(C17
 * `POST …/test-runs`) 되묻는 것뿐이다. 진행은 실행기가 Center에 올리고(`PUT …/test-runs/{id}`)
 * 콘솔로 미는 길이 없다.
 */

// ─────────────────────────── 돌려 보기 창 ───────────────────────────

/**
 * 머리 띠의 「시험 실행...」 — 케이스와 수행 모드를 묻는다.
 *
 * **케이스는 진입 정의 옆의 파일에서만** 온다 (`cases/<이름>.cases.json`) — 엔진이 그 자리만
 * 보기 때문이다. 다른 정의의 케이스를 올리면 고를 수는 있는데 돌릴 때 「케이스가 없다」가 된다.
 */
export function StartTrial({
  workspaceId,
  entry,
  onStarted,
}: {
  workspaceId: string;
  entry: string | null | undefined;
  onStarted: (trial: TrialInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [mode, setMode] = useState("autonomous");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const path = caseFilePath(entry);

  // 창을 열 때 케이스 파일을 읽는다 — 늘 들고 있으면 고치는 동안 낡는다.
  useEffect(() => {
    if (!open || !path) {
      if (open) setCases([]);
      return;
    }
    let alive = true;
    void (async () => {
      const found = await loadWorkspaceFile(workspaceId, path);
      if (!alive) return;
      // 케이스 파일이 없는 것은 흠이 아니다 — 비교하지 않고 그냥 돌려 보는 자리가 있다.
      const read = found.text ? parseCases(found.text) : { file: undefined };
      setCases((read.file?.cases ?? []).map((one) => one.name));
    })();
    return () => {
      alive = false;
    };
  }, [open, path, workspaceId]);

  const run = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    const made = await startTrial(workspaceId, chosen, mode);
    setBusy(false);
    if (made.error || !made.trial) {
      setFailure(made.error ?? "시험 실행을 만들지 못했습니다");
      return;
    }
    setOpen(false);
    onStarted(made.trial);
  }, [chosen, mode, onStarted, workspaceId]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        시험 실행...
      </Button>
      <Dialog
        open={open}
        title="돌려 봅니다"
        description="서버 실행기가 그 자리에서 돌립니다 — 배포도 승인도 하지 않습니다."
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              그만두기
            </Button>
            <Button variant="primary" onClick={() => void run()} disabled={busy}>
              돌리기
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {failure ? <ErrorBanner message={failure} /> : null}
          {!entry ? (
            <p className="text-body-sm text-text-muted">
              진입 정의를 먼저 고르세요 — 「정보」 탭에서 고릅니다.
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-body-sm">
            케이스
            <select
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
            >
              <option value="">비교 안 함 (그냥 돌려 보기)</option>
              {(cases ?? []).map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
            <span className="text-caption text-text-muted">
              {path
                ? `${path}의 케이스입니다. 케이스가 적어 둔 답으로 결재·확인이 그 자리에서 끝납니다.`
                : "진입 정의가 없어 고를 케이스가 없습니다."}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-body-sm">
            수행 모드
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="rounded-md border border-border-default bg-bg-surface px-2 py-1 text-body-sm"
            >
              <option value="autonomous">자율 수행</option>
              <option value="deterministic">결정 수행</option>
            </select>
            <span className="text-caption text-text-muted">
              자율 수행은 모델이 길을 고르고 배운 것을 남깁니다. 결정 수행은 배운 것을 되밟습니다.
            </span>
          </label>
        </div>
      </Dialog>
    </>
  );
}

// ─────────────────────────── 목록과 상세 ───────────────────────────

export function TrialRuns({
  trials,
  picked,
  onPick,
}: {
  trials: TrialInfo[];
  picked: TrialInfo | null;
  onPick: (trial: TrialInfo) => void;
}) {
  if (trials.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="돌려 본 적이 없습니다"
          hint="머리 띠의 「시험 실행...」으로 지금 그림을 돌려 봅니다. 배포도 승인도 하지 않습니다."
        />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1">
      <ul aria-label="시험 실행" className="w-80 shrink-0 overflow-y-auto border-r border-border-default">
        {trials.map((one) => (
          <li key={one.run_id}>
            <button
              onClick={() => onPick(one)}
              aria-current={picked?.run_id === one.run_id ? "true" : undefined}
              className={
                picked?.run_id === one.run_id
                  ? "w-full border-b border-border-default bg-primary-subtle px-3 py-2 text-left"
                  : "w-full border-b border-border-default px-3 py-2 text-left hover:bg-bg-subtle"
              }
            >
              <div className="flex items-center gap-2">
                <StatusBadge group="시험 실행" label={stateLabel(one.state)} />
                {one.verdict ? <StatusBadge group="시험 판정" label={one.verdict} /> : null}
              </div>
              <div className="mt-1 text-body-sm">
                {caseLabel(one)} · {modeLabel(one.mode)}
              </div>
              <div className="text-caption text-text-muted">
                {time(one.requested_at)} · {elapsed(one)}
                {one.learned ? ` · 배운 것 ${one.learned}개` : ""}
              </div>
              <div className="font-mono text-caption break-all text-text-muted">{one.run_id}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {picked ? <TrialDetail trial={picked} /> : <p className="text-body-sm text-text-muted">왼쪽에서 하나를 고르세요.</p>}
      </div>
    </div>
  );
}

function TrialDetail({ trial }: { trial: TrialInfo }) {
  const variables = Object.entries(trial.variables ?? {});
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge group="시험 실행" label={stateLabel(trial.state)} />
        {trial.verdict ? <StatusBadge group="시험 판정" label={trial.verdict} /> : null}
        <span className="text-body-sm text-text-muted">
          {caseLabel(trial)} · {modeLabel(trial.mode)} · {elapsed(trial)}
        </span>
      </div>
      {trial.detail ? <p className="text-body-sm">{trial.detail}</p> : null}

      <section>
        <h3 className="mb-1 text-caption font-semibold text-text-muted">로그</h3>
        <TrialLog lines={trial.log ?? []} />
      </section>

      <section>
        <h3 className="mb-1 text-caption font-semibold text-text-muted">변수</h3>
        {variables.length === 0 ? (
          <p className="text-body-sm text-text-muted">아직 없습니다.</p>
        ) : (
          // **키만 보이고 펼쳐야 값이다** (U10) — 업무 값이라 어깨너머로 읽히지 않게.
          <ul className="flex flex-col gap-1">
            {variables.map(([name, value]) => (
              <li key={name}>
                <details>
                  <summary className="cursor-pointer font-mono text-body-sm">{name}</summary>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-bg-subtle p-2 text-caption">
                    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-caption font-semibold text-text-muted">노드 색</h3>
        <p className="text-body-sm text-text-muted">
          {Object.keys(trial.node_states ?? {}).length === 0
            ? "아직 없습니다."
            : "「설계」 탭의 캔버스에 그대로 입혔습니다."}
        </p>
      </section>
    </div>
  );
}

/** 로그 — 그 자리에서 쌓이므로 **아래로 붙는다** (사람이 끌어 올리면 거기 머문다). */
export function TrialLog({ lines }: { lines: string[] }) {
  if (lines.length === 0) {
    return <p className="text-body-sm text-text-muted">아직 없습니다.</p>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-bg-subtle p-2 font-mono text-caption whitespace-pre-wrap">
      {lines.join("\n")}
    </pre>
  );
}

/** 「중지」 — 도는 동안에만 보인다 (U5). **판정하지 않는다**: 판정이 「중지」다. */
export function StopTrial({ onStop, busy }: { onStop: () => void; busy: boolean }) {
  return (
    <Button variant="secondary" size="sm" onClick={onStop} disabled={busy}>
      중지
    </Button>
  );
}

/** 지금 도는 실행이 있는가 — 머리 띠가 「시험 실행...」과 「중지」를 가른다. */
export function liveTrial(trial: TrialInfo | null): boolean {
  return trial !== null && isLive(trial.state);
}
