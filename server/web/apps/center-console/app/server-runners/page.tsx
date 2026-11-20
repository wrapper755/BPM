import { redirect } from "next/navigation";
import { session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { ServerRunners } from "@/components/ServerRunners";

/** CON-12 목록 — 메뉴 「시스템 › 서버 실행기」 (ADR-0172·0181). 실행기 표·「승인 대기」·Center 대기열. */
export default async function ServerRunnersPage() {
  const found = await session();
  if (!found) redirect("/login");

  return (
    <Shell mode={found.mode} actor={found.actor} current="/server-runners">
      <ServerRunners admin={found.mode === "admin"} />
    </Shell>
  );
}
