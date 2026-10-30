// filepath: apps/web/src/app/starter/notes/page.tsx - 게시글 CRUD와 검색, 정렬, 페이징 화면
"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";

import Link from "next/link";

import {
  useAuth
} from "../_lib/auth";

import {
  getErrorMessage
} from "../_lib/api";

import type {
  PaginatedResult
} from "../_lib/api";

// 게시글 데이터 구조
interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {

  const {
    user,
    loading,
    request
  } = useAuth();

  const [items, setItems] = useState<Note[]>([]);

  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [sortBy, setSortBy] = useState("createdAt");

  const [sortOrder, setSortOrder] = useState("desc");

  const [title, setTitle] = useState("");

  const [content, setContent] = useState("");

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  // 게시글 목록 조회
  const loadNotes = useCallback(async () => {

    try {

      const params = new URLSearchParams({
        page: String(page),
        limit: "10",
        search,
        sortBy,
        sortOrder
      });

      const result =
        await request<PaginatedResult<Note>>(
          `/notes?${params.toString()}`
        );

      setItems(result.items);

      setTotal(result.pagination.total);

      setTotalPages(
        Math.max(
          1,
          result.pagination.totalPages
        )
      );

      setError("");

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }

  }, [
    request,
    page,
    search,
    sortBy,
    sortOrder
  ]);

  useEffect(() => {

    if (!loading && user) {
      void loadNotes();
    }

  }, [loading, user, loadNotes]);

  // 검색 적용
  function handleSearch(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    setPage(1);

    setSearch(searchInput.trim());
  }

  // 게시글 등록 또는 수정
  async function handleSave(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);

    setError("");

    setMessage("");

    try {

      const path = editingId
        ? `/notes/${editingId}`
        : "/notes";

      const method = editingId
        ? "PATCH"
        : "POST";

      await request<Note>(
        path,
        {
          method,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8"
          },

          body: JSON.stringify({
            title,
            content
          })
        }
      );

      setTitle("");

      setContent("");

      setEditingId(null);

      setMessage(
        "게시글이 저장되었습니다."
      );

      if (page === 1) {
        await loadNotes();
      }
      else {
        setPage(1);
      }

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }
    finally {

      setSubmitting(false);

    }
  }

  // 수정할 게시글 선택
  function handleEdit(note: Note) {

    setEditingId(note.id);

    setTitle(note.title);

    setContent(note.content);

    setMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  // 수정 취소
  function handleCancelEdit() {

    setEditingId(null);

    setTitle("");

    setContent("");
  }

  // 게시글 삭제
  async function handleDelete(id: string) {

    if (
      !window.confirm(
        "이 게시글을 삭제하시겠습니까?"
      )
    ) {
      return;
    }

    try {

      await request(
        `/notes/${id}`,
        {
          method: "DELETE"
        }
      );

      setMessage(
        "게시글이 삭제되었습니다."
      );

      await loadNotes();

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }
  }

  if (loading) {
    return (
      <div className="starter-container">
        <p>로그인 상태를 확인하고 있습니다.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="starter-container">

        <div className="starter-panel">

          <h2>로그인이 필요합니다.</h2>

          <Link
            href="/starter/login"
            className="starter-button"
          >
            로그인하기
          </Link>

        </div>

      </div>
    );
  }

  return (
    <div className="starter-container">

      <div className="starter-page-heading">

        <h1>게시글 관리</h1>

        <p>
          게시글 등록, 조회, 수정, 삭제,
          검색 및 정렬 기능입니다.
        </p>

      </div>

      {error && (
        <div className="starter-error" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="starter-success">
          {message}
        </div>
      )}

      <section className="starter-panel">

        <h2>
          {editingId
            ? "게시글 수정"
            : "새 게시글 등록"}
        </h2>

        <form onSubmit={handleSave}>

          <label htmlFor="note-title">
            제목
          </label>

          <input
            id="note-title"
            type="text"
            required
            maxLength={120}
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
          />

          <label htmlFor="note-content">
            내용
          </label>

          <textarea
            id="note-content"
            required
            maxLength={10000}
            rows={6}
            value={content}
            onChange={(event) =>
              setContent(event.target.value)
            }
          />

          <div className="starter-actions">

            <button
              type="submit"
              className="starter-button"
              disabled={submitting}
            >
              {submitting
                ? "저장 중..."
                : editingId
                  ? "수정 완료"
                  : "게시글 등록"}
            </button>

            {editingId && (
              <button
                type="button"
                className="starter-button secondary"
                onClick={handleCancelEdit}
              >
                수정 취소
              </button>
            )}

          </div>

        </form>

      </section>

      <section className="starter-panel">

        <h2>게시글 목록</h2>

        <form
          className="starter-search"
          onSubmit={handleSearch}
        >

          <input
            type="search"
            aria-label="게시글 검색어"
            placeholder="게시글 검색"
            value={searchInput}
            onChange={(event) =>
              setSearchInput(event.target.value)
            }
          />

          <button
            type="submit"
            className="starter-button"
          >
            검색
          </button>

        </form>

        <div className="starter-toolbar">

          <span>
            전체 {total}개
          </span>

          <div className="starter-toolbar-controls">

            <select
              aria-label="정렬 기준"
              value={sortBy}
              onChange={(event) => {
                setPage(1);
                setSortBy(event.target.value);
              }}
            >
              <option value="createdAt">
                등록일
              </option>

              <option value="updatedAt">
                수정일
              </option>

              <option value="title">
                제목
              </option>
            </select>

            <select
              aria-label="정렬 방향"
              value={sortOrder}
              onChange={(event) => {
                setPage(1);
                setSortOrder(event.target.value);
              }}
            >
              <option value="desc">
                내림차순
              </option>

              <option value="asc">
                오름차순
              </option>
            </select>

          </div>

        </div>

        {items.length === 0 && (
          <div className="starter-empty">
            등록된 게시글이 없습니다.
          </div>
        )}

        <div className="starter-list">

          {items.map((note) => (

            <article
              key={note.id}
              className="starter-list-item"
            >

              <h3>{note.title}</h3>

              <p className="starter-note-content">
                {note.content}
              </p>

              <div className="starter-list-bottom">

                <small>
                  {new Date(
                    note.createdAt
                  ).toLocaleString("ko-KR")}
                </small>

                <div className="starter-actions">

                  <button
                    type="button"
                    className="starter-button secondary"
                    onClick={() =>
                      handleEdit(note)
                    }
                  >
                    수정
                  </button>

                  <button
                    type="button"
                    className="starter-button danger"
                    onClick={() =>
                      handleDelete(note.id)
                    }
                  >
                    삭제
                  </button>

                </div>

              </div>

            </article>

          ))}

        </div>

        <div className="starter-pagination">

          <button
            type="button"
            className="starter-button secondary"
            disabled={page <= 1}
            onClick={() =>
              setPage((current) =>
                Math.max(1, current - 1)
              )
            }
          >
            이전
          </button>

          <span>
            {page} / {totalPages}
          </span>

          <button
            type="button"
            className="starter-button secondary"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) =>
                current + 1
              )
            }
          >
            다음
          </button>

        </div>

      </section>

    </div>
  );
}

