// filepath: apps/api/src/modules/files/files.delete.test.ts
// 파일 삭제 순서, DB 오류 및 저장소 오류 검증

import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findDeletionConflict: vi.fn(),
  deleteRecord: vi.fn(),
  removeFile: vi.fn(),
  createJournal: vi.fn(),
  removeJournal: vi.fn(),
  listJournal: vi.fn(),
  logError: vi.fn()
}));

vi.mock("./files.repository", () => ({
  filesRepository: {
    findById: mocks.findById,
    findDeletionConflict: mocks.findDeletionConflict,
    delete: mocks.deleteRecord
  }
}));

vi.mock("./storage/local.storage", () => ({
  LocalFileStorage: class {
    remove = mocks.removeFile;
  }
}));

vi.mock("./files.deletion-journal", () => ({
  createPendingDeletion: mocks.createJournal,
  removePendingDeletion: mocks.removeJournal,
  listPendingDeletions: mocks.listJournal,
  withCrossProcessDeletionLock:
    (operation: () => Promise<unknown>) => operation()
}));

vi.mock("../../infrastructure/logger", () => ({
  logger: {
    error: mocks.logError
  }
}));

import { filesService } from "./files.service";

const userId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";

const storageKey =
  "33333333-3333-4333-8333-333333333333.png";

beforeEach(() => {

  vi.resetAllMocks();

  mocks.findById.mockResolvedValue({
    id: fileId,
    ownerId: userId,
    storageKey
  });

  mocks.deleteRecord.mockResolvedValue({
    count: 1
  });

  mocks.createJournal.mockResolvedValue(undefined);
  mocks.removeJournal.mockResolvedValue(undefined);
  mocks.removeFile.mockResolvedValue(undefined);
  mocks.listJournal.mockResolvedValue([]);
});

describe("파일 삭제 안정성", () => {

  it("DB 삭제 후 실제 파일을 삭제합니다.", async () => {

    const result = await filesService.delete(
      userId,
      fileId
    );

    expect(result).toEqual({
      id: fileId,
      deleted: true,
      cleanupPending: false
    });

    expect(mocks.createJournal).toHaveBeenCalledOnce();
    expect(mocks.deleteRecord).toHaveBeenCalledOnce();
    expect(mocks.removeFile).toHaveBeenCalledWith(storageKey);
    expect(mocks.removeJournal).toHaveBeenCalledWith(fileId);

    const journalOrder =
      mocks.createJournal.mock.invocationCallOrder[0];

    const dbOrder =
      mocks.deleteRecord.mock.invocationCallOrder[0];

    const fileOrder =
      mocks.removeFile.mock.invocationCallOrder[0];

    expect(journalOrder).toBeLessThan(dbOrder);
    expect(dbOrder).toBeLessThan(fileOrder);
  });

  it("DB 삭제 실패 시 실제 파일을 유지합니다.", async () => {

    mocks.deleteRecord.mockRejectedValueOnce(
      new Error("DB 오류")
    );

    await expect(
      filesService.delete(userId, fileId)
    ).rejects.toThrow("DB 오류");

    expect(mocks.removeFile).not.toHaveBeenCalled();

    // DB 결과가 불확실하므로 복구 기록을 유지합니다.
    expect(mocks.removeJournal).not.toHaveBeenCalled();
  });

  it("실제 파일 삭제 실패 시 복구 기록을 유지합니다.", async () => {

    mocks.removeFile.mockRejectedValueOnce(
      new Error("저장소 오류")
    );

    const result = await filesService.delete(
      userId,
      fileId
    );

    expect(result.cleanupPending).toBe(true);

    expect(mocks.removeJournal).not.toHaveBeenCalled();

    expect(mocks.logError).toHaveBeenCalled();
  });

  it("존재하지 않는 파일은 삭제하지 않습니다.", async () => {

    mocks.findById.mockResolvedValueOnce(null);

    await expect(
      filesService.delete(userId, fileId)
    ).rejects.toThrow();

    expect(mocks.createJournal).not.toHaveBeenCalled();
    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("삭제 기록 생성 실패 시 DB를 변경하지 않습니다.", async () => {

    mocks.createJournal.mockRejectedValueOnce(
      new Error("기록 생성 실패")
    );

    await expect(
      filesService.delete(userId, fileId)
    ).rejects.toThrow();

    expect(mocks.deleteRecord).not.toHaveBeenCalled();
    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("DB 삭제 건수가 0이면 실제 파일을 삭제하지 않습니다.", async () => {

    mocks.deleteRecord.mockResolvedValueOnce({
      count: 0
    });

    await expect(
      filesService.delete(userId, fileId)
    ).rejects.toThrow();

    expect(mocks.removeFile).not.toHaveBeenCalled();
  });

  it("삭제 기록 정리 실패 시 복구 대기 상태를 반환합니다.", async () => {

    mocks.removeJournal.mockRejectedValueOnce(
      new Error("기록 정리 실패")
    );

    const result = await filesService.delete(
      userId,
      fileId
    );

    expect(result.cleanupPending).toBe(true);

    expect(mocks.removeFile).toHaveBeenCalledOnce();
  });
});

