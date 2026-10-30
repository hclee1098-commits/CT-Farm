// filepath: apps/web/src/shared/ui/error-boundary.tsx - 화면 오류가 발생해도 전체 애플리케이션이 중단되지 않도록 격리
"use client";

import {
  Component
} from "react";

import type {
  ReactNode
} from "react";

// ============================================================
// 속성 및 상태
// ============================================================

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// ============================================================
// 오류 격리 컴포넌트
// ============================================================

export class ErrorBoundary extends Component<
  Props,
  State
> {

  constructor(props: Props) {
    super(props);

    this.state = {
      hasError: false
    };
  }

  static getDerivedStateFromError(): State {

    return {
      hasError: true
    };
  }

  reset = () => {

    this.setState({
      hasError: false
    });
  };

  render() {

    if (this.state.hasError) {

      return (
        <div
          role="alert"
          style={{
            padding: 24,
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b"
          }}
        >

          <h2>화면을 표시하지 못했습니다.</h2>

          <p>
            일시적인 문제가 발생했습니다.
          </p>

          <button
            type="button"
            onClick={this.reset}
          >
            다시 시도
          </button>

        </div>
      );
    }

    return this.props.children;
  }
}

