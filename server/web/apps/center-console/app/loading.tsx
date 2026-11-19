import { Shell } from "@/components/Shell";
import { session } from "@/lib/center";

/**
 * 읽는 중 (U18, [ADR-0162](../../../../../docs/decisions/0162-usability-heuristics-review.md)) — 화면을 여는 데
 * 1~8초가 걸리는데 그동안 아무 표시가 없어 다시 눌렀다. **틀은 그대로 두고** 본문 자리에 뼈대를 그린다.
 *
 * 틀(`Shell`)은 화면마다 그리므로 여기서도 같은 것을 그린다 — 지금 자리는 아직 모르니 비워 둔다.
 * 로그인 전이면(로그인 화면으로 가는 중) 뼈대만 그린다.
 */
export default async function Loading() {
  const found = await session();
  const body = <Skeleton />;
  if (!found) return <main className="mx-auto w-full max-w-[1440px] px-4 py-8">{body}</main>;
  return (
    <Shell mode={found.mode} actor={found.actor} current="">
      {body}
    </Shell>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-live="polite" className="flex animate-pulse flex-col gap-4">
      <span className="sr-only">읽는 중입니다</span>
      <div aria-hidden className="h-7 w-48 rounded-md bg-bg-subtle" />
      <div aria-hidden className="h-20 rounded-lg bg-bg-surface shadow-sm" />
      {[0, 1, 2, 3, 4].map((at) => (
        <div key={at} aria-hidden className="h-12 rounded-lg bg-bg-surface shadow-sm" />
      ))}
    </div>
  );
}
