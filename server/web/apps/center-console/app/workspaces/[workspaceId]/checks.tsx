"use client";

import { Button, StatusBadge } from "@bpm/ui";
import type { CheckResponse } from "@bpm/api-types/c17-check-response";
import { blocks, checking, counts, sorted, summary } from "@/lib/checks";
import { fullTime } from "@/lib/time";

/**
 * CON-20 아래 탭 「검사」 — 실행 전 검사의 결과 (C17 §실행 전 검사).
 *
 * **지금 보고 있는 그림에 대한 말이라 캔버스와 함께 보인다** (ADR-0147 — 탭이 아니라 아래 탭인
 * 까닭). 줄마다 「<규칙> — <무엇이> — <어디서>」이고 **캔버스가 아는 이름은 누르면 그 노드를
 * 고른다** — 아는지는 캔버스에게 묻는다(`select()`가 찾지 못하면 거짓을 준다). 이름이 노드인지
 * 식인지 파일인지를 여기서 어림하지 않는다.
 */
export function Checks({
  check,
  none,
  busy,
  onCheck,
  onPick,
}: {
  check: CheckResponse | null;
  /** 이 묶음을 아직 검사한 적이 없다 (404) — 「흠이 없다」와 다른 말이다. */
  none: boolean;
  busy: boolean;
  onCheck: (again: boolean) => void;
  /** 그 이름의 노드를 캔버스에서 고른다. 캔버스가 모르면 거짓 — 그러면 누를 수 없는 글자다. */
  onPick: (id: string) => boolean;
}) {
  const violations = sorted(check?.violations ?? []);
  const { errors } = counts(check?.violations ?? []);

  return (
    <div className="max-h-72 overflow-y-auto border-t border-border-default p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-body-sm">{none ? "아직 검사하지 않았습니다." : summary(check)}</span>
        {check?.cached && check.checked_at ? (
          // **언제 것인지 말한다** (U8) — 담아 둔 결과를 지금 것처럼 보이면 고친 흠이 남아 보인다.
          <span className="text-caption text-text-muted">{fullTime(check.checked_at)}에 검사한 결과입니다.</span>
        ) : null}
        {check?.reason ? <span className="text-caption text-status-failed-fg">{check.reason}</span> : null}
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          onClick={() => onCheck(Boolean(check?.cached))}
          // 도는 동안 막는다 — 누르면 `again`이라 **도는 검사를 버리고 다시** 묻게 된다.
          disabled={busy || checking(check)}
        >
          {check?.cached ? "다시 검사" : "실행 전 검사"}
        </Button>
      </div>

      {violations.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {violations.map((one, at) => (
            <li key={`${one.rule}-${at}`} className="flex flex-wrap items-baseline gap-2 text-body-sm">
              <StatusBadge group="사전 점검" label={blocks(one) ? "실행 불가" : "경고"} />
              <span className="font-mono text-caption text-text-muted">{one.rule}</span>
              <span>{one.message}</span>
              {(one.items ?? []).map((item) => (
                <Where key={item} name={item} onPick={onPick} />
              ))}
            </li>
          ))}
        </ul>
      )}

      {errors > 0 ? (
        <p className="mt-2 text-caption text-text-muted">
          오류가 있으면 돌릴 수 없습니다. 경고는 보이기만 하고 사람이 판단합니다.
        </p>
      ) : null}
    </div>
  );
}

/** 걸린 항목 하나 — 캔버스가 아는 이름이면 누를 수 있다. */
function Where({ name, onPick }: { name: string; onPick: (id: string) => boolean }) {
  return (
    <button
      onClick={() => onPick(name)}
      title="캔버스에서 찾습니다"
      className="rounded-md bg-bg-subtle px-1 font-mono text-caption hover:bg-primary-subtle"
    >
      {name}
    </button>
  );
}
