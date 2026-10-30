// filepath: apps/api/src/modules/files/files.deletion-lock.test.ts
// 파일 삭제 동시성 및 복구 재시도 검증

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

const entry = {
  fileId,
  ownerId: userId,
  storageKey
};

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
  mocks.findDeletionConflict.mockResolvedValue(null);

});

describe("파일 삭제 복구 및 동시성", () => {

  it("DB 삭제 실패 후 복구하고 다시 삭제합니다.", async () => {

    mocks.deleteRecord.mockRejectedValueOnce(
      new Error("DB 오류")
    );

    await expect(
      filesService.delete(userId, fileId)
    ).rejects.toThrow("DB 오류");

    mocks.listJournal.mockResolvedValueOnce([
      entry
    ]);

    await filesService.recoverPendingDeletions();

    expect(mocks.removeJournal)
      .toHaveBeenCalledWith(fileId);

    expect(mocks.removeFile)
      .not.toHaveBeenCalled();

    const result = await filesService.delete(
      userId,
      fileId
    );

    expect(result.deleted).toBe(true);

  });

  it("저장소 삭제 실패 후 복구를 재시도합니다.", async () => {

    mocks.removeFile.mockRejectedValueOnce(
      new Error("저장소 오류")
    );

    const result = await filesService.delete(
      userId,
      fileId
    );

    expect(result.cleanupPending).toBe(true);

    // DB 메타데이터는 이미 삭제된 상태입니다.
    mocks.findById.mockResolvedValueOnce(null);

    mocks.listJournal.mockResolvedValueOnce([
      entry
    ]);

    await filesService.recoverPendingDeletions();

    expect(mocks.removeFile)
      .toHaveBeenCalledTimes(2);

    expect(mocks.removeJournal)
      .toHaveBeenCalledWith(fileId);

  });

  it("삭제 진행 중 복구 작업이 끼어들지 않습니다.", async () => {

    let releaseJournal!: () => void;

    mocks.createJournal.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseJournal = resolve;
      })
    );

    const deletion = filesService.delete(
      userId,
      fileId
    );

    await vi.waitFor(() => {
      expect(mocks.createJournal).toHaveBeenCalledOnce();
    });

    const recovery =
      filesService.recoverPendingDeletions();

    await Promise.resolve();

    expect(mocks.listJournal)
      .not.toHaveBeenCalled();

    releaseJournal();

    await Promise.all([
      deletion,
      recovery
    ]);

    expect(mocks.listJournal)
      .toHaveBeenCalledOnce();

  });

  it("동일 파일의 동시 삭제를 순서대로 처리합니다.", async () => {

    mocks.findById
      .mockResolvedValueOnce({
        id: fileId,
        ownerId: userId,
        storageKey
      })
      .mockResolvedValueOnce(null);

    const first = filesService.delete(
      userId,
      fileId
    );

    const second = filesService.delete(
      userId,
      fileId
    );

    await Promise.all([
      expect(first).resolves.toMatchObject({
        deleted: true
      }),
      expect(second).rejects.toThrow()
    ]);

    expect(mocks.createJournal)
      .toHaveBeenCalledOnce();

    expect(mocks.deleteRecord)
      .toHaveBeenCalledOnce();

  });


  it("다른 사용자가 사용하는 저장소 파일은 삭제하지 않습니다.", async () => {

    mocks.findById.mockResolvedValueOnce(null);

    mocks.listJournal.mockResolvedValueOnce([
      entry
    ]);

    mocks.findDeletionConflict.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      ownerId: "88888888-8888-4888-8888-888888888888",
      storageKey
    });

    await filesService.recoverPendingDeletions();

    expect(mocks.findDeletionConflict)
      .toHaveBeenCalledWith(fileId, storageKey);

    expect(mocks.removeFile)
      .not.toHaveBeenCalled();

    expect(mocks.removeJournal)
      .not.toHaveBeenCalled();

    expect(mocks.logError)
      .toHaveBeenCalled();

  });

  it("파일 ID가 다른 사용자 데이터와 충돌하면 삭제하지 않습니다.", async () => {

    mocks.findById.mockResolvedValueOnce(null);

    mocks.listJournal.mockResolvedValueOnce([
      entry
    ]);

    mocks.findDeletionConflict.mockResolvedValueOnce({
      id: fileId,
      ownerId: "99999999-9999-4999-8999-999999999999",
      storageKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    });

    await filesService.recoverPendingDeletions();

    expect(mocks.removeFile)
      .not.toHaveBeenCalled();

    expect(mocks.removeJournal)
      .not.toHaveBeenCalled();

  });

  it("DB에서 참조하지 않는 파일은 정상 복구합니다.", async () => {

    mocks.findById.mockResolvedValueOnce(null);

    mocks.listJournal.mockResolvedValueOnce([
      entry
    ]);

    mocks.findDeletionConflict.mockResolvedValueOnce(null);

    await filesService.recoverPendingDeletions();

    expect(mocks.removeFile)
      .toHaveBeenCalledWith(storageKey);

    expect(mocks.removeJournal)
      .toHaveBeenCalledWith(fileId);

  });

  it("DB 참조 검사 실패 시 파일과 복구 기록을 유지합니다.", async () => {

    mocks.findById.mockResolvedValueOnce(null);

    mocks.listJournal.mockResolvedValueOnce([
      entry
    ]);

    mocks.findDeletionConflict.mockRejectedValueOnce(
      new Error("DB 조회 실패")
    );

    await filesService.recoverPendingDeletions();

    expect(mocks.removeFile)
      .not.toHaveBeenCalled();

    expect(mocks.removeJournal)
      .not.toHaveBeenCalled();

    expect(mocks.logError)
      .toHaveBeenCalled();

  });
});

