// filepath: apps/web/src/app/starter/layout.tsx - Starter Kit 인증 Provider와 공통 화면 레이아웃
import type {
  ReactNode
} from "react";

import {
  AuthProvider
} from "./_lib/auth";

import {
  StarterShell
} from "./_components/Shell";

import "./starter.css";
import "./design-tokens.css";
import "./app-ui.css";

export default function StarterLayout({
  children
}: {
  children: ReactNode;
}) {

  return (
    <AuthProvider>
      <StarterShell>
        {children}
      </StarterShell>
    </AuthProvider>
  );
}

