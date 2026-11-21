import type { NextConfig } from "next";

const config: NextConfig = {
  // 컨테이너 배포 (ADR-0017 §1). 서버 docker compose에 함께 올린다.
  output: "standalone",
  // 워크스페이스 패키지는 소스를 그대로 가져와 Next가 변환한다 (빌드 산출물을 두지 않는다).
  transpilePackages: ["@bpm/ui", "@bpm/api-types", "@bpm/bpmn-canvas"],
  typedRoutes: true,
  // 옮긴 주소 — 옛 주소는 새 주소로 영구 넘긴다(책갈피·다른 화면에 남은 링크). 질의는 그대로 따라간다.
  async redirects() {
    return [
      // CON-02 「프로세스 현황」 — `/bots`는 PC 실행기 시절의 이름이다 (ADR-0186).
      { source: "/bots", destination: "/processes", permanent: true },
      { source: "/bots/:path*", destination: "/processes/:path*", permanent: true },
    ];
  },
};

export default config;
