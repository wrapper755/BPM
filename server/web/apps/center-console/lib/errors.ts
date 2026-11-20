import type { ErrorBody } from "@bpm/api-types/c5-error-body";

/**
 * Center의 오류를 **사람 말로** (H2, [ADR-0162](../../../../../docs/decisions/0162-usability-heuristics-review.md)).
 *
 * 닿았지만 일을 못 한 까닭이 **사람이 고칠 것이 아닌** 답(401·403·404·5xx)은 콘솔이 「무엇이 + 무엇을 하면
 * 되는지」로 말하고, Center의 원문은 **둘째 줄**에 싣는다 — `ErrorBanner`가 그 줄을 「상세 보기」에 접는다.
 * 409·422처럼 **업무 사유가 담긴 답은 Center의 글 그대로**다(콘솔이 사유를 지어내지 않는다).
 */
export function humanMessage(status: number, body: ErrorBody | null): string {
  const raw = body?.message ?? "";
  const said = [raw, body?.code].filter(Boolean).join(" · ");
  const human =
    status === 401
      ? "로그인이 끝났습니다. 다시 로그인하세요."
      : status === 403
        ? "이 일을 할 권한이 없습니다. 권한이 있는 계정으로 들어오세요."
        : status === 404
          ? "찾을 수 없습니다. 지워졌거나 주소가 틀렸습니다 — 목록에서 다시 고르세요."
          : status >= 500
            ? `Center가 일을 마치지 못했습니다 (${status}). 잠시 뒤 다시 하고, 되풀이되면 관리자에게 알려 주세요.`
            : null;
  if (human === null) return raw || `Center가 ${status}를 돌려줬습니다`;
  return said ? `${human}\nCenter: ${said}` : human;
}
