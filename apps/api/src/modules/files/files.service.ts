import { normalizeImage } from "./image.processing";
// filepath: apps/api/src/modules/files/files.service.ts - 파일 업로드, 조회, 다운로드 및 삭제 비즈니스 로직
import crypto from "node:crypto";

import {
  AppError
} from "../../common/app-error";

import {
  paginated
} from "../../common/pagination";

import {
  logger
} from "../../infrastructure/logger";

import {
  filesRepository
} from "./files.repository";

import {
  validateUploadedFile
} from "./files.security";

import {
  LocalFileStorage
} from "./storage/local.storage";

import type {
  FileStorage
} from "./storage/storage.interface";

import type {
  ListFilesQuery
} from "./files.dto";
import {
  createPendingDeletion,
  removePendingDeletion,
  listPendingDeletions,
  withCrossProcessDeletionLock
} from "./files.deletion-journal";

// ============================================================
// 저장소 의존성
// ============================================================

// 나중에 S3로 전환할 경우 이 저장소 구현을 교체합니다.
// Service와 Controller는 동일한 인터페이스를 사용합니다.

const storage: FileStorage = new LocalFileStorage();

// ============================================================
// 파일 Service
// ============================================================

// ============================================================
// 미완료 파일 삭제 복구
// ============================================================

let deletionOperationQueue: Promise<void> = Promise.resolve();

// 동일 프로세스에서 파일 삭제와 복구 작업을 직렬화합니다.
// 이전 작업이 실패하더라도 다음 작업은 실행됩니다.
async function withDeletionOperationLock<T>(
  operation: () => Promise<T>
): Promise<T> {

  const previous = deletionOperationQueue;

  let release!: () => void;

  deletionOperationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {

    return await withCrossProcessDeletionLock(operation);

  } finally {

    release();

  }
}

async function recoverPendingFileDeletions(): Promise<void> {

  const pendingEntries = await listPendingDeletions();

  for (const pending of pendingEntries) {

    try {

      // DB에 파일 정보가 남아 있다면 실제 파일을 삭제하지 않습니다.
      const existing = await filesRepository.findById(
        pending.ownerId,
        pending.fileId
      );

      if (existing) {

        if (existing.storageKey !== pending.storageKey) {

          logger.error(
            { fileId: pending.fileId },
            "삭제 기록과 DB 파일 정보가 일치하지 않습니다."
          );

          continue;
        }

        await removePendingDeletion(pending.fileId);

        continue;
      }

      // 다른 사용자의 파일이나 재사용된 저장소 키를 보호합니다.
      // 파일 ID와 저장소 키를 소유권과 무관하게 검사합니다.
      const conflict = await filesRepository.findDeletionConflict(
        pending.fileId,
        pending.storageKey
      );

      if (conflict) {

        // 의심스러운 기록은 삭제하지 않고 조사 대상으로 유지합니다.
        logger.error(
          {
            fileId: pending.fileId,
            conflictingFileId: conflict.id
          },
          "삭제 복구 대상이 DB의 기존 파일과 충돌합니다."
        );

        continue;
      }

      // DB에서 참조하지 않는 파일만 정리합니다.
      await storage.remove(pending.storageKey);

      await removePendingDeletion(pending.fileId);

    } catch (error) {

      // 복구 실패 기록은 유지합니다.
      logger.error(
        {
          err: error,
          fileId: pending.fileId
        },
        "미완료 파일 삭제 복구에 실패했습니다."
      );
    }
  }
}

export const filesService = {

  // 파일 API 요청마다 미완료 작업을 확인합니다.
  // 삭제 작업과 충돌하지 않도록 직렬화합니다.
  async recoverPendingDeletions(): Promise<void> {

    await withDeletionOperationLock(
      recoverPendingFileDeletions
    );

  },

  // ----------------------------------------------------------
  // 파일 업로드
  // ----------------------------------------------------------

  async upload(
    userId: string,
    file: Express.Multer.File | undefined
  ) {

    if (!file) {

      throw new AppError(
        400,
        "FILE_REQUIRED",
        "업로드할 파일을 선택해 주세요."
      );
    }

    // 확장자, MIME 타입, 파일 시그니처 검사
    const validated = validateUploadedFile(
      file
    );

    const normalized = await normalizeImage(file.buffer, validated.mimeType);
    const sha256 = crypto.createHash("sha256").update(normalized).digest("hex");
    const duplicate = await filesRepository.findDuplicate(userId, sha256);
    if (duplicate) return duplicate;

    // 사용자 파일명을 저장 경로에 사용하지 않습니다.
    const storageKey =
      crypto.randomUUID() + validated.extension;

    // 파일을 비공개 저장소에 저장합니다.
    await storage.save(
      storageKey,
      normalized
    );

    try {

      // 파일 메타데이터는 DB에 저장합니다.
      return await filesRepository.create({

        sha256,
        ownerId: userId,

        storageKey,

        originalName: validated.originalName,

        mimeType: validated.mimeType,

        size: normalized.length

      });

    } catch (error) {

      // DB 저장에 실패하면 파일을 정리합니다.
      try {

        await storage.remove(storageKey);

      } catch (cleanupError) {

        logger.error(
          {
            storageKey,
            error: cleanupError
          },
          "파일 업로드 실패 후 임시 파일 정리에 실패했습니다."
        );
      }

      throw error;
    }
  },

  // ----------------------------------------------------------
  // 파일 목록 조회
  // ----------------------------------------------------------

  async list(
    userId: string,
    query: ListFilesQuery
  ) {

    const result = await filesRepository.findPage(
      userId,
      query
    );

    return paginated(
      result.items,
      result.total,
      query.page,
      query.limit
    );
  },

  // ----------------------------------------------------------
  // 파일 상세 조회
  // ----------------------------------------------------------

  async getById(
    userId: string,
    fileId: string
  ) {

    const file = await filesRepository.findById(
      userId,
      fileId
    );

    if (!file) {

      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "파일을 찾을 수 없습니다."
      );
    }

    // 저장소 내부 키는 클라이언트에 노출하지 않습니다.
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt
    };
  },

  // ----------------------------------------------------------
  // 파일 다운로드
  // ----------------------------------------------------------

  async download(
    userId: string,
    fileId: string
  ) {

    const file = await filesRepository.findById(
      userId,
      fileId
    );

    if (!file) {

      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "파일을 찾을 수 없습니다."
      );
    }

    try {

      const opened = await storage.openRead(
        file.storageKey
      );

      return {
        stream: opened.stream,
        size: opened.size,
        originalName: file.originalName,
        mimeType: file.mimeType
      };

    } catch (error) {

      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {

        throw new AppError(
          404,
          "FILE_NOT_FOUND",
          "파일을 찾을 수 없습니다."
        );
      }

      throw error;
    }
  },

  // ----------------------------------------------------------
  // 파일 삭제
  // ----------------------------------------------------------

  async delete(
    userId: string,
    fileId: string
  ) {
    return withDeletionOperationLock(async () => {

    const file = await filesRepository.findById(
      userId,
      fileId
    );

    if (!file) {

      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "파일을 찾을 수 없습니다."
      );
    }

    // 실제 파일을 삭제하기 전에 복구 기록을 생성합니다.
    // 기록 생성이 실패하면 DB 데이터는 변경하지 않습니다.
    try {

      await createPendingDeletion({
        fileId,
        ownerId: userId,
        storageKey: file.storageKey
      });

    } catch (error) {

      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "EEXIST") {

        throw new AppError(
          409,
          "FILE_DELETION_IN_PROGRESS",
          "파일 삭제 작업이 진행 중이거나 복구 대기 중입니다."
        );
      }

      throw error;
    }

    // DB 메타데이터를 먼저 삭제합니다.
    // DB 작업에 실패하면 실제 파일은 그대로 유지합니다.
    // 결과가 불확실할 수 있으므로 삭제 기록도 유지합니다.
    const result = await filesRepository.delete(
      userId,
      fileId
    );

    if (result.count !== 1) {

      throw new AppError(
        404,
        "FILE_NOT_FOUND",
        "파일을 찾을 수 없습니다."
      );
    }

    let cleanupPending = false;

    try {

      // DB 삭제에 성공한 경우에만 실제 파일을 삭제합니다.
      await storage.remove(file.storageKey);

      // 파일 정리가 끝났으므로 복구 기록을 제거합니다.
      await removePendingDeletion(fileId);

    } catch (error) {

      // DB 삭제는 이미 완료되었습니다.
      // 삭제 기록을 유지하여 이후 복구할 수 있도록 합니다.
      cleanupPending = true;

      logger.error(
        {
          err: error,
          fileId,
          ownerId: userId
        },
        "파일 메타데이터 삭제 후 저장소 정리가 완료되지 않았습니다."
      );
    }

    return {
      id: fileId,
      deleted: true,
      cleanupPending
    };
    });
  }
};

