import { Router } from "express";
import {farmCreateOnce} from './farm-idempotency';
import { prisma } from "../../infrastructure/prisma";
import { requireAuth } from "../../common/auth.middleware";
import { asyncHandler, validate, uuidSchema } from "../../common/validate";
import { success } from "../../common/response";
import { AppError } from "../../common/app-error";
import { farmInput, farmUpdate, diaryInput, diaryUpdate, diaryParams, versionInput, listQuery } from "./farms.dto";

export const farmsRouter = Router();
farmsRouter.use(requireAuth);
const missing = () => new AppError(404, "FARM_NOT_FOUND", "농장 또는 영농일지를 찾을 수 없습니다.");
const stale = () => new AppError(409, "VERSION_CONFLICT", "다른 변경이 있습니다. 목록을 새로 불러온 뒤 다시 시도해 주세요.");

farmsRouter.get('/archived',asyncHandler(async(req,res)=>{
  success(res,await prisma.farm.findMany({where:{ownerId:req.userId!,deletedAt:{not:null}},orderBy:{deletedAt:'desc'},take:100}));
}));
farmsRouter.post('/:id/restore',validate('params',uuidSchema),validate('body',versionInput),asyncHandler(async(req,res)=>{
  const farm=await prisma.$transaction(async tx=>{
    const where={id:req.params.id!,ownerId:req.userId!,deletedAt:{not:null}};
    if(!await tx.farm.findFirst({where}))throw missing();
    if(!(await tx.farm.updateMany({where:{...where,version:req.body.version},data:{deletedAt:null,version:{increment:1}}})).count)throw stale();
    await tx.auditEvent.create({data:{actorId:req.userId!,action:'FARM_RESTORE',targetId:req.params.id!}});
    return tx.farm.findUniqueOrThrow({where:{id:req.params.id!}});
  });success(res,farm);
}));
farmsRouter.get('/:id/diary/archived',validate('params',uuidSchema),asyncHandler(async(req,res)=>{
  if(!await prisma.farm.findFirst({where:{id:req.params.id!,ownerId:req.userId!,deletedAt:null}}))throw missing();
  success(res,await prisma.farmDiary.findMany({where:{farmId:req.params.id!,deletedAt:{not:null},farm:{ownerId:req.userId!,deletedAt:null}},orderBy:{deletedAt:'desc'},take:100}));
}));
farmsRouter.post('/:id/diary/:entryId/restore',validate('params',diaryParams),validate('body',versionInput),asyncHandler(async(req,res)=>{
  const entry=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Farm" WHERE "id"=${req.params.id!} AND "ownerId"=${req.userId!} AND "deletedAt" IS NULL FOR UPDATE`;
    if(!rows.length)throw missing();
    const where={id:req.params.entryId!,farmId:req.params.id!,deletedAt:{not:null}};
    if(!await tx.farmDiary.findFirst({where}))throw missing();
    if(!(await tx.farmDiary.updateMany({where:{...where,version:req.body.version},data:{deletedAt:null,version:{increment:1}}})).count)throw stale();
    await tx.auditEvent.create({data:{actorId:req.userId!,action:'DIARY_RESTORE',targetId:req.params.entryId!}});
    return tx.farmDiary.findUniqueOrThrow({where:{id:req.params.entryId!}});
  });success(res,entry);
}));

farmsRouter.get("/", validate("query", listQuery), asyncHandler(async (req, res) => {
  const { page } = req.validated!.query as { page: number };
  const where = { ownerId: req.userId!, deletedAt: null };
  const [items, total] = await prisma.$transaction([
    prisma.farm.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
    prisma.farm.count({ where })
  ]);
  success(res, { items, total, page, totalPages: Math.max(1, Math.ceil(total / 20)) });
}));
farmsRouter.post("/", validate("body", farmInput), asyncHandler(async (req, res) => {
  const farm = await prisma.$transaction(async tx => {
    // 아직 농장 행이 없으므로 계정 행 잠금으로 같은 생성 키를 직렬화합니다.
    const owner=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "User" WHERE "id"=${req.userId!} AND "deletedAt" IS NULL AND "suspendedAt" IS NULL FOR UPDATE`;
    if(!owner.length)throw new AppError(401,'ACCOUNT_UNAVAILABLE','계정 상태를 확인해 주세요.');
    return farmCreateOnce(tx,`farm:${req.userId!}`,req.get('Idempotency-Key'),req.body,async()=>{
      const result = await tx.farm.create({ data: { ...req.body, ownerId: req.userId! } });
      await tx.auditEvent.create({ data: { actorId: req.userId!, action: "FARM_CREATE", targetId: result.id } });
      return result;
    });
  });
  success(res, farm, "농장을 등록했습니다.", 201);
}));
farmsRouter.get("/:id", validate("params", uuidSchema), asyncHandler(async (req, res) => {
  const farm = await prisma.farm.findFirst({ where: { id: req.params.id, ownerId: req.userId!, deletedAt: null } });
  if (!farm) throw missing();
  success(res, farm);
}));
// 소유자와 버전 조건을 같은 UPDATE에 포함해 권한 검사 이후 경쟁 상태를 막습니다.
for (const method of ["put", "delete"] as const) {
  farmsRouter[method]("/:id", validate("params", uuidSchema), validate("body", method === "put" ? farmUpdate : versionInput), asyncHandler(async (req, res) => {
    const { version, ...input } = req.body;
    const result = await prisma.$transaction(async tx => {
      const where = { id: req.params.id, ownerId: req.userId!, deletedAt: null };
      if (!await tx.farm.findFirst({ where })) throw missing();
      const changed = await tx.farm.updateMany({ where: { ...where, version }, data: {
        ...(method === "put" ? input : { deletedAt: new Date() }), version: { increment: 1 }
      } });
      if (!changed.count) throw stale();
      await tx.auditEvent.create({ data: { actorId: req.userId!, action: method === "put" ? "FARM_UPDATE" : "FARM_ARCHIVE", targetId: req.params.id } });
      return tx.farm.findUniqueOrThrow({ where: { id: req.params.id } });
    });
    success(res, result);
  }));
}
farmsRouter.get("/:id/diary", validate("params", uuidSchema), validate("query", listQuery), asyncHandler(async (req, res) => {
  const farm = { id: req.params.id, ownerId: req.userId!, deletedAt: null };
  if (!await prisma.farm.findFirst({ where: farm })) throw missing();
  const { page } = req.validated!.query as { page: number };
  const where = { farmId: req.params.id, deletedAt: null, farm };
  const [items, total] = await prisma.$transaction([
    prisma.farmDiary.findMany({ where, orderBy: [{ workDate: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
    prisma.farmDiary.count({ where })
  ]);
  success(res, { items, total, page, totalPages: Math.max(1, Math.ceil(total / 20)) });
}));
farmsRouter.post("/:id/diary", validate("params", uuidSchema), validate("body", diaryInput), asyncHandler(async (req, res) => {
  const entry = await prisma.$transaction(async tx => {
    // 농장 보관 처리와 일지 생성이 동시에 실행되지 않도록 농장 행을 잠급니다.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Farm" WHERE "id"=${req.params.id} AND "ownerId"=${req.userId!} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw missing();
    return farmCreateOnce(tx,`diary:${req.userId}:${req.params.id}`,req.get('Idempotency-Key'),req.body,async()=>{
      const result = await tx.farmDiary.create({ data: { ...req.body, farmId: req.params.id } });
      await tx.auditEvent.create({ data: { actorId: req.userId!, action: "DIARY_CREATE", targetId: result.id } });
      return result;
    });
  });
  success(res, entry, "영농일지를 등록했습니다.", 201);
}));
// 모바일 상세 화면도 기존 소유자 정책으로 개별 일지를 조회합니다.
farmsRouter.get('/:id/diary/:entryId',validate('params',diaryParams),asyncHandler(async(req,res)=>{
  const entry=await prisma.farmDiary.findFirst({where:{id:req.params.entryId!,farmId:req.params.id!,deletedAt:null,farm:{ownerId:req.userId!,deletedAt:null}}});
  if(!entry)throw missing();success(res,entry);
}));
for (const method of ["put", "delete"] as const) {
  farmsRouter[method]("/:id/diary/:entryId", validate("params", diaryParams), validate("body", method === "put" ? diaryUpdate : versionInput), asyncHandler(async (req, res) => {
    const { version, ...input } = req.body;
    const entry = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Farm" WHERE "id"=${req.params.id} AND "ownerId"=${req.userId!} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!rows.length) throw missing();
      const where = { id: req.params.entryId, farmId: req.params.id, deletedAt: null };
      if (!await tx.farmDiary.findFirst({ where })) throw missing();
      const changed = await tx.farmDiary.updateMany({ where: { ...where, version }, data: {
        ...(method === "put" ? input : { deletedAt: new Date() }), version: { increment: 1 }
      } });
      if (!changed.count) throw stale();
      await tx.auditEvent.create({ data: { actorId: req.userId!, action: method === "put" ? "DIARY_UPDATE" : "DIARY_ARCHIVE", targetId: req.params.entryId } });
      return tx.farmDiary.findUniqueOrThrow({ where: { id: req.params.entryId } });
    });
    success(res, entry);
  }));
}
