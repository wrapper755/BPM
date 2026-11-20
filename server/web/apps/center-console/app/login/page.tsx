import { AppTile } from "@bpm/ui";
import { safeNext } from "@/lib/next-path";
import { LoginForm } from "./form";

/**
 * 로그인 (CON-00). **관리자 계정**으로 들어온다 (ADR-0090) — 역할은 계정이 정한다.
 *
 * **따뜻한 바탕 가운데 카드 하나다** ([ADR-0161](../../../../../../docs/decisions/0161-soft-cards.md) — 화면 폭 띠와
 * 배경 그림을 내렸다). 좁은 화면에서는 여백 16을 두고 카드가 폭 전체를 쓴다.
 *
 * 가려던 곳(`next`)이 있으면 폼에 실어 로그인 뒤 그리로 간다 (U19, ADR-0162).
 *
 * 세션 토큰은 **콘솔 서버가 암호화된 httpOnly 쿠키에 담아 들고** 브라우저에 내려가지 않는다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; next?: string }>;
}) {
  const { changed, next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-xl border border-border-default bg-bg-surface p-6 shadow-sm sm:p-8">
        {/* 앱 타일 + 제목 + 한 줄 (ADR-0164). */}
        <div className="flex flex-col gap-1">
          <AppTile size="lg" className="mb-3" />
          <h1 className="text-h2 font-semibold text-text-primary">BPM에 로그인</h1>
          <p className="text-body-sm text-text-muted">관리자 계정으로 들어오세요</p>
        </div>
        <LoginForm
          note={changed === "1" ? "비밀번호를 바꿨습니다. 새 비밀번호로 들어오세요." : undefined}
          next={safeNext(next) ?? undefined}
        />
      </div>
    </main>
  );
}
