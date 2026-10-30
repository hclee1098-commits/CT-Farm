// filepath: apps/api/src/bootstrap/observability/readiness.ts - PostgreSQL과 Redis의 준비 상태를 확인하는 운영용 API

import {
  Router
} from "express";

import {
  checkDatabase
} from "../../infrastructure/prisma";

import {
  checkRedis
} from "../../infrastructure/redis";

import {
  asyncHandler
} from "../../common/validate";

import {
  success,
  failure
} from "../../common/response";

// ============================================================
// 준비 상태 라우터
// ============================================================

export const readinessRouter = Router();

// ============================================================
// 상태 확인 캐시
// ============================================================

// 준비 상태 확인 요청이 짧은 시간에 반복되더라도
// 데이터베이스에 불필요한 조회가 발생하지 않도록 합니다.
//
// 캐시 시간은 3초입니다.

const CACHE_DURATION_MS = 3000;

interface ReadinessCache {
  ready: boolean;
  expiresAt: number;
}

let readinessCache: ReadinessCache | null = null;

// 동시에 여러 요청이 들어오면
// 하나의 상태 확인 작업을 공유합니다.

let activeCheck: Promise<boolean> | null = null;

// ============================================================
// 실제 서비스 준비 상태 확인
// ============================================================

async function performReadinessCheck(): Promise<boolean> {

  try {

    // PostgreSQL과 Redis를 병렬로 확인합니다.

    const [
      databaseReady,
      redisReady
    ] = await Promise.all([
      checkDatabase(),
      checkRedis()
    ]);

    // 두 서비스가 모두 정상이어야 준비 완료입니다.

    return databaseReady && redisReady;

  } catch {

    // 연결 오류의 상세 내용은 외부에 공개하지 않습니다.

    return false;

  }
}

// ============================================================
// 캐시 및 동시 실행 제어
// ============================================================

async function getReadiness(): Promise<boolean> {

  const now = Date.now();

  // 유효한 캐시가 있다면 재사용합니다.

  if (
    readinessCache &&
    now < readinessCache.expiresAt
  ) {

    return readinessCache.ready;

  }

  // 이미 상태 확인이 진행 중이면
  // 동일한 Promise를 재사용합니다.

  if (!activeCheck) {

    activeCheck = performReadinessCheck();

  }

  const currentCheck = activeCheck;

  try {

    const ready = await currentCheck;

    // 상태 확인 결과를 짧게 캐싱합니다.

    readinessCache = {
      ready,
      expiresAt: Date.now() + CACHE_DURATION_MS
    };

    return ready;

  } finally {

    // 현재 작업이 여전히 활성 작업일 때만 해제합니다.

    if (activeCheck === currentCheck) {

      activeCheck = null;

    }

  }
}

// ============================================================
// GET /health/ready
// ============================================================

// 이 API는 서버가 실제 요청을 처리할 준비가 되었는지
// 확인하기 위한 운영용 엔드포인트입니다.
//
// PostgreSQL 또는 Redis 연결에 문제가 있다면
// HTTP 503을 반환합니다.
//
// 외부 응답에는 내부 연결 주소나 비밀번호를 포함하지 않습니다.

readinessRouter.get(
  "/",

  asyncHandler(async (_req, res) => {

    // 상태 확인 응답을 브라우저나 프록시에 저장하지 않습니다.

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    const ready = await getReadiness();

    if (!ready) {

      failure(
        res,
        503,
        "SERVICE_NOT_READY",
        "서비스가 요청을 처리할 준비가 되지 않았습니다."
      );

      return;

    }

    success(
      res,
      {
        ready: true
      },
      "서비스가 정상적으로 준비되었습니다."
    );

  })
);

