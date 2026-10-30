import { telemetry } from "../infrastructure/telemetry";
import { startFarmAssistant } from '../modules/farms/assistant.worker';
import { configureSmtp } from "../modules/platform/smtp";
// filepath: apps/api/src/bootstrap/server.ts - PostgreSQL과 Redis 연결 후 HTTP 서버 실행 및 안전한 종료
import "dotenv/config";

import {
  createServer
} from "node:http";

import {
  app
} from "./app";

import {
  runtimeConfig
} from "./runtime.config";

import {
  prisma
} from "../infrastructure/prisma";

import {
  redis,
  connectRedis
} from "../infrastructure/redis";

import {
  logger
} from "../infrastructure/logger";

// ============================================================
// HTTP 서버 생성
// ============================================================

const server = createServer(app);
let stopFarmAssistant = () => {};

// ============================================================
// HTTP 타임아웃
// ============================================================

// 지나치게 오래 유지되는 요청을 제한합니다.

server.requestTimeout = 60000;

server.headersTimeout = 15000;

server.keepAliveTimeout = 5000;

// ============================================================
// Redis 연결 준비
// ============================================================

async function prepareRedis(): Promise<void> {

  // Rate Limiter와 같은 연결 Promise를 공유해 시작 시 경합을 방지합니다.
  await connectRedis();

  await redis.ping();
}

// ============================================================
// Redis 연결 종료
// ============================================================

async function closeRedis(): Promise<void> {

  const client = redis as unknown as {

    isOpen?: boolean;

    quit?: () => Promise<unknown>;

    disconnect?: () => Promise<unknown> | void;

    destroy?: () => void;

  };

  if (client.isOpen === false) {
    return;
  }

  if (typeof client.quit === "function") {

    await client.quit();

    return;
  }

  if (typeof client.disconnect === "function") {

    await client.disconnect();

    return;
  }

  if (typeof client.destroy === "function") {

    client.destroy();
  }
}

// ============================================================
// HTTP 서버 종료
// ============================================================

async function closeHttpServer(): Promise<void> {

  let timer: NodeJS.Timeout | undefined;

  try {

    await Promise.race([

      new Promise<void>((resolve) => {

        server.close(() => {
          resolve();
        });
      }),

      new Promise<void>((resolve) => {

        timer = setTimeout(() => {

          // 정상 종료 제한 시간이 초과되면
          // 남아 있는 HTTP 연결을 종료합니다.

          server.closeAllConnections();

          resolve();

        }, runtimeConfig.SHUTDOWN_TIMEOUT_MS);
      })

    ]);

  } finally {

    if (timer) {
      clearTimeout(timer);
    }
  }
}

// ============================================================
// 종료 상태
// ============================================================

let shuttingDown = false;

// ============================================================
// 안전한 서버 종료
// ============================================================

async function shutdown(
  reason: string,
  exitCode: number
): Promise<void> {

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopFarmAssistant();
  telemetry("stop",{status:"down"});

  logger.info({
    reason
  }, "서버 종료 절차를 시작합니다.");

  try {

    // 새로운 HTTP 요청을 받지 않습니다.
    await closeHttpServer();

  } catch (error) {

    logger.error({
      err: error
    }, "HTTP 서버 종료 중 오류가 발생했습니다.");
  }

  // DB와 Redis 연결을 정리합니다.
  const results = await Promise.allSettled([

    prisma.$disconnect(),

    closeRedis()

  ]);

  for (const result of results) {

    if (result.status === "rejected") {

      logger.error({
        err: result.reason
      }, "외부 서비스 연결 종료에 실패했습니다.");
    }
  }

  logger.info(
    "서버 종료 절차가 완료되었습니다."
  );

  process.exitCode = exitCode;
}

// ============================================================
// 종료 신호 처리
// ============================================================

process.on("SIGINT", () => {

  void shutdown("SIGINT", 0);
});

process.on("SIGTERM", () => {

  void shutdown("SIGTERM", 0);
});

// ============================================================
// 처리되지 않은 Promise 오류
// ============================================================

process.on("unhandledRejection", (reason) => {

  logger.error({
    err: reason
  }, "처리되지 않은 Promise 오류가 발생했습니다.");

  void shutdown("unhandledRejection", 1);
});

// ============================================================
// 처리되지 않은 예외
// ============================================================

process.on("uncaughtException", (error) => {

  logger.error({
    err: error
  }, "처리되지 않은 예외가 발생했습니다.");

  void shutdown("uncaughtException", 1);
});

// ============================================================
// 서버 시작
// ============================================================

async function startServer(): Promise<void> {
  configureSmtp();

  // ----------------------------------------------------------
  // PostgreSQL 연결
  // ----------------------------------------------------------

  logger.info(
    "PostgreSQL 연결을 확인합니다."
  );

  await prisma.$connect();

  // ----------------------------------------------------------
  // Redis 연결
  // ----------------------------------------------------------

  logger.info(
    "Redis 연결을 확인합니다."
  );

  await prepareRedis();

  // ----------------------------------------------------------
  // HTTP 서버 실행
  // ----------------------------------------------------------

  await new Promise<void>((resolve, reject) => {

    const onError = (error: Error) => {

      reject(error);
    };

    server.once("error", onError);

    server.listen(
      runtimeConfig.PORT,
      (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
      () => {

        server.off("error", onError);

        resolve();
      }
    );
  });

  telemetry("start",{status:"up"});
  stopFarmAssistant = startFarmAssistant();
  logger.info({

    port: runtimeConfig.PORT,

    environment:
      process.env.NODE_ENV ?? "development"

  }, "통합 API 서버가 시작되었습니다.");

  logger.info(
    "헬스체크: /health"
  );

  logger.info(
    "인증 API: /api/v1/auth"
  );

  logger.info(
    "게시글 API: /api/v1/notes"
  );

  logger.info(
    "파일 API: /api/v1/files"
  );
}

// ============================================================
// 시작 오류 처리
// ============================================================

startServer().catch(async (error) => {
  telemetry("failure",{status:"down"});

  logger.error({
    err: error
  }, "API 서버 시작에 실패했습니다.");

  try {

    await prisma.$disconnect();

    await closeRedis();

  } catch (cleanupError) {

    logger.error({
      err: cleanupError
    }, "시작 실패 후 연결 정리에 실패했습니다.");
  }

  process.exit(1);
});

