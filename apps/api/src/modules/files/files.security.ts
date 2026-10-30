// filepath: apps/api/src/modules/files/files.security.ts - 파일 시그니처와 확장자 및 MIME 타입 검증
import path from "node:path";
import { MAX_FILE_SIZE } from "./files.dto";

import {
  AppError
} from "../../common/app-error";

// ============================================================
// 허용 파일 형식
// ============================================================

type AllowedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

type FileType = {
  mimeType: AllowedMime;
  extension: string;
};

// 파일 형식별 허용 확장자
const allowedExtensions: Record<
  AllowedMime,
  readonly string[]
> = {

  "image/jpeg": [
    ".jpg",
    ".jpeg"
  ],

  "image/png": [
    ".png"
  ],

  "image/webp": [
    ".webp"
  ],

  "application/pdf": [
    ".pdf"
  ]

};

// ============================================================
// 한글 파일명 인코딩 복구
// ============================================================

// 일부 multipart 파서는 UTF-8 파일명을
// Latin-1 문자열로 해석할 수 있습니다.
//
// 원본 바이트가 유효한 UTF-8인 경우에만
// 파일명을 복구합니다.

function restoreUtf8Filename(
  filename: string
): string {

  const latin1Compatible = Array.from(filename)
    .every((character) => character.codePointAt(0)! <= 255);

  if (!latin1Compatible) {
    return filename;
  }

  const bytes = Buffer.from(
    filename,
    "latin1"
  );

  const restored = bytes.toString("utf8");

  if (restored.includes("\uFFFD")) {
    return filename;
  }

  if (!Buffer.from(restored, "utf8").equals(bytes)) {
    return filename;
  }

  return restored;
}

// ============================================================
// 파일명 정리
// ============================================================

export function sanitizeFilename(
  originalName: string
): string {

  const restored = restoreUtf8Filename(
    originalName
  );

  const cleaned = restored
    .normalize("NFC")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\/\\]/g, "_")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();

  if (
    !cleaned ||
    cleaned === "." ||
    cleaned === ".."
  ) {

    throw new AppError(
      400,
      "INVALID_FILENAME",
      "파일명이 올바르지 않습니다."
    );
  }

  if (
    Buffer.byteLength(cleaned, "utf8") > 255
  ) {

    throw new AppError(
      400,
      "FILENAME_TOO_LONG",
      "파일명이 너무 깁니다."
    );
  }

  return cleaned;
}

// ============================================================
// 실제 파일 시그니처 검사
// ============================================================

// 파일명과 클라이언트 MIME 타입만으로
// 파일 종류를 판단하지 않습니다.
//
// 아래 검사는 기본 시그니처 검사이며,
// 파일 전체의 구조적 무결성이나 악성코드
// 포함 여부를 보장하지 않습니다.

export function detectFileType(
  buffer: Buffer
): FileType | null {

  // JPEG
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {

    return {
      mimeType: "image/jpeg",
      extension: ".jpg"
    };
  }

  // PNG
  const pngSignature = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
  ]);

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(pngSignature)
  ) {

    return {
      mimeType: "image/png",
      extension: ".png"
    };
  }

  // WebP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {

    return {
      mimeType: "image/webp",
      extension: ".webp"
    };
  }

  // PDF
  if (
    buffer.length >= 5 &&
    buffer.toString("ascii", 0, 5) === "%PDF-"
  ) {

    return {
      mimeType: "application/pdf",
      extension: ".pdf"
    };
  }

  return null;
}

// ============================================================
// 업로드 파일 검증
// ============================================================

export function validateUploadedFile(
  file: Express.Multer.File
) {

  if (!file.buffer || file.buffer.length === 0 || file.size === 0) {

    throw new AppError(
      400,
      "EMPTY_FILE",
      "빈 파일은 업로드할 수 없습니다."
    );
  }

  // 다른 업로드 어댑터에서도 크기 제한과 실제 바이트 수를 검사합니다.
  if (file.buffer.length > MAX_FILE_SIZE) {
    throw new AppError(413, "FILE_TOO_LARGE", "파일 크기가 허용 용량을 초과했습니다.");
  }
  if (file.size !== file.buffer.length) {
    throw new AppError(400, "INVALID_FILE_SIZE", "파일 크기 정보가 일치하지 않습니다.");
  }

  const originalName = sanitizeFilename(
    file.originalname
  );

  const extension = path.extname(
    originalName
  ).toLowerCase();

  const detected = detectFileType(
    file.buffer
  );

  if (!detected) {

    throw new AppError(
      400,
      "UNSUPPORTED_FILE_TYPE",
      "허용되지 않은 파일 형식입니다."
    );
  }

  const validExtensions =
    allowedExtensions[detected.mimeType];

  if (!validExtensions.includes(extension)) {

    throw new AppError(
      400,
      "INVALID_FILE_EXTENSION",
      "파일 확장자와 실제 파일 형식이 일치하지 않습니다."
    );
  }

  if (file.mimetype !== detected.mimeType) {

    throw new AppError(
      400,
      "INVALID_MIME_TYPE",
      "요청한 MIME 타입과 실제 파일 형식이 일치하지 않습니다."
    );
  }

  return {
    originalName,
    mimeType: detected.mimeType,
    extension: detected.extension,
    size: file.size
  };
}

