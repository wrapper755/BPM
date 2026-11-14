import { redirect } from "next/navigation";
import { session } from "@/lib/center";

/**
 * 첫 화면 — **설계할 수 있는 사람은 작업공간 홈**, 보기 전용은 운영 현황이다
 * ([ADR-0145](../../../../docs/decisions/0145-console-is-workspace-shaped.md) §2).
 *
 * 설계할 것이 없는 사람에게 설계 홈을 보이지 않는다. 쓰기 권한이 곧 설계 권한이다 — 역할을
 * 가르는 일은 보안을 조일 때 함께 본다 (`docs/09-gaps.md` §3-33).
 */
export default async function Home() {
  const found = await session();
  redirect(found?.mode === "admin" ? "/workspaces" : "/bots");
}
