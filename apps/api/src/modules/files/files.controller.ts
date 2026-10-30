import { thumbnail } from "./image.processing";
import { prisma } from "../../infrastructure/prisma";
import { AppError } from "../../common/app-error";
// filepath: apps/api/src/modules/files/files.controller.ts - 파일 업로드, 다운로드, 조회 및 삭제 REST API 라우터
import { connectRedis as ensureRateLimitRedis } from "../../infrastructure/redis";
import {
  Router
} from "express";

import multer from "multer";

import {
  rateLimit
} from "express-rate-limit";

import {
  RedisStore
} from "rate-limit-redis";

import {
  pipeline
} from "node:stream/promises";

import {
  requireAuth
} from "../../common/auth.middleware";

import {
  validate,
  asyncHandler,
  uuidSchema
} from "../../common/validate";

import {
  success,
  failure
} from "../../common/response";

import {
  redis
} from "../../infrastructure/redis";

import {
  MAX_FILE_SIZE,
  listFilesSchema
} from "./files.dto";

import type {
  ListFilesQuery
} from "./files.dto";

import {
  filesService
} from "./files.service";

// ============================================================
// 파일 라우터
// ============================================================

export const filesRouter = Router();

// 모든 파일 API는 인증이 필요합니다.
filesRouter.use(requireAuth);
filesRouter.get("/trash", asyncHandler(async (req, res) => {
  success(res, await prisma.storedFile.findMany({ where: { ownerId: req.userId!, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" }, take: 100, select: { id: true, originalName: true, size: true, deletedAt: true } }));
}));
filesRouter.post("/:id/restore", validate("params", uuidSchema), asyncHandler(async (req, res) => {
  const id = (req.validated!.params as { id: string }).id;
  const restored = await prisma.storedFile.updateMany({ where: { id, ownerId: req.userId!, deletedAt: { not: null } }, data: { deletedAt: null } });
  if (restored.count !== 1) throw new AppError(404, "FILE_NOT_FOUND", "복구할 파일을 찾을 수 없습니다.");
  success(res, { restored: true });
}));

// 인증된 파일 API 요청에서 미완료 삭제 기록을 확인합니다.
filesRouter.use(
  asyncHandler(async (_req, _res, next) => {

    await filesService.recoverPendingDeletions();

    next();
  })
);

// ============================================================
// 업로드 요청 제한
// ============================================================

// 일반 API 요청 제한과 별도로
// 파일 업로드 요청 횟수를 제한합니다.

const uploadLimiter = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 20,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  store: new RedisStore({

    prefix: "rate:file-upload:",

    sendCommand: async (...args: string[]) => {
      await ensureRateLimitRedis();
      return await redis.sendCommand(args);
    }

  }),

  handler: (_req, res) => {

    failure(
      res,
      429,
      "UPLOAD_RATE_LIMITED",
      "파일 업로드 요청이 너무 많습니다."
    );
  }
});

// ============================================================
// Multer 업로드 설정
// ============================================================

// 메모리에 임시 저장한 후 파일 검증을 수행합니다.
// 최대 5MB로 제한하여 메모리 사용량을 제한합니다.

const upload = multer({

  storage: multer.memoryStorage(),

  limits: {

    fileSize: MAX_FILE_SIZE,

    files: 1,

    fields: 0,

    parts: 1

  }

});

// ============================================================
// POST /api/v1/files
// 파일 업로드
// ============================================================

filesRouter.post(
  "/",

  uploadLimiter,

  upload.single("file"),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const result = await filesService.upload(
      userId,
      req.file
    );

    success(
      res,
      result,
      "파일이 업로드되었습니다.",
      201
    );
  })
);

// ============================================================
// GET /api/v1/files
// 파일 목록 조회
// ============================================================

filesRouter.get(
  "/",

  validate("query", listFilesSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const query = req.validated?.query as ListFilesQuery;

    const result = await filesService.list(
      userId,
      query
    );

    success(
      res,
      result,
      "파일 목록을 조회했습니다."
    );
  })
);

// ============================================================
// GET /api/v1/files/:id
// 파일 상세 조회
// ============================================================

filesRouter.get(
  "/:id",

  validate("params", uuidSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const result = await filesService.getById(
      userId,
      params.id
    );

    success(
      res,
      result,
      "파일 정보를 조회했습니다."
    );
  })
);

// ============================================================
// GET /api/v1/files/:id/download
// 파일 다운로드
// ============================================================

filesRouter.get(
  "/:id/download",

  validate("params", uuidSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const result = await filesService.download(
      userId,
      params.id
    );

    // UTF-8 파일명을 RFC 5987 형식으로 인코딩합니다.
    const encodedName = encodeURIComponent(
      result.originalName
    ).replace(
      /['()*]/g,
      (character) =>
        "%" +
        character.charCodeAt(0)
          .toString(16)
          .toUpperCase()
    );

    // ASCII 대체 파일명
    const fallbackName = "download";

    // 브라우저가 파일을 직접 실행하거나
    // HTML로 해석하지 않도록 강제 다운로드합니다.
    res.setHeader(
      "Content-Type",
      "application/octet-stream"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.setHeader(
      "Cache-Control",
      "private, no-store"
    );

    res.setHeader(
      "Content-Length",
      String(result.size)
    );

    // 스트림 방식으로 다운로드합니다.
    // 파일 전체를 응답 메모리에 올리지 않습니다.
    await pipeline(
      result.stream,
      res
    );
  })
);

// ============================================================
// DELETE /api/v1/files/:id
// 파일 삭제
// ============================================================

filesRouter.delete(
  "/:id",

  validate("params", uuidSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const result = await prisma.storedFile.updateMany({ where: { id: params.id, ownerId: userId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (result.count !== 1) throw new AppError(404, "FILE_NOT_FOUND", "파일을 찾을 수 없습니다.");

    success(
      res,
      result,
      "파일이 삭제되었습니다."
    );
  })
);


filesRouter.get("/:id/thumbnail", validate("params", uuidSchema), asyncHandler(async (req, res) => {
  const file = await filesService.download(req.userId!, (req.validated!.params as { id: string }).id);
  if (!file.mimeType.startsWith("image/")) { file.stream.destroy(); throw new AppError(400, "IMAGE_REQUIRED", "이미지 파일만 썸네일을 지원합니다."); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of file.stream) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > MAX_FILE_SIZE) { file.stream.destroy(); throw new AppError(413, "FILE_TOO_LARGE", "허용 파일 크기를 초과했습니다."); }
    chunks.push(buffer);
  }
  const image = await thumbnail(Buffer.concat(chunks));
  res.type("image/webp").send(image);
}));

const batchUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: 5, fields: 0, parts: 5 } });
filesRouter.post("/batch", uploadLimiter, batchUpload.array("files", 5), asyncHandler(async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) throw new AppError(400, "FILE_REQUIRED", "파일을 선택해 주세요.");
  const results = [];
  for (const file of files) {
    try { results.push({ success: true, data: await filesService.upload(req.userId!, file) }); }
    catch (error) { results.push({ success: false, errorCode: error instanceof AppError ? error.errorCode : "UPLOAD_FAILED", message: error instanceof AppError ? error.message : "파일을 저장하지 못했습니다." }); }
  }
  success(res, { results, atomic: false }, "파일별 처리 결과를 확인해 주세요.", 207);
}));
