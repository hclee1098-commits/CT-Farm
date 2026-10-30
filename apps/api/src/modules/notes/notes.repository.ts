// filepath: apps/api/src/modules/notes/notes.repository.ts - Prisma를 이용한 게시글 데이터 접근 및 소유권 검사
import {
  Prisma
} from "@prisma/client";

import {
  prisma
} from "../../infrastructure/prisma";

import {
  AppError
} from "../../common/app-error";

import type {
  CreateNoteInput,
  ReplaceNoteInput,
  UpdateNoteInput,
  ListNotesQuery
} from "./notes.dto";

// ============================================================
// 게시글 응답 필드
// ============================================================

// DB에 새로운 민감 필드가 추가되더라도
// 자동으로 API 응답에 포함되지 않도록
// 반환 필드를 명시적으로 지정합니다.

const noteSelect = {
  id: true,
  version: true,
  deletedAt: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true
} as const;

// ============================================================
// 게시글 Repository
// ============================================================

export const notesRepository = {

  // ----------------------------------------------------------
  // 게시글 등록
  // ----------------------------------------------------------

  async create(
    ownerId: string,
    input: CreateNoteInput
  ) {

    return prisma.note.create({

      data: {
        ownerId,
        title: input.title,
        content: input.content
      },

      select: noteSelect

    });
  },

  // ----------------------------------------------------------
  // 게시글 목록 조회
  // ----------------------------------------------------------

  async findPage(
    ownerId: string,
    query: ListNotesQuery
  ) {

    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder
    } = query;

    // 반드시 로그인한 사용자 소유의 게시글만 검색합니다.
    const where: Prisma.NoteWhereInput = {

      ownerId,
      deletedAt: null,

      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive" as const
                }
              },
              {
                content: {
                  contains: search,
                  mode: "insensitive" as const
                }
              }
            ]
          }
        : {})

    };

    // 정렬 필드는 DTO에서 허용된 값만 전달됩니다.
    const orderBy: Prisma.NoteOrderByWithRelationInput = {
      [sortBy]: sortOrder
    };

    const skip = (page - 1) * limit;

    // 목록과 전체 개수를 트랜잭션으로 조회합니다.
    const [items, total] = await prisma.$transaction([

      prisma.note.findMany({

        where,

        select: noteSelect,

        orderBy: [
          orderBy,
          {
            id: "asc"
          }
        ],

        skip,

        take: limit

      }),

      prisma.note.count({
        where
      })

    ]);

    return {
      items,
      total
    };
  },

  // ----------------------------------------------------------
  // 게시글 상세 조회
  // ----------------------------------------------------------

  async findById(
    ownerId: string,
    noteId: string
  ) {

    return prisma.note.findFirst({

      where: {
        id: noteId,
        ownerId,
        deletedAt: null
      },

      select: noteSelect

    });
  },

  // ----------------------------------------------------------
  // 게시글 전체 수정
  // ----------------------------------------------------------

  async replace(
    ownerId: string,
    noteId: string,
    input: ReplaceNoteInput
  ) {

    return prisma.$transaction(async (tx) => {

      // 게시글 ID와 사용자 ID를 동시에 검사합니다.
      // 소유권 확인과 수정을 하나의 DB 작업으로 수행합니다.
      const result = await tx.note.updateMany({

        where: {
          ...(input.version !== undefined ? { version: input.version } : {}),
          id: noteId,
          ownerId,
          deletedAt: null
        },

        data: {
          version: { increment: 1 },
          title: input.title,
          content: input.content
        }

      });

      if (result.count !== 1) {
        if (input.version !== undefined && await tx.note.findFirst({ where: { id: noteId, ownerId, deletedAt: null }, select: { id: true } })) {
          throw new AppError(409, "NOTE_VERSION_CONFLICT", "다른 요청이 먼저 수정했습니다. 최신 내용을 다시 조회해 주세요.");
        }

        throw new AppError(
          404,
          "NOTE_NOT_FOUND",
          "게시글을 찾을 수 없습니다."
        );
      }

      return tx.note.findUniqueOrThrow({

        where: {
          id: noteId
        },

        select: noteSelect

      });
    });
  },

  // ----------------------------------------------------------
  // 게시글 부분 수정
  // ----------------------------------------------------------

  async update(
    ownerId: string,
    noteId: string,
    input: UpdateNoteInput
  ) {

    return prisma.$transaction(async (tx) => {

      // 다른 사용자의 게시글은 수정할 수 없습니다.
      const result = await tx.note.updateMany({

        where: {
          ...(input.version !== undefined ? { version: input.version } : {}),
          id: noteId,
          ownerId,
          deletedAt: null
        },

        data: {
          version: { increment: 1 },
          ...(input.title !== undefined
            ? { title: input.title }
            : {}),

          ...(input.content !== undefined
            ? { content: input.content }
            : {})
        }

      });

      if (result.count !== 1) {
        if (input.version !== undefined && await tx.note.findFirst({ where: { id: noteId, ownerId, deletedAt: null }, select: { id: true } })) {
          throw new AppError(409, "NOTE_VERSION_CONFLICT", "다른 요청이 먼저 수정했습니다. 최신 내용을 다시 조회해 주세요.");
        }

        throw new AppError(
          404,
          "NOTE_NOT_FOUND",
          "게시글을 찾을 수 없습니다."
        );
      }

      return tx.note.findUniqueOrThrow({

        where: {
          id: noteId
        },

        select: noteSelect

      });
    });
  },

  // ----------------------------------------------------------
  // 게시글 삭제
  // ----------------------------------------------------------

  async delete(
    ownerId: string,
    noteId: string
  ) {

    // 삭제할 때도 사용자 소유권을 동시에 검사합니다.
    const result = await prisma.note.updateMany({
      data: { deletedAt: new Date(), version: { increment: 1 } },

      where: {
        id: noteId,
        ownerId,
        deletedAt: null
      }

    });

    if (result.count !== 1) {

      throw new AppError(
        404,
        "NOTE_NOT_FOUND",
        "게시글을 찾을 수 없습니다."
      );
    }

    return {
      id: noteId,
      deleted: true
    };
  }
};

