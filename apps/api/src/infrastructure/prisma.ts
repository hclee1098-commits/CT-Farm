// filepath: apps/api/src/infrastructure/prisma.ts - Prisma 데이터베이스 연결을 공통으로 관리
import { PrismaClient } from "@prisma/client";

// PrismaClient는 요청마다 생성하지 않고 재사용합니다.
export const prisma = new PrismaClient({
  log: [
    "warn",
    "error"
  ]
});

// 데이터베이스 연결 상태 확인
export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// 서버 종료 시 연결 정리
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
}

