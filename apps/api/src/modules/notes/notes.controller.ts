import { createNoteOnce } from "./notes.idempotency";
import { prisma } from "../../infrastructure/prisma";
import { AppError } from "../../common/app-error";
// filepath: apps/api/src/modules/notes/notes.controller.ts - 게시글 등록, 조회, 수정, 삭제 REST API 라우터
import {
  Router
} from "express";

import {
  requireAuth
} from "../../common/auth.middleware";

import {
  validate,
  asyncHandler,
  uuidSchema
} from "../../common/validate";

import {
  success
} from "../../common/response";

import {
  createNoteSchema,
  replaceNoteSchema,
  updateNoteSchema,
  listNotesSchema
} from "./notes.dto";

import type {
  CreateNoteInput,
  ReplaceNoteInput,
  UpdateNoteInput,
  ListNotesQuery
} from "./notes.dto";

import {
  notesService
} from "./notes.service";

// ============================================================
// 라우터 생성
// ============================================================

export const notesRouter = Router();

// 모든 게시글 API에 JWT 인증을 적용합니다.
notesRouter.use(requireAuth);
notesRouter.get("/trash", asyncHandler(async (req, res) => {
  success(res, await prisma.note.findMany({ where: { ownerId: req.userId!, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" }, take: 100, select: { id: true, title: true, deletedAt: true, version: true } }));
}));

// ============================================================
// POST /api/v1/notes
// 게시글 등록
// ============================================================

notesRouter.post(
  "/",

  validate("body", createNoteSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const input = req.body as CreateNoteInput;

    const key = req.headers["idempotency-key"];
    const note = typeof key === "string" ? await createNoteOnce(userId, key, input) : await notesService.create(userId, input);

    success(
      res,
      note,
      "게시글이 등록되었습니다.",
      201
    );
  })
);

// ============================================================
// GET /api/v1/notes
// 게시글 목록 조회
// ============================================================

notesRouter.get(
  "/",

  validate("query", listNotesSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const query = req.validated?.query as ListNotesQuery;

    const result = await notesService.list(
      userId,
      query
    );

    success(
      res,
      result,
      "게시글 목록을 조회했습니다."
    );
  })
);

// ============================================================
// GET /api/v1/notes/:id
// 게시글 상세 조회
// ============================================================

notesRouter.get(
  "/:id",

  validate("params", uuidSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const note = await notesService.getById(
      userId,
      params.id
    );

    success(
      res,
      note,
      "게시글을 조회했습니다."
    );
  })
);

// ============================================================
// PUT /api/v1/notes/:id
// 게시글 전체 수정
// ============================================================

notesRouter.put(
  "/:id",

  validate("params", uuidSchema),

  validate("body", replaceNoteSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const input = req.body as ReplaceNoteInput;

    const note = await notesService.replace(
      userId,
      params.id,
      input
    );

    success(
      res,
      note,
      "게시글이 수정되었습니다."
    );
  })
);

// ============================================================
// PATCH /api/v1/notes/:id
// 게시글 부분 수정
// ============================================================

notesRouter.patch(
  "/:id",

  validate("params", uuidSchema),

  validate("body", updateNoteSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const input = req.body as UpdateNoteInput;

    const note = await notesService.update(
      userId,
      params.id,
      input
    );

    success(
      res,
      note,
      "게시글이 수정되었습니다."
    );
  })
);

// ============================================================
// DELETE /api/v1/notes/:id
// 게시글 삭제
// ============================================================

notesRouter.delete(
  "/:id",

  validate("params", uuidSchema),

  asyncHandler(async (req, res) => {

    const userId = req.userId!;

    const params = req.validated?.params as {
      id: string;
    };

    const result = await notesService.delete(
      userId,
      params.id
    );

    success(
      res,
      result,
      "게시글이 삭제되었습니다."
    );
  })
);


notesRouter.post("/:id/restore", validate("params", uuidSchema), asyncHandler(async (req, res) => {
  const params = req.validated!.params as { id: string };
  const result = await prisma.note.updateMany({ where: { id: params.id, ownerId: req.userId!, deletedAt: { not: null } }, data: { deletedAt: null, version: { increment: 1 } } });
  if (result.count !== 1) throw new AppError(404, "NOTE_NOT_FOUND", "복구할 게시글을 찾을 수 없습니다.");
  success(res, { restored: true });
}));
