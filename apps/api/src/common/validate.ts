// filepath: apps/api/src/common/validate.ts - Zod를 이용한 Body, Query, Params 요청값 검증
import {
  RequestHandler
} from "express";

import {
  z,
  ZodType
} from "zod";

import { AppError } from "./app-error";

// 검증할 요청 데이터 위치
type RequestTarget = "body" | "query" | "params";

// 요청값을 검증하는 공통 미들웨어
export function validate(
  target: RequestTarget,
  schema: ZodType
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const firstError = result.error.issues[0];

      return next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          firstError?.message ??
            "요청 데이터가 올바르지 않습니다."
        )
      );
    }

    // 검증된 데이터만 이후 처리에 사용합니다.
    if (target === "body") {
      req.body = result.data;
    } else {
      req.validated ??= {};
      req.validated[target] = result.data;
    }

    next();
  };
}

// 비동기 컨트롤러 오류를 전역 처리기로 전달합니다.
export function asyncHandler(
  handler: RequestHandler
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// 여러 API에서 재사용하는 UUID 검증
export const uuidSchema = z.object({
  id: z.string()
    .uuid("올바른 식별자가 아닙니다.")
}).strict();

