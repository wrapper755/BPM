/** Center 오류를 사람 말로 (`lib/errors.ts`, ADR-0162 H2). */
import { describe, expect, it } from "vitest";
import { humanMessage } from "./errors";

describe("humanMessage", () => {
  it("404는 콘솔이 말하고 Center 원문은 둘째 줄에 싣는다 (「상세 보기」로 접힌다)", () => {
    const said = humanMessage(404, { code: "not_found", message: "그 실행 기록이 없다: run_x" });
    const [summary, detail] = said.split("\n");
    expect(summary).toContain("찾을 수 없습니다");
    expect(detail).toBe("Center: 그 실행 기록이 없다: run_x · not_found");
  });

  it("업무 사유가 담긴 409·422는 Center의 글 그대로다 — 사유를 지어내지 않는다", () => {
    expect(humanMessage(409, { code: "in_use", message: "배포가 쓰고 있습니다" })).toBe("배포가 쓰고 있습니다");
    expect(humanMessage(422, null)).toBe("Center가 422를 돌려줬습니다");
  });

  it("5xx는 번호를 남기고, 본문이 없으면 둘째 줄도 없다", () => {
    const said = humanMessage(503, null);
    expect(said).toContain("(503)");
    expect(said).not.toContain("\n");
  });

  it("401·403은 다음에 할 일을 말한다", () => {
    expect(humanMessage(401, null)).toContain("다시 로그인하세요");
    expect(humanMessage(403, null)).toContain("권한");
  });
});
