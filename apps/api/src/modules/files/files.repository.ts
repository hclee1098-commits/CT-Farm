// filepath: apps/api/src/modules/files/files.repository.ts - Prisma를 이용한 파일 메타데이터 저장 및 사용자별 접근 권한 검사
import {
  Prisma
} from "@prisma/client";

import {
  prisma
} from "../../infrastructure/prisma";

import type {
  ListFilesQuery
} from "./files.dto";

// ============================================================
// 외부 응답용 파일 필드
// ============================================================

const publicFileSelect = {

  id: true,

  originalName: true,

  mimeType: true,

  size: true,

  createdAt: true

} as const;

// ============================================================
// 파일 Repository
// ============================================================

export const filesRepository = {
  findDuplicate(ownerId: string, sha256: string) {
    return prisma.storedFile.findFirst({ where: { ownerId, sha256, deletedAt: null }, select: publicFileSelect });
  },

  // ----------------------------------------------------------
  // 파일 메타데이터 등록
  // ----------------------------------------------------------

  async create(data: {

    sha256?: string;
    ownerId: string;

    storageKey: string;

    originalName: string;

    mimeType: string;

    size: number;

  }) {

    return prisma.storedFile.create({

      data,

      select: publicFileSelect

    });
  },

  // ----------------------------------------------------------
  // 파일 목록 조회
  // ----------------------------------------------------------

  async findPage(
    ownerId: string,
    query: ListFilesQuery
  ) {

    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder
    } = query;

    const where: Prisma.StoredFileWhereInput = {

      ownerId,
      deletedAt: null,

      ...(search
        ? {
            originalName: {
              contains: search,
              mode: "insensitive" as const
            }
          }
        : {})

    };

    const orderBy: Prisma.StoredFileOrderByWithRelationInput = {
      [sortBy]: sortOrder
    };

    const [items, total] = await prisma.$transaction([

      prisma.storedFile.findMany({

        where,

        select: publicFileSelect,

        orderBy: [
          orderBy,
          {
            id: "asc"
          }
        ],

        skip: (page - 1) * limit,

        take: limit

      }),

      prisma.storedFile.count({
        where
      })

    ]);

    return {
      items,
      total
    };
  },

  // ----------------------------------------------------------
  // 파일 상세 조회
  // ----------------------------------------------------------

  async findById(
    ownerId: string,
    fileId: string
  ) {

    return prisma.storedFile.findFirst({

      where: {
        id: fileId,
        ownerId,
        deletedAt: null
      }

    });
  },

  // ----------------------------------------------------------
  // 파일 메타데이터 삭제
  // ----------------------------------------------------------

  // 복구 대상 ID 또는 저장소 키가 DB에서 사용 중인지 확인합니다.
  // 사용자 소유권과 관계없이 전체 파일을 검사합니다.
  async findDeletionConflict(
    fileId: string,
    storageKey: string
  ) {

    return prisma.storedFile.findFirst({

      where: {
        OR: [
          { id: fileId },
          { storageKey }
        ]
      },

      select: {
        id: true,
        ownerId: true,
        storageKey: true
      }

    });
  },
  async delete(
    ownerId: string,
    fileId: string
  ) {

    return prisma.storedFile.deleteMany({

      where: {
        id: fileId,
        ownerId,
        deletedAt: null
      }

    });
  }
};

