// filepath: apps/web/src/app/starter/toolkit/part9/layout.tsx - 상위 통합 인증 Provider를 재사용하고 Toast Provider만 연결
import type {
  ReactNode
} from "react";

import {
  ToastProvider
} from "../../../../shared/ui/toast";

// ============================================================
// 9부 공통 레이아웃
// ============================================================

// 인증 Provider는 /starter/layout.tsx에서
// 이미 전체 Starter 화면에 적용됩니다.
//
// 여기서 다시 생성하면 인증 상태가 중복되므로
// Toast Provider만 연결합니다.

export default function Part9Layout({
  children
}: {
  children: ReactNode;
}) {

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}

