// filepath: apps/api/src/common/pagination.ts - 페이지 번호와 조회 개수 및 검색어 검증
import { z } from "zod";

// 페이지 번호는 1부터 시작합니다.
// 최대 조회 개수는 100개로 제한합니다.
export const paginationSchema = z.object({
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  search: z.string()
    .trim()
    .max(100)
    .optional()
    .default("")
});

export type PaginationQuery =
  z.infer<typeof paginationSchema>;

// Prisma skip 계산
export function getSkip(
  page: number,
  limit: number
): number {
  return (page - 1) * limit;
}

// 표준 페이징 응답 생성
export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1
    }
  };
}

