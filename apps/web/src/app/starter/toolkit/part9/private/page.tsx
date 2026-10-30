// filepath: apps/web/src/app/starter/toolkit/part9/private/page.tsx - JWT 인증을 거쳐 게시글을 조회하는 보호 페이지
"use client";

import {
  useEffect,
  useState
} from "react";

import Link from "next/link";

import {
  AuthGuard
} from "../../../../../shared/auth/auth-guard";

import {
  useAuth
} from "../../../../../shared/auth/auth-provider";

import {
  authorizedFetch
} from "../../../../../shared/auth/auth-client";

// ============================================================
// 게시글 타입
// ============================================================

interface Note {
  id: string;
  title: string;
  content: string;
}

interface NotesResponse {
  success: boolean;
  data?: {
    items: Note[];
  };
  message?: string;
}

// ============================================================
// 인증된 게시글 화면
// ============================================================

function PrivateNotesContent() {

  const {
    status
  } = useAuth();

  const [notes, setNotes] = useState<Note[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // ==========================================================
  // 게시글 조회
  // ==========================================================

  useEffect(() => {

    if (status !== "authenticated") {
      return;
    }

    const controller = new AbortController();

    const loadNotes = async () => {

      setLoading(true);

      setError(null);

      try {

        const response = await authorizedFetch(
          "/notes?page=1&limit=5",
          {
            method: "GET",
            signal: controller.signal
          }
        );

        if (!response.ok) {

          throw new Error(
            `게시글 조회 실패: HTTP ${response.status}`
          );
        }

        const result =
          await response.json() as NotesResponse;

        if (
          result.success !== true ||
          !Array.isArray(result.data?.items)
        ) {

          throw new Error(
            "게시글 응답 형식이 올바르지 않습니다."
          );
        }

        if (!controller.signal.aborted) {

          setNotes(result.data.items);
        }

      }
      catch (caught) {

        if (!controller.signal.aborted) {

          setError(
            caught instanceof Error
              ? caught.message
              : "게시글을 조회하지 못했습니다."
          );
        }

      }
      finally {

        if (!controller.signal.aborted) {

          setLoading(false);
        }
      }
    };

    void loadNotes();

    return () => {

      controller.abort();
    };

  }, [status]);

  // ==========================================================
  // 화면
  // ==========================================================

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 32
      }}
    >

      <h1>
        인증된 게시글 조회
      </h1>

      <p>
        JWT 인증을 통과한 사용자만
        게시글을 조회할 수 있습니다.
      </p>

      {loading && (
        <p role="status">
          게시글을 불러오는 중입니다.
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {!loading && !error && notes.length === 0 && (
        <p>
          등록된 게시글이 없습니다.
        </p>
      )}

      {!loading && !error && notes.length > 0 && (

        <ul
          style={{
            display: "grid",
            gap: 16,
            padding: 0,
            listStyle: "none"
          }}
        >

          {notes.map((note) => (

            <li
              key={note.id}
              style={{
                padding: 20,
                border: "1px solid #ddd",
                borderRadius: 8
              }}
            >

              <h2>
                {note.title}
              </h2>

              <p>
                {note.content}
              </p>

            </li>
          ))}

        </ul>
      )}

      <p
        style={{
          marginTop: 32
        }}
      >

        <Link href="/starter/toolkit/part9">
          인증 관리 화면으로 돌아가기
        </Link>

      </p>

    </main>
  );
}

// ============================================================
// 접근 제어 적용
// ============================================================

export default function PrivatePage() {

  return (
    <AuthGuard>
      <PrivateNotesContent />
    </AuthGuard>
  );
}


