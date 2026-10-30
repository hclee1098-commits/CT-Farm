// filepath: apps/api/src/infrastructure/redis.ts - Redis 연결과 종료 및 상태 확인 기능 제공
import { createClient } from "redis";
import { env } from "../config/env";

export const redis = createClient({
  url: env.REDIS_URL,
  // 장애 시 무제한 재연결 및 오프라인 요청 누적을 방지합니다.
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => retries < 3
      ? Math.min(200 * (retries + 1), 1000)
      : new Error("Redis 재연결 횟수를 초과했습니다.")
  },
  disableOfflineQueue: true,
  commandsQueueMaxLength: 1000
});

// Redis 오류 이벤트를 처리합니다.
redis.on("error", () => {
  // 비밀번호 등이 포함될 수 있는 연결 문자열은 기록하지 않습니다.
  console.error("Redis 연결에 문제가 발생했습니다.");
});

// Redis 연결
// ============================================================
// Redis 연결 상태 통합 관리
// ============================================================

// 여러 모듈이 동시에 연결을 요청해도
// 실제 연결 작업은 한 번만 수행합니다.

let redisConnectPromise: Promise<void> | null = null;

// Redis 연결 완료를 보장합니다.
export async function connectRedis(): Promise<void> {

  if (redis.isReady) {
    return;
  }

  if (!redisConnectPromise) {

    redisConnectPromise = (async () => {

      // 연결 자체가 시작되지 않았다면 연결합니다.
      if (!redis.isOpen) {

        await redis.connect();

        return;
      }

      // 이미 연결 중이라면 준비 완료를 기다립니다.
      if (!redis.isReady) {

        await new Promise<void>((resolve, reject) => {

          const cleanup = () => {

            redis.off("ready", onReady);
            redis.off("error", onError);
            redis.off("end", onEnd);

          };

          const onReady = () => {

            cleanup();

            resolve();

          };

          const onError = (error: Error) => {

            cleanup();

            reject(error);

          };

          const onEnd = () => {

            cleanup();

            reject(
              new Error("Redis 연결이 종료되었습니다.")
            );

          };

          redis.once("ready", onReady);
          redis.once("error", onError);
          redis.once("end", onEnd);

          // 이벤트 등록 직전에 연결되었을 가능성을 처리합니다.
          if (redis.isReady) {
            onReady();
          }

        });

      }

    })().finally(() => {

      redisConnectPromise = null;

    });

  }

  await redisConnectPromise;
}

// Redis 상태 확인
export async function checkRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

// Redis 연결 종료
export async function closeRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}

