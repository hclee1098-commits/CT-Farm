// filepath: apps/api/src/types/express.d.ts - 인증 사용자와 검증된 요청값을 Express 타입에 추가
declare global {
  namespace Express {
    interface Request {
      userId?: string;

      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};

