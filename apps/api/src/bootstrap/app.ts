import { telemetry } from "../infrastructure/telemetry";
import { farmsRouter } from "../modules/farms/farms.controller";
import {workspaceRouter} from '../modules/farms/workspace.controller';
import {voiceRouter} from '../modules/farms/voice.controller';
import {collaborationRouter} from '../modules/farms/collaboration.controller';
import { operationsRouter, sensorIngestRouter } from "../modules/farms/operations.controller";
import {mapsRouter,plotImportRouter} from '../modules/farms/maps.controller';
import {consultationsRouter} from '../modules/farms/consultation.controller';
import {paymentsRouter} from '../modules/farms/payment.controller';
import { accountRouter, notificationRouter } from "../modules/platform/platform.controller";
import { adminRouter } from "../modules/platform/admin.controller";
// filepath: apps/api/src/bootstrap/app.ts - Express 보안 미들웨어 및 전체 API 라우터 통합
import { requestContext } from "./observability/request-context";


import { connectRedis as ensureRateLimitRedis } from "../infrastructure/redis";


import express from "express";

import helmet from "helmet";

import cors from "cors";

import cookieParser from "cookie-parser";

import {
  rateLimit
} from "express-rate-limit";

import {
  RedisStore
} from "rate-limit-redis";

import {
  env
} from "../config/env";

import {
  redis
} from "../infrastructure/redis";

import {
  logger
} from "../infrastructure/logger";

import {
  authRouter
} from "../modules/auth/auth.controller";

import {
  notesRouter
} from "../modules/notes/notes.controller";

import {
  filesRouter
} from "../modules/files/files.controller";

import {
  healthRouter
} from "./health";

import {
  runtimeConfig
} from "./runtime.config";

import {
  notFoundHandler,
  globalErrorHandler
} from "./error-handler";

// ============================================================
// Express 애플리케이션 생성
// ============================================================

export const app = express();

// 서버 구현 정보를 노출하지 않습니다.
app.disable("x-powered-by");

// ============================================================
// Reverse Proxy 설정
// ============================================================

// 기본값은 0으로 프록시를 신뢰하지 않습니다.
//
// Nginx, AWS ALB 등의 프록시를 사용하는 경우
// 실제 네트워크 구조를 확인한 뒤 설정해야 합니다.
//
// 무조건 trust proxy = true로 설정하지 않습니다.

app.set(
  "trust proxy",
  runtimeConfig.TRUST_PROXY_HOPS
);

// ============================================================
// 요청 ID 생성
// ============================================================

// 클라이언트가 보낸 요청 ID를 신뢰하지 않고
// 서버에서 새로운 UUID를 생성합니다.

app.use(requestContext);



// ============================================================
// 구조화된 HTTP 요청 로깅
// ============================================================

app.use((req, res, next) => {

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {

    const durationMs = Number(
      process.hrtime.bigint() - startedAt
    ) / 1000000;

    // 비밀번호, JWT, 쿠키, 요청 본문은
    // 로그에 기록하지 않습니다.
    //
    // URL의 Query String도 기록하지 않습니다.

    // ヘルスチェックは利用者リクエスト統計から除外します。
    if (!req.path.startsWith('/health')) {
      telemetry('request', {requestId:res.locals.requestId,method:req.method,statusCode:res.statusCode,durationMs});
      if (res.statusCode===401 || res.statusCode===403 || (req.method!=='GET' && (req.path.startsWith('/api/v1/auth') || req.path.startsWith('/api/v1/admin') || req.path.startsWith('/api/v1/platform')))) telemetry('security',{statusCode:res.statusCode,requestId:res.locals.requestId});
    }
    logger.info({

      requestId: res.locals.requestId,

      method: req.method,

      path: req.path,

      statusCode: res.statusCode,

      durationMs: Math.round(
        durationMs * 100
      ) / 100

    }, "HTTP 요청 처리가 완료되었습니다.");
  });

  next();
});

// ============================================================
// Helmet 보안 헤더
// ============================================================

app.use(
  helmet({

    // API 서버의 기본 보안 헤더를 적용합니다.
    //
    // CSP는 웹 페이지를 제공하는 Next.js에서도
    // 별도로 설정해야 합니다.

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }

  })
);

// ============================================================
// CORS 허용 출처
// ============================================================

const allowedOrigins = new Set(
  env.CORS_ORIGIN_LIST
);

// ============================================================
// Origin 검증
// ============================================================

// 허용되지 않은 Origin을 가진 요청은 거부합니다.
//
// 모바일 앱처럼 Origin 헤더가 없는 요청은
// 이 검사만으로 차단하지 않습니다.
//
// Origin 헤더는 인증 수단이 아니므로
// 실제 접근 권한은 JWT로 검증해야 합니다.

app.use((req, res, next) => {

  const origin = req.headers.origin;

  if (
    origin &&
    !allowedOrigins.has(origin)
  ) {

    res.status(403).json({

      success: false,

      errorCode: "CORS_ORIGIN_FORBIDDEN",

      message: "허용되지 않은 출처의 요청입니다."

    });

    return;
  }

  next();
});

// ============================================================
// CORS 설정
// ============================================================

app.use(
  cors({

    origin: (origin, callback) => {

      // Origin이 없는 요청은
      // CORS 응답 헤더 없이 처리합니다.
      //
      // 모바일 앱과 서버 간 통신은
      // 브라우저 CORS 정책의 적용 대상이 아닙니다.

      if (!origin) {

        callback(null, false);

        return;
      }

      if (allowedOrigins.has(origin)) {

        callback(null, origin);

        return;
      }

      callback(null, false);
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID", "X-MFA-Code", "Idempotency-Key"
    ],

    exposedHeaders: [
      "X-Request-ID", "X-MFA-Code", "Idempotency-Key"
    ],

    maxAge: 600

  })
);

// ============================================================
// JSON 요청 본문 크기 제한
// ============================================================

app.use(
  express.json({

    limit: runtimeConfig.JSON_BODY_LIMIT,

    strict: true,

    type: "application/json"

  })
);

// ============================================================
// Cookie Parser
// ============================================================

// 웹 브라우저 Refresh Token은
// HttpOnly Cookie를 통해 전달됩니다.

app.use(
  cookieParser()
);

// ============================================================
// UTF-8 JSON 기본 설정
// ============================================================

app.use((req, res, next) => {

  // 파일 다운로드 응답에서는
  // 파일 Controller가 Content-Type을 다시 지정합니다.

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  next();
});

// ============================================================
// 공통 API Rate Limiting
// ============================================================

// 모든 API에 공통 요청 제한을 적용합니다.
//
// 인증 API와 파일 업로드 API에는
// 기존 모듈의 개별 요청 제한도 추가 적용됩니다.
//
// Redis 장애 시에는 요청을 우회 허용하지 않고
// 오류 처리 경로로 전달합니다.

const apiLimiter = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 300,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  store: new RedisStore({

    prefix: "rate:api:",

    sendCommand: async (...args: string[]) => {

      await ensureRateLimitRedis();
      return await redis.sendCommand(args);
    }

  }),

  handler: (_req, res) => {

    res.status(429).json({

      success: false,

      errorCode: "API_RATE_LIMITED",

      message: "API 요청 횟수 제한을 초과했습니다."

    });
  }

});

// ============================================================
// 헬스체크 라우터
// ============================================================

// Redis에 장애가 발생해도 /health/live는
// 독립적으로 응답할 수 있도록
// 공통 Redis Rate Limiter보다 먼저 등록합니다.

app.use(
  "/health",
  healthRouter
);

// ============================================================
// 공통 API 요청 제한
// ============================================================

app.use("/api/v1", (_req, res, next) => {
  // 인증 정보와 사용자 데이터를 브라우저 및 공유 프록시에 저장하지 않습니다.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

app.use(
  "/api/v1",
  apiLimiter
);

// ============================================================
// 인증 API
// ============================================================

app.use(
  "/api/v1/auth",
  authRouter
);

// ============================================================
// 게시글 CRUD API
// ============================================================

app.use(
  "/api/v1/notes",
  notesRouter
);

// ============================================================
// 파일 관리 API
// ============================================================

app.use(
  "/api/v1/files",
  filesRouter
);

// ============================================================
// 존재하지 않는 경로 처리
// ============================================================



app.use("/api/v1/account", accountRouter);
app.use("/api/v1/farms", farmsRouter);
app.use('/api/v1/workspace',workspaceRouter);
app.use('/api/v1/voice',voiceRouter);
app.use('/api/v1/collaboration',collaborationRouter);
app.use("/api/v1/farms", operationsRouter);
app.use("/api/v1/farms", plotImportRouter);
app.use("/api/v1/farms", consultationsRouter);
app.use("/api/v1/farms", paymentsRouter);
app.use("/api/v1/maps", mapsRouter);
app.use("/api/v1/sensor-ingest", sensorIngestRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/notifications", notificationRouter);

app.use(
  notFoundHandler
);

// ============================================================
// 전역 오류 처리
// ============================================================

// 반드시 모든 라우터보다 뒤에 등록합니다.

app.use(
  globalErrorHandler
);

