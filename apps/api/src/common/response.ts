// filepath: apps/api/src/common/response.ts - 웹과 모바일 앱에서 공통으로 사용하는 API 응답 규격
import { Response } from "express";

// 성공 응답 형식을 통일합니다.
export function success<T>(
  res: Response,
  data: T,
  message = "요청이 정상적으로 처리되었습니다.",
  statusCode = 200
): void {
  res.status(statusCode).json({
    success: true,
    data,
    message
  });
}

// 실패 응답 형식을 통일합니다.
export function failure(
  res: Response,
  statusCode: number,
  errorCode: string,
  message: string
): void {
  res.status(statusCode).json({
    success: false,
    errorCode,
    message
  });
}

