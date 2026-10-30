// filepath: apps/web/src/app/layout.tsx - Next.js 최상위 HTML 레이아웃
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CT-Farm · 농업 통합 관리",
  description: "농장과 영농 기록을 연결하는 CT-Farm",
  icons: {
    icon: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    apple: "/brand/app-icon-192.png"
  }
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

