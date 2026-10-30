import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, link, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileStorage } from "./local.storage";
import { env } from "../../../config/env";
const key = "12345678-1234-4234-8234-123456789012.pdf";
let temp: string;
let storage: LocalFileStorage;
const original = env.UPLOAD_DIR;
beforeEach(async () => {
  temp = await mkdtemp(path.join(tmpdir(), "starter-storage-test-"));
  env.UPLOAD_DIR = path.join(temp, "uploads");
  storage = new LocalFileStorage();
});
afterEach(async () => { env.UPLOAD_DIR = original; await rm(temp, { recursive: true, force: true }); });
describe("실제 디스크 저장소", () => {
  it("저장/스트림 읽기/삭제를 수행합니다", async () => {
    await storage.save(key, Buffer.from("%PDF-test"));
    const opened = await storage.openRead(key);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("%PDF-test"); expect(opened.size).toBe(9);
    await storage.remove(key); await storage.remove(key);
  });
  it("기존 파일은 덮어쓰지 않습니다", async () => {
    await storage.save(key, Buffer.from("original"));
    await expect(storage.save(key, Buffer.from("replacement"))).rejects.toMatchObject({ code: "EEXIST" });
    expect((await readFile(path.join(env.UPLOAD_DIR, key))).toString()).toBe("original");
  });
  it.each(["../secret.pdf", "/tmp/file.pdf", "file.pdf", key + "/../other"])("잘못된 저장 키 %s를 거부합니다", async (invalid) => {
    await expect(storage.save(invalid, Buffer.from("data"))).rejects.toThrow();
    await expect(storage.remove(invalid)).rejects.toThrow();
  });
  it("심볼릭 링크 또는 Windows junction 항목을 읽거나 삭제하지 않습니다", async () => {
    await mkdir(env.UPLOAD_DIR);
    const target = path.join(temp, "protected.pdf"); await writeFile(target, "protected");
    try {
      await symlink(target, path.join(env.UPLOAD_DIR, key));
    } catch (error) {
      // 파일 링크 생성 권한이 없는 Windows에서도 실제 NTFS 재분석 지점을 검사합니다.
      // 권한 이외의 오류는 숨기지 않습니다. 파일 심볼릭 링크 검증을 했다고 주장하지 않습니다.
      if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      const directory = path.join(temp, 'linked-directory'); await mkdir(directory);
      await writeFile(path.join(directory, 'protected.pdf'), 'protected');
      await symlink(directory, path.join(env.UPLOAD_DIR, key), 'junction');
    }
    await expect(storage.openRead(key)).rejects.toThrow(); await expect(storage.remove(key)).rejects.toThrow();
    expect((await readFile(target)).toString()).toBe("protected");
  });
  it("하드 링크 파일을 읽거나 삭제하지 않습니다", async () => {
    await mkdir(env.UPLOAD_DIR);
    const target = path.join(temp, "protected.pdf"); await writeFile(target, "protected");
    await link(target, path.join(env.UPLOAD_DIR, key));
    await expect(storage.openRead(key)).rejects.toThrow(); await expect(storage.remove(key)).rejects.toThrow();
  });
  it("저장 루트가 심볼릭 링크이면 쓰기를 거부합니다", async () => {
    const target = path.join(temp, "protected"); await mkdir(target);
    await symlink(target, env.UPLOAD_DIR, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(storage.save(key, Buffer.from("data"))).rejects.toThrow();
  });
});

