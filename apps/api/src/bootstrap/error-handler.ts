// filepath: apps/api/src/bootstrap/error-handler.ts - 전역 오류 분류, 민감 정보 보호 및 표준 JSON 오류 응답
import type {
  ErrorRequestHandler,
  RequestHandler
} from "express";

import multer from "multer";

import {
  AppError
} from "../common/app-error";

import {
  logger
} from "../infrastructure/logger";

// ============================================================
// HTTP 오류 구조
// ============================================================

type ErrorInformation = {

  statusCode: number;

  errorCode: string;

  message: string;

};

// ============================================================
// 상태 코드 안전성 검사
// ============================================================

function normalizeStatus(
  value: unknown
): number {

  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
  ) {

    return value;
  }

  return 500;
}

// ============================================================
// 오류 분류
// ============================================================

function classifyError(
  error: unknown
): ErrorInformation {

  // ----------------------------------------------------------
  // 애플리케이션 오류
  // ----------------------------------------------------------

  if (error instanceof AppError) {

    // 기존 AppError 구현에서 status 또는
    // statusCode를 사용할 수 있으므로
    // 두 형태를 확인합니다.

    const appError = error as AppError & {

      status?: number;

      statusCode?: number;

      errorCode?: string;

    };

    const statusCode = normalizeStatus(
      appError.statusCode ?? appError.status
    );

    return {

      statusCode,

      errorCode:
        appError.errorCode ?? "APPLICATION_ERROR",

      message:
        statusCode >= 500
          ? "서버 내부 오류가 발생했습니다."
          : appError.message

    };
  }

  // ----------------------------------------------------------
  // Multer 파일 업로드 오류
  // ----------------------------------------------------------

  if (error instanceof multer.MulterError) {

    if (error.code === "LIMIT_FILE_SIZE") {

      return {
        statusCode: 413,
        errorCode: "FILE_TOO_LARGE",
        message: "파일 크기가 허용 용량을 초과했습니다."
      };
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {

      return {
        statusCode: 400,
        errorCode: "UNEXPECTED_FILE",
        message: "허용되지 않은 파일 필드입니다."
      };
    }

    return {
      statusCode: 400,
      errorCode: "INVALID_UPLOAD",
      message: "파일 업로드 요청이 올바르지 않습니다."
    };
  }

  // ----------------------------------------------------------
  // 일반 오류 정보
  // ----------------------------------------------------------

  const candidate = (
    typeof error === "object" && error !== null
      ? error
      : {}
  ) as {

    type?: string;

    code?: string;

    status?: number;

    statusCode?: number;

  };

  // ----------------------------------------------------------
  // JSON 요청 크기 초과
  // ----------------------------------------------------------

  if (candidate.type === "entity.too.large") {

    return {
      statusCode: 413,
      errorCode: "REQUEST_TOO_LARGE",
      message: "요청 데이터 크기가 너무 큽니다."
    };
  }

  // ----------------------------------------------------------
  // 잘못된 JSON
  // ----------------------------------------------------------

  if (candidate.type === "entity.parse.failed") {

    return {
      statusCode: 400,
      errorCode: "INVALID_JSON",
      message: "JSON 요청 형식이 올바르지 않습니다."
    };
  }

  // ----------------------------------------------------------
  // Prisma 중복 데이터 오류
  // ----------------------------------------------------------

  if (candidate.code === "P2002") {

    return {
      statusCode: 409,
      errorCode: "DUPLICATE_RESOURCE",
      message: "이미 존재하는 데이터입니다."
    };
  }

  // ----------------------------------------------------------
  // Prisma 데이터 없음
  // ----------------------------------------------------------

  if (candidate.code === "P2025") {

    return {
      statusCode: 404,
      errorCode: "RESOURCE_NOT_FOUND",
      message: "요청한 데이터를 찾을 수 없습니다."
    };
  }

  // ----------------------------------------------------------
  // 기타 오류
  // ----------------------------------------------------------

  return {
    statusCode: 500,
    errorCode: "INTERNAL_SERVER_ERROR",
    message: "서버 내부 오류가 발생했습니다."
  };
}

// ============================================================
// 존재하지 않는 API 처리
// ============================================================

export const notFoundHandler: RequestHandler = (
  _req,
  res
) => {

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.status(404).json({

    success: false,

    errorCode: "ROUTE_NOT_FOUND",

    message: "요청한 API 주소를 찾을 수 없습니다."

  });
};

// ============================================================
// 전역 오류 처리
// ============================================================

export const globalErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  next
) => {

  // 응답이 이미 시작된 경우에는
  // Express에 연결 종료 처리를 위임합니다.

  if (res.headersSent) {

    next(error);

    return;
  }

  const information = classifyError(error);

  const requestId = String(
    res.locals.requestId ?? ""
  );

  // ----------------------------------------------------------
  // 구조화된 오류 로깅
  // ----------------------------------------------------------

  if (information.statusCode >= 500) {

    logger.error({

      errorType: error instanceof Error ? error.name : "UnknownError",
      errorCode: information.errorCode,

      requestId,

      method: req.method,

      path: req.path,

      statusCode: information.statusCode

    }, "서버 요청 처리 중 오류가 발생했습니다.");

  } else {

    logger.warn({

      requestId,

      method: req.method,

      path: req.path,

      statusCode: information.statusCode,

      errorCode: information.errorCode

    }, "요청이 오류 응답으로 종료되었습니다.");
  }

  // ----------------------------------------------------------
  // UTF-8 JSON 오류 응답
  // ----------------------------------------------------------

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.status(information.statusCode).json({

    success: false,

    errorCode: information.errorCode,

    message: information.message

  });
};

