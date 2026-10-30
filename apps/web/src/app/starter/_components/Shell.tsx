// filepath: apps/web/src/app/starter/_components/Shell.tsx - 상단 메뉴와 로그인 상태 및 공통 화면 구성
"use client";

import Link from "next/link";
import {NavIcon} from './NavIcon';

import {
  useRouter, usePathname
} from "next/navigation";

import type {
  ReactNode
} from "react";

import {
  useState
} from "react";

import {
  useAuth
} from "../_lib/auth";

export function StarterShell({
  children
}: {
  children: ReactNode;
}) {

  const router = useRouter();
  const pathname = usePathname();

  const {
    user,
    loading,
    logout
  } = useAuth();

  const [error, setError] = useState("");

  async function handleLogout() {

    setError("");

    try {

      await logout();

      router.push("/starter/login");

    }
    catch {

      setError(
        "로그아웃 요청을 완료하지 못했습니다. 서버 연결을 확인해 주세요."
      );

    }
  }

  return (
    <div className={`starter-root ${user?'farmer-app':'farmer-guest'}`}>
      <a className="farmer-skip" href="#starter-main">본문으로 바로가기</a>

      <header className="starter-header">

        <div className="starter-header-inner">

          <Link
            href="/starter"
            className="starter-logo"
          >
            {/* SVG 원본을 사용해 작은 화면에서도 브랜드를 선명하게 표시합니다. */}
            <img src="/brand/logo-light.svg" alt="CT-Farm" width={164} height={35} />
          </Link>

          <nav className={user?'starter-nav farmer-tabs':'starter-nav'} aria-label="주 메뉴">

            <Link href="/starter" aria-current={pathname==='/starter'?'page':undefined}>
              <NavIcon name="home"/><span>홈</span>
            </Link>

            {user && (
              <>
                <Link href="/starter/farms" aria-current={pathname.startsWith('/starter/farms')?'page':undefined}><NavIcon name="farm"/><span>내 농장</span></Link>
                <Link href="/starter/diary" aria-current={pathname.startsWith('/starter/diary')||pathname==='/starter/assistant'?'page':undefined}><NavIcon name="diary"/><span>영농일지</span></Link>
                <Link href="/starter/schedule" aria-current={pathname.startsWith('/starter/schedule')?'page':undefined}><NavIcon name="calendar"/><span>일정</span></Link>
                <Link href="/starter/more" aria-current={['/starter/more','/starter/members','/starter/collaboration','/starter/account','/starter/files'].includes(pathname)?'page':undefined}><NavIcon name="menu"/><span>전체</span></Link>
              </>
            )}

          </nav>
          <a className="farmer-help" href="/docs-center/index.html">도움말 · 문서</a>

          <div className="starter-account">

            {!loading && !user && (
              <>
                <Link
                  href="/starter/login"
                  className="starter-button secondary"
                >
                  로그인
                </Link>

                <Link
                  href="/starter/register"
                  className="starter-button"
                >
                  회원가입
                </Link>
              </>
            )}

            {!loading && user && (
              <>
                <Link href="/starter/notifications" className="ct-icon-button" aria-label="알림 확인" aria-current={pathname==='/starter/notifications'?'page':undefined}><NavIcon name="bell"/><span>알림</span></Link>
                <span className="starter-user">
                  {user.name}님
                </span>

                <button
                  type="button"
                  className="starter-button secondary"
                  onClick={handleLogout}
                >
                  로그아웃
                </button>
              </>
            )}

          </div>

        </div>

      </header>

      {error && (
        <div className="starter-global-error">
          {error}
        </div>
      )}

      <main className="starter-main" id="starter-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="starter-footer">
        CT-Farm · 농장과 영농일지 관리
      </footer>

    </div>
  );
}

