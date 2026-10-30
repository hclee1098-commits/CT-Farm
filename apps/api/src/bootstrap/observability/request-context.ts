// filepath: apps/api/src/bootstrap/observability/request-context.ts - 모든 HTTP 요청에 고유 식별자를 부여하는 공통 미들웨어

import {
  randomUUID
} from "node:crypto";

import type {
  RequestHandler
} from "express";

// ============================================================
// 요청 식별자 생성
// ============================================================

// 클라이언트가 전달한 임의의 Request ID를 신뢰하지 않습니다.
//
// 외부에서 전달한 식별자를 그대로 사용하면
// 로그 추적 과정에서 식별자 위조 문제가 발생할 수 있습니다.
//
// 따라서 서버에서 새로운 UUID를 생성합니다.

export const requestContext: RequestHandler = (
  req,
  res,
  next
) => {

  // ==========================================================
  // 고유 요청 식별자
  // ==========================================================

  const requestId = randomUUID();

  // 기존 HTTP 로깅 시스템과 연결합니다.
  (req as typeof req & { id: string }).id = requestId;

  res.locals.requestId = requestId;

  // ==========================================================
  // HTTP 응답 헤더
  // ==========================================================

  // 브라우저와 모바일 앱에서
  // 서버 로그와 동일한 요청 식별자를 확인할 수 있습니다.

  res.setHeader(
    "X-Request-Id",
    requestId
  );

  // 응답이 별도의 캐시 시스템에 저장되더라도
  // 요청 식별자 헤더가 다른 요청에 재사용되지 않도록
  // 기존 캐시 정책을 변경하지는 않습니다.
  //
  // 실제 운영 환경에서는 CDN 및 프록시의
  // 응답 헤더 처리 정책도 함께 설정해야 합니다.

  next();
};

