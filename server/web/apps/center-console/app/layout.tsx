import type { Metadata } from "next";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/theme-script";

export const metadata: Metadata = {
  // 화면에 서는 이름은 「BPM」 하나다 (ADR-0153 — INNONOW 브랜드는 걷었다).
  title: "BPM",
  description: "Center 콘솔 (ADR-0017)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-theme`은 그리기 전에 스크립트가 단다 — 서버가 그린 것과 달라도 경고하지 않게 한다 (ADR-0181).
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
