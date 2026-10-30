// filepath: apps/web/src/app/starter/files/page.tsx - 파일 업로드, 목록, 다운로드 및 삭제 화면
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

// 파일 메타데이터
interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export default function FilesPage() {

  const {
    user,
    loading,
    request,
    authorizedFetch
  } = useAuth();

  const [files, setFiles] =
    useState<StoredFile[]>([]);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  // 파일 목록 조회
  const loadFiles = useCallback(async () => {

    try {

      const result =
        await request<PaginatedResult<StoredFile>>(
          "/files?page=1&limit=100"
        );

      setFiles(result.items);

      setError("");

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }

  }, [request]);

  useEffect(() => {

    if (!loading && user) {
      void loadFiles();
    }

  }, [loading, user, loadFiles]);

  // 파일 업로드
  async function handleUpload(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    if (!selectedFile || uploading) {
      return;
    }

    // 사용자 편의를 위한 사전 검사입니다.
    // 최종 용량과 파일 형식은 백엔드에서 검증합니다.
    if (selectedFile.size > 5 * 1024 * 1024) {

      setError(
        "파일 크기는 5MB 이하여야 합니다."
      );

      return;
    }

    setUploading(true);

    setError("");

    setMessage("");

    try {

      const formData = new FormData();

      formData.append(
        "file",
        selectedFile
      );

      await request<StoredFile>(
        "/files",
        {
          method: "POST",
          body: formData
        }
      );

      setSelectedFile(null);

      const input = document.getElementById(
        "starter-file-input"
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      setMessage(
        "파일 업로드가 완료되었습니다."
      );

      await loadFiles();

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }
    finally {

      setUploading(false);

    }
  }

  // 파일 다운로드
  async function handleDownload(
    file: StoredFile
  ) {

    try {

      const response = await authorizedFetch(
        `/files/${file.id}/download`
      );

      if (!response.ok) {
        throw new Error(
          "파일 다운로드에 실패했습니다."
        );
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = url;

      anchor.download = file.originalName;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

    }
    catch (caught) {

      setError(getErrorMessage(caught));

    }
  }

  // 파일 삭제
  async function handleDelete(
    file: StoredFile
  ) {

    if (
      !window.confirm(
        `"${file.originalName}" 파일을 삭제하시겠습니까?`
      )
    ) {
      return;
    }

    try {

      await request(
        `/files/${file.id}`,
        {
          method: "DELETE"
        }
      );

      setMessage(
        "파일이 삭제되었습니다."
      );

      await loadFiles();

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

        <h1>파일 관리</h1>

        <p>
          파일 업로드, 다운로드,
          목록 조회 및 삭제 기능입니다.
        </p>

      </div>

      {error && (
        <div
          className="starter-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {message && (
        <div className="starter-success">
          {message}
        </div>
      )}

      <section className="starter-panel">

        <h2>파일 업로드</h2>

        <form onSubmit={handleUpload}>

          <input
            id="starter-file-input"
            type="file"
            required
            onChange={(event) =>
              setSelectedFile(
                event.target.files?.[0] ?? null
              )
            }
          />

          <p className="starter-help">
            최대 파일 크기: 5MB
          </p>

          <button
            type="submit"
            className="starter-button"
            disabled={
              uploading ||
              !selectedFile
            }
          >
            {uploading
              ? "업로드 중..."
              : "파일 업로드"}
          </button>

        </form>

      </section>

      <section className="starter-panel">

        <h2>업로드한 파일</h2>

        {files.length === 0 && (
          <div className="starter-empty">
            업로드한 파일이 없습니다.
          </div>
        )}

        <div className="starter-list">

          {files.map((file) => (

            <div
              key={file.id}
              className="starter-list-item"
            >

              <h3>
                {file.originalName}
              </h3>

              <p>
                {(file.size / 1024).toFixed(1)} KB
              </p>

              <div className="starter-list-bottom">

                <small>
                  {new Date(
                    file.createdAt
                  ).toLocaleString("ko-KR")}
                </small>

                <div className="starter-actions">

                  <button
                    type="button"
                    className="starter-button secondary"
                    onClick={() =>
                      handleDownload(file)
                    }
                  >
                    다운로드
                  </button>

                  <button
                    type="button"
                    className="starter-button danger"
                    onClick={() =>
                      handleDelete(file)
                    }
                  >
                    삭제
                  </button>

                </div>

              </div>

            </div>

          ))}

        </div>

      </section>

    </div>
  );
}

