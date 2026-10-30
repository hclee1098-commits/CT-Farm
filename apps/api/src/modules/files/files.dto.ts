// filepath: apps/api/src/modules/files/files.dto.ts - 파일 목록 검색과 정렬 및 페이징 요청 검증
import { z } from "zod";

import {
  paginationSchema
} from "../../common/pagination";

// ============================================================
// 파일 관리 공통 설정
// ============================================================

// 파일당 최대 업로드 크기: 5MB
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 목록 조회 시 허용할 정렬 필드
export const fileSortFields = [
  "createdAt",
  "originalName",
  "size"
] as const;

// ============================================================
// 파일 목록 조회 검증
// ============================================================

export const listFilesSchema = paginationSchema
  .extend({

    page: z.coerce.number()
      .int()
      .min(1)
      .max(1000000)
      .default(1),

    sortBy: z.enum(fileSortFields)
      .default("createdAt"),

    sortOrder: z.enum([
      "asc",
      "desc"
    ]).default("desc")

  })
  .strict();

// ============================================================
// 타입 정의
// ============================================================

export type ListFilesQuery =
  z.infer<typeof listFilesSchema>;

