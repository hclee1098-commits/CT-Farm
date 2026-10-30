// filepath: apps/api/src/modules/notes/notes.dto.ts - 게시글 등록, 수정, 검색, 정렬, 페이징 요청값 검증
import { z } from "zod";

import {
  paginationSchema
} from "../../common/pagination";

// ============================================================
// 게시글 제목 검증
// ============================================================

const titleSchema = z.string()
  .trim()
  .min(
    1,
    "제목을 입력해 주세요."
  )
  .max(
    120,
    "제목은 최대 120자까지 입력할 수 있습니다."
  );

// ============================================================
// 게시글 내용 검증
// ============================================================

const contentSchema = z.string()
  .trim()
  .min(
    1,
    "내용을 입력해 주세요."
  )
  .max(
    10000,
    "내용은 최대 10,000자까지 입력할 수 있습니다."
  );

// ============================================================
// 게시글 등록 요청
// ============================================================

export const createNoteSchema = z.object({

  title: titleSchema,

  content: contentSchema

}).strict();

// ============================================================
// 게시글 전체 수정 요청
// ============================================================

export const replaceNoteSchema = createNoteSchema.extend({ version: z.number().int().positive().optional() });

// ============================================================
// 게시글 부분 수정 요청
// ============================================================

// PATCH 요청은 제목이나 내용 중 하나만 전달해도 됩니다.
// 단, 빈 객체는 허용하지 않습니다.

export const updateNoteSchema = createNoteSchema
  .partial()
  .extend({ version: z.number().int().positive().optional() })
  .refine(
    (data) => data.title !== undefined || data.content !== undefined,
    {
      message: "수정할 항목을 하나 이상 입력해 주세요."
    }
  );

// ============================================================
// 정렬 가능한 필드
// ============================================================

// 클라이언트가 임의의 DB 필드를 지정하지 못하도록
// 정렬 필드를 명시적으로 제한합니다.

export const noteSortFields = [
  "createdAt",
  "updatedAt",
  "title"
] as const;

// ============================================================
// 게시글 목록 조회
// ============================================================

export const listNotesSchema = paginationSchema
  .extend({

    // 페이지 번호의 상한을 설정하여
    // 지나치게 큰 오프셋 요청을 제한합니다.
    page: z.coerce.number()
      .int()
      .min(1)
      .max(1000000)
      .default(1),

    sortBy: z.enum(noteSortFields)
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

export type CreateNoteInput =
  z.infer<typeof createNoteSchema>;

export type ReplaceNoteInput =
  z.infer<typeof replaceNoteSchema>;

export type UpdateNoteInput =
  z.infer<typeof updateNoteSchema>;

export type ListNotesQuery =
  z.infer<typeof listNotesSchema>;

