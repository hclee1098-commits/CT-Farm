import { beforeEach, describe, expect, it, vi } from "vitest";
import { filesService } from "./files.service";
const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), create: vi.fn(), duplicate: vi.fn() }));
vi.mock("./files.repository", () => ({ filesRepository: { create: mocks.create, findDuplicate: mocks.duplicate } }));
vi.mock("./storage/local.storage", () => ({ LocalFileStorage: class { save = mocks.save; remove = mocks.remove; } }));
vi.mock("../../infrastructure/logger", () => ({ logger: { error: vi.fn() } }));
const file = { originalname: "sample.pdf", mimetype: "application/pdf", size: Buffer.byteLength("%PDF-1.7\nfixture document\n%%EOF"), buffer: Buffer.from("%PDF-1.7\nfixture document\n%%EOF") } as Express.Multer.File;
beforeEach(() => { vi.resetAllMocks(); mocks.duplicate.mockResolvedValue(null); mocks.save.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined); });
describe("업로드 실패 보상", () => {
  it("저장소 저장 실패 시 DB를 변경하지 않습니다", async () => {
    mocks.save.mockRejectedValue(new Error("의도한 디스크 실패"));
    await expect(filesService.upload("u1", file)).rejects.toThrow("의도한 디스크 실패"); expect(mocks.save).toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("DB 저장 실패 시 방금 저장한 파일만 정리합니다", async () => {
    mocks.create.mockRejectedValue(new Error("의도한 DB 실패"));
    await expect(filesService.upload("u1", file)).rejects.toThrow("의도한 DB 실패");
    expect(mocks.remove).toHaveBeenCalledWith(mocks.save.mock.calls[0]![0]);
  });
  it("기존 사용자 소유 중복 파일은 다시 저장하지 않습니다", async () => {
    mocks.duplicate.mockResolvedValue({ id: "existing" });
    expect(await filesService.upload("u1", file)).toEqual({ id: "existing" }); expect(mocks.save).not.toHaveBeenCalled();
  });
});
