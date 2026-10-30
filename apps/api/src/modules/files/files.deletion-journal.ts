// filepath: apps/api/src/modules/files/files.deletion-journal.ts
// 파일 삭제 기록 서명, 검증 및 프로세스 간 잠금

import crypto from "node:crypto";
import path from "node:path";

import {
  constants
} from "node:fs";

import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  unlink
} from "node:fs/promises";

import {
  setTimeout as sleep
} from "node:timers/promises";

import { env } from "../../config/env";
import { logger } from "../../infrastructure/logger";

export interface PendingFileDeletion {
  fileId: string;
  ownerId: string;
  storageKey: string;
}

interface SignedDeletionRecord extends PendingFileDeletion {
  version: 1;
  signature: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const storageKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i;

const rootDirectory = path.resolve(
  process.cwd(),
  env.UPLOAD_DIR
);

const journalDirectory = path.join(
  rootDirectory,
  ".pending-deletions"
);

const lockPath = path.join(
  journalDirectory,
  ".operations.lock"
);

// ============================================================
// 경로 및 디렉터리 검사
// ============================================================

function journalPath(fileId: string): string {

  if (!uuidPattern.test(fileId)) {
    throw new Error("삭제 기록 ID가 올바르지 않습니다.");
  }

  return path.join(
    journalDirectory,
    `${fileId}.json`
  );
}

async function assertSafeDirectory(
  directory: string
): Promise<void> {

  const stats = await lstat(directory);

  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink()
  ) {
    throw new Error(
      "안전하지 않은 저장소 디렉터리입니다."
    );
  }
}

async function ensureDirectories(): Promise<void> {

  await mkdir(rootDirectory, {
    recursive: true,
    mode: 0o700
  });

  await assertSafeDirectory(rootDirectory);

  try {

    await mkdir(journalDirectory, {
      mode: 0o700
    });

  } catch (error) {

    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code !== "EEXIST") {
      throw error;
    }
  }

  await assertSafeDirectory(journalDirectory);
}

// ============================================================
// 삭제 기록 서명
// ============================================================

// JWT 비밀키에서 별도 용도의 서명 키를 유도합니다.
// JWT 비밀키 변경 시 기존 기록은 자동 검증되지 않습니다.

function signingKey(): Buffer {

  return crypto.createHmac(
    "sha256",
    env.JWT_ACCESS_SECRET
  )
    .update("secure-starter:file-deletion:v1")
    .digest();
}

function createSignature(
  entry: PendingFileDeletion
): string {

  const content = [
    "1",
    entry.fileId,
    entry.ownerId,
    entry.storageKey
  ].join("\n");

  return crypto.createHmac(
    "sha256",
    signingKey()
  )
    .update(content)
    .digest("hex");
}

function validEntry(
  value: unknown
): value is PendingFileDeletion {

  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const entry = value as Partial<PendingFileDeletion>;

  return (
    typeof entry.fileId === "string" &&
    uuidPattern.test(entry.fileId) &&
    typeof entry.ownerId === "string" &&
    uuidPattern.test(entry.ownerId) &&
    typeof entry.storageKey === "string" &&
    storageKeyPattern.test(entry.storageKey)
  );
}

function verifyRecord(
  value: unknown
): value is SignedDeletionRecord {

  if (!validEntry(value)) {
    return false;
  }

const record = value as PendingFileDeletion & Partial<SignedDeletionRecord>;

  if (
    record.version !== 1 ||
    typeof record.signature !== "string" ||
    !/^[0-9a-f]{64}$/i.test(record.signature)
  ) {
    return false;
  }

  const expected = Buffer.from(
    createSignature(record),
    "hex"
  );

  const received = Buffer.from(
    record.signature,
    "hex"
  );

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

// ============================================================
// 안전한 기록 읽기
// ============================================================

async function readSafeRecord(
  fileId: string
): Promise<SignedDeletionRecord> {

  const target = journalPath(fileId);

  const before = await lstat(target);

  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > 4096
  ) {
    throw new Error("안전하지 않은 삭제 기록입니다.");
  }

  const flags =
    constants.O_RDONLY |
    (constants.O_NOFOLLOW ?? 0);

  const handle = await open(target, flags);

  try {

    const after = await handle.stat();

    if (
      !after.isFile() ||
      after.nlink !== 1 ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size > 4096
    ) {
      throw new Error(
        "삭제 기록 파일이 변경되었습니다."
      );
    }

    const content = await handle.readFile({
      encoding: "utf8"
    });

    const record: unknown = JSON.parse(content);

    if (
      !verifyRecord(record) ||
      record.fileId !== fileId
    ) {
      throw new Error(
        "삭제 기록 서명 검증에 실패했습니다."
      );
    }

    return record;

  } finally {

    await handle.close();
  }
}

// ============================================================
// 삭제 기록 생성
// ============================================================

export async function createPendingDeletion(
  entry: PendingFileDeletion
): Promise<void> {

  if (!validEntry(entry)) {
    throw new Error("삭제 예정 기록이 올바르지 않습니다.");
  }

  await ensureDirectories();

  const record: SignedDeletionRecord = {
    version: 1,
    fileId: entry.fileId,
    ownerId: entry.ownerId,
    storageKey: entry.storageKey,
    signature: createSignature(entry)
  };

  const handle = await open(
    journalPath(entry.fileId),
    "wx",
    0o600
  );

  try {

    await handle.writeFile(
      JSON.stringify(record),
      "utf8"
    );

    await handle.sync();

  } finally {

    await handle.close();
  }
}

// ============================================================
// 삭제 기록 제거
// ============================================================

export async function removePendingDeletion(
  fileId: string
): Promise<void> {

  const target = journalPath(fileId);

  try {

    await assertSafeDirectory(rootDirectory);
    await assertSafeDirectory(journalDirectory);

    const stats = await lstat(target);

    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.nlink !== 1
    ) {
      throw new Error(
        "안전하지 않은 삭제 기록은 제거하지 않습니다."
      );
    }

    await unlink(target);

  } catch (error) {

    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }
}

// ============================================================
// 복구 대상 목록
// ============================================================

export async function listPendingDeletions():
  Promise<PendingFileDeletion[]> {

  try {

    await assertSafeDirectory(rootDirectory);
    await assertSafeDirectory(journalDirectory);

  } catch (error) {

    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const filenames = await readdir(journalDirectory);

  const result: PendingFileDeletion[] = [];

  for (const filename of filenames.sort()) {

    if (!filename.endsWith(".json")) {
      continue;
    }

    const fileId = filename.slice(0, -5);

    if (!uuidPattern.test(fileId)) {
      continue;
    }

    try {

      const record = await readSafeRecord(fileId);

      result.push({
        fileId: record.fileId,
        ownerId: record.ownerId,
        storageKey: record.storageKey
      });

    } catch (error) {

      // 위조되거나 손상된 기록은 보존합니다.
      logger.error(
        {
          err: error,
          fileId
        },
        "삭제 기록 검증 실패: 자동 복구를 차단했습니다."
      );
    }
  }

  return result;
}

// ============================================================
// 프로세스 간 파일 잠금
// ============================================================

// 같은 로컬 디스크를 공유하는 API 프로세스를 보호합니다.
// 잠금이 남아 있는 경우 임의로 제거하지 않습니다.
// 서버 비정상 종료 시 운영자가 상태를 확인해야 합니다.

export async function withCrossProcessDeletionLock<T>(
  operation: () => Promise<T>
): Promise<T> {

  await ensureDirectories();

  const token = [
    process.pid,
    Date.now(),
    crypto.randomUUID()
  ].join(":");

  let acquired = false;

  for (let attempt = 0; attempt < 50; attempt++) {

    try {

      const handle = await open(
        lockPath,
        "wx",
        0o600
      );

      try {

        await handle.writeFile(token, "utf8");
        await handle.sync();

      } finally {

        await handle.close();
      }

      acquired = true;
      break;

    } catch (error) {

      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code !== "EEXIST") {
        throw error;
      }

      await sleep(100);
    }
  }

  if (!acquired) {
    throw new Error(
      "파일 삭제 잠금을 획득하지 못했습니다. 잠금 상태를 확인해 주세요."
    );
  }

  try {

    return await operation();

  } finally {

    // 다른 작업의 잠금을 잘못 제거하지 않도록 검사합니다.
    const currentToken = await readFile(
      lockPath,
      "utf8"
    );

    if (currentToken !== token) {
      throw new Error(
        "파일 삭제 잠금 정보가 변경되었습니다."
      );
    }

    await unlink(lockPath);
  }
}

