import { BpmMark } from "@bpm/ui";
import { LoginForm } from "./form";

/**
 * 로그인 (CON-00). **관리자 계정**으로 들어온다 (ADR-0090) — 역할은 계정이 정한다.
 *
 * **따뜻한 바탕 가운데 카드 하나다** ([ADR-0161](../../../../../../docs/decisions/0161-soft-cards.md) — 화면 폭 띠와
 * 배경 그림을 내렸다). 좁은 화면에서는 여백 16을 두고 카드가 폭 전체를 쓴다.
 *
 * 세션 토큰은 **콘솔 서버가 암호화된 httpOnly 쿠키에 담아 들고** 브라우저에 내려가지 않는다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const { changed } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-xl border border-border-default bg-bg-surface p-6 shadow-md sm:p-8">
        <h1 className="flex flex-col items-center gap-3">
          <span className="flex h-14 items-center justify-center rounded-lg bg-primary-subtle px-4 text-primary">
            <BpmMark className="h-7 w-auto" />
          </span>
          <span className="text-h2 font-bold tracking-wide">BPM</span>
        </h1>
        <LoginForm note={changed === "1" ? "비밀번호를 바꿨습니다. 새 비밀번호로 들어오세요." : undefined} />
      </div>
    </main>
  );
}
