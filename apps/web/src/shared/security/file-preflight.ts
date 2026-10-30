// filepath: apps/web/src/shared/security/file-preflight.ts - 업로드 전 파일 크기 확장자 MIME 타입을 검사
// ============================================================
// 파일 업로드 사전 검증
// ============================================================

// 이 검사는 사용자 편의를 위한 클라이언트 검증입니다.
// 서버 측 파일 내용 검사와 접근 권한 검사를 대체하지 않습니다.

// ============================================================
// 허용 파일
// ============================================================

const allowedTypes: Record<string, string[]> = {

  png: [
    "image/png"
  ],

  jpg: [
    "image/jpeg"
  ],

  jpeg: [
    "image/jpeg"
  ],

  webp: [
    "image/webp"
  ],

  pdf: [
    "application/pdf"
  ]
};

// ============================================================
// 최대 파일 크기
// ============================================================

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

// ============================================================
// 검증 결과
// ============================================================

export interface FileValidationResult {

  valid: boolean;

  message: string;
}

// ============================================================
// 파일 검증
// ============================================================

export function validateUploadFile(
  file: File | null | undefined
): FileValidationResult {

  if (!file) {
    return {
      valid: false,
      message: "파일을 선택해 주세요."
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      message: "빈 파일은 업로드할 수 없습니다."
    };
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return {
      valid: false,
      message: "파일 크기는 최대 5MB까지 허용됩니다."
    };
  }

  const extension = file.name
    .split(".")
    .pop()
    ?.toLowerCase();

  if (
    !extension ||
    !Object.prototype.hasOwnProperty.call(
      allowedTypes,
      extension
    )
  ) {
    return {
      valid: false,
      message: "허용되지 않은 파일 확장자입니다."
    };
  }

  const expectedTypes = allowedTypes[extension];

  if (
    !expectedTypes ||
    !expectedTypes.includes(file.type)
  ) {
    return {
      valid: false,
      message: "파일 형식이 확장자와 일치하지 않습니다."
    };
  }

  return {
    valid: true,
    message: "파일 사전 검증을 통과했습니다."
  };
}

