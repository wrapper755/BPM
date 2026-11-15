import { BpmMark } from "@bpm/ui";
import { LoginForm } from "./form";

/**
 * 로그인 (CON-00). **관리자 계정**으로 들어온다 (ADR-0090) — 역할은 계정이 정한다.
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
    <div className="flex min-h-screen flex-col">
      {/* 화면 폭 전체의 머리 — **마크 + 「BPM」 한 줄뿐이다** (ADR-0154: 문구 두 줄을 걷었다. 로그인하러
          온 사람이 카드를 보기 전에 읽을 글을 두지 않는다). */}
      <header className="border-b border-border-default bg-bg-surface">
        <h1 className="mx-auto flex max-w-[1080px] items-center gap-3 px-6 py-5 text-primary">
          <BpmMark className="h-7 w-auto" />
          <span className="text-h2 font-bold tracking-wide">BPM</span>
        </h1>
      </header>
      {/* 배경 그림 — BPM 흐름과 AI(신경망)를 떠올리게 한다. Gemini 이미지 모델로 만들었다 (ADR-0120). */}
      <main
        className="flex flex-1 items-center justify-center bg-cover bg-center p-6"
        style={{ backgroundImage: "url(/brand/login-bg.webp)" }}
      >
        <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-xl border border-border-default bg-bg-surface p-8 shadow-sm">
          <BpmMark className="h-8 w-auto self-center text-primary" />
          <LoginForm note={changed === "1" ? "비밀번호를 바꿨습니다. 새 비밀번호로 들어오세요." : undefined} />
        </div>
      </main>
    </div>
  );
}
