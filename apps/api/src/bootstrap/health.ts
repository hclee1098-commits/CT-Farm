// filepath: apps/api/src/bootstrap/health.ts - 서버와 PostgreSQL 및 Redis 연결 상태 확인 API
import {
  Router
} from "express";

import {
  rateLimit
} from "express-rate-limit";

import {
  prisma
} from "../infrastructure/prisma";

import {
  redis
} from "../infrastructure/redis";

import {
  asyncHandler
} from "../common/validate";

// ============================================================
// 헬스체크 라우터
// ============================================================

export const healthRouter = Router();

// 헬스체크 API 자체가 과도하게 호출되지 않도록
// 간단한 요청 제한을 적용합니다.
//
// 이 제한은 서버별 메모리 저장소를 사용합니다.
// 여러 서버의 전체 요청 수를 합산하지는 않습니다.

healthRouter.use(
  rateLimit({

    windowMs: 60 * 1000,

    limit: 60,

    standardHeaders: "draft-7",

    legacyHeaders: false,

    handler: (_req, res) => {

      res.status(429).json({

        success: false,

        errorCode: "HEALTH_RATE_LIMITED",

        message: "상태 확인 요청이 너무 많습니다."

      });
    }

  })
);

// ============================================================
// 타임아웃 처리
// ============================================================

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T> {

  let timer: NodeJS.Timeout | undefined;

  try {

    const timeout = new Promise<never>(
      (_resolve, reject) => {

        timer = setTimeout(() => {

          reject(
            new Error("상태 확인 시간이 초과되었습니다.")
          );

        }, timeoutMs);
      }
    );

    return await Promise.race([
      operation,
      timeout
    ]);

  } finally {

    if (timer) {
      clearTimeout(timer);
    }
  }
}

// ============================================================
// GET /health
// ============================================================

healthRouter.get(
  "/",

  (_req, res) => {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.status(200).json({

      success: true,

      data: {
        status: "ok"
      },

      message: "서버가 실행 중입니다."

    });
  }
);

// ============================================================
// GET /health/live
// ============================================================

// 프로세스가 HTTP 요청을 처리할 수 있는지 확인합니다.
//
// DB 연결 상태와는 별도로 동작합니다.

healthRouter.get(
  "/live",

  (_req, res) => {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.status(200).json({

      success: true,

      data: {
        status: "alive"
      },

      message: "서버 프로세스가 정상 동작 중입니다."

    });
  }
);

// ============================================================
// GET /health/ready
// ============================================================

// PostgreSQL과 Redis가 실제로 요청을
// 처리할 수 있는지 확인합니다.

healthRouter.get(
  "/ready",

  asyncHandler(async (_req, res) => {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    const results = await Promise.allSettled([

      withTimeout(
        Promise.resolve(
          prisma.$queryRaw`SELECT 1`
        ),
        2000
      ),

      withTimeout(
        redis.ping(),
        2000
      )

    ]);

    const databaseReady =
      results[0].status === "fulfilled";

    const redisReady =
      results[1].status === "fulfilled";

    if (!databaseReady || !redisReady) {

      // 외부 응답에는 내부 접속 주소나
      // 구체적인 DB 오류를 노출하지 않습니다.

      res.status(503).json({

        success: false,

        errorCode: "SERVICE_NOT_READY",
        data: {database: databaseReady ? "ready" : "down", redis: redisReady ? "ready" : "down"},

        message: "일부 서비스 연결이 준비되지 않았습니다."

      });

      return;
    }

    res.status(200).json({

      success: true,

      data: {
        status: "ready",
        database: "ready",
        redis: "ready"
      },

      message: "모든 필수 서비스가 준비되었습니다."

    });
  })
);

