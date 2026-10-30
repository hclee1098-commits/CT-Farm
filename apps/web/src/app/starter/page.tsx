// filepath: apps/web/src/app/starter/page.tsx - Starter Kit 메인 대시보드
"use client";

import Link from "next/link";
import {FarmDashboard} from './_components/FarmDashboard';

import {
  useAuth
} from "./_lib/auth";

export default function StarterHome() {

  const {
    user,
    loading
  } = useAuth();

  if (!loading && user) return <FarmDashboard />;
  return (
    <div className="starter-container">

      <section className="starter-hero">

        <div className="starter-badge">
          CT-Farm 농업 관리
        </div>

        <h1>
          내 농장을 기록하는
          <br />
          쉬운 영농 관리
        </h1>

        <p>
          농장별 위치와 작물, 생육 단계를 관리하고
          매일의 농작업을 영농일지로 남겨 보세요.
        </p>

        {!loading && !user && (
          <div className="starter-actions">

            <Link
              href="/starter/register"
              className="starter-button large"
            >
              시작하기
            </Link>

            <Link
              href="/starter/login"
              className="starter-button secondary large"
            >
              로그인
            </Link>

          </div>
        )}

        {!loading && user && (
          <div className="starter-welcome">

            <h2>
              {user.name}님, 환영합니다.
            </h2>

            <p>
              내 농장을 등록하고 오늘의 농작업을 기록해 보세요.
            </p>

          </div>
        )}

      </section>

      <section className="starter-grid">

        <Link href="/starter/farms" className="starter-card">
          <div className="starter-card-icon">🌱</div>
          <h2>내 농장 · 영농일지</h2>
          <p>농장 위치·면적·작물 관리와 작업 기록을 한곳에서 확인합니다.</p>
          <span>농장 관리 열기 →</span>
        </Link>

        <Link
          href="/starter/notes"
          className="starter-card"
        >

          <div className="starter-card-icon">
            📝
          </div>

          <h2>게시글 관리</h2>

          <p>
            게시글 등록, 조회, 수정, 삭제와
            검색 및 페이징을 제공합니다.
          </p>

          <span>기능 열기 →</span>

        </Link>

        <Link
          href="/starter/files"
          className="starter-card"
        >

          <div className="starter-card-icon">
            📁
          </div>

          <h2>파일 관리</h2>

          <p>
            파일 업로드, 다운로드,
            목록 조회 및 삭제 기능을 제공합니다.
          </p>

          <span>기능 열기 →</span>

        </Link>

        <div className="starter-card">

          <div className="starter-card-icon">
            🔐
          </div>

          <h2>안전한 계정 관리</h2>

          <p>
            계정 보안 화면에서 비밀번호와 로그인 기기를
            확인하고 2단계 인증을 설정할 수 있습니다.
          </p>

        </div>

      </section>

      {user && (
        <section className="starter-panel">

          <h2>내 계정 정보</h2>

          <div className="starter-info-row">
            <strong>이름</strong>
            <span>{user.name}</span>
          </div>

          <div className="starter-info-row">
            <strong>이메일</strong>
            <span>{user.email}</span>
          </div>

          <div className="starter-info-row">
            <strong>회원 ID</strong>
            <span>{user.id}</span>
          </div>

        </section>
      )}

    </div>
  );
}

