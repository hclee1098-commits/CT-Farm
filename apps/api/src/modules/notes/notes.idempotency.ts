import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/prisma";
import { AppError } from "../../common/app-error";
import type { CreateNoteInput } from "./notes.dto";
export async function createNoteOnce(userId: string, key: string, input: CreateNoteInput) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new AppError(400, "INVALID_IDEMPOTENCY_KEY", "중복 방지 키는 16~128자의 영숫자, 밑줄, 하이픈이어야 합니다.");
  const scope = `notes:${userId}`;
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ title: input.title, content: input.content })).digest("hex");
  const cached = await prisma.idempotentRequest.findUnique({ where: { scope_key: { scope, key } } });
  if (cached) {
    if (cached.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "같은 키를 다른 내용에 사용할 수 없습니다.");
    return cached.response;
  }
  try {
    return await prisma.$transaction(async tx => {
      // 키와 자원 생성은 동일 트랜잭션으로 커밋됩니다.
      await tx.idempotentRequest.create({ data: { scope, key, requestHash, response: {} } });
      const note = await tx.note.create({ data: { ownerId: userId, ...input }, select: { id: true, title: true, content: true, createdAt: true, updatedAt: true, deletedAt: true, version: true } });
      const response = JSON.parse(JSON.stringify(note)) as Prisma.InputJsonValue;
      await tx.idempotentRequest.update({ where: { scope_key: { scope, key } }, data: { response } });
      return response;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.idempotentRequest.findUnique({ where: { scope_key: { scope, key } } });
      if (winner && winner.requestHash === requestHash) return winner.response;
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "중복 요청의 내용이 일치하지 않습니다.");
    }
    throw error;
  }
}
