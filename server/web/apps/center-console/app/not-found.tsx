import Link from "next/link";
import { EmptyState } from "@bpm/ui";
import { Shell } from "@/components/Shell";
import { session } from "@/lib/center";

/**
 * 없는 주소 (H3·H9, ADR-0162) — Next 기본 화면은 영문에 **틀도 돌아갈 길도 없었다**. 틀 안에서
 * 「무엇이 + 무엇을 하면 되는지」로 말하고 대시보드로 가는 길을 둔다.
 */
export default async function NotFound() {
  const found = await session();
  const body = (
    <EmptyState
      title="찾을 수 없는 화면입니다"
      hint="주소가 틀렸거나 지워진 것입니다. 메뉴에서 다시 고르세요."
      action={
        <Link href={found ? "/dashboard" : "/login"} className="text-primary underline">
          {found ? "대시보드로" : "로그인으로"}
        </Link>
      }
    />
  );
  if (!found) return <main className="mx-auto w-full max-w-[640px] px-4 py-16">{body}</main>;
  return (
    <Shell mode={found.mode} actor={found.actor} current="">
      {body}
    </Shell>
  );
}
