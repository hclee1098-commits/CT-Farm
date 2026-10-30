// filepath: apps/api/src/modules/files/files.deletion-disk.test.ts
// 실제 디스크를 사용하는 파일 삭제 기록 검증

import {
  afterAll,
  describe,
  expect,
  it,
  vi
} from "vitest";

import path from "node:path";

import {
  readFile,
  writeFile,
  symlink,
  rm
} from "node:fs/promises";

// 테스트마다 격리된 임시 저장소를 사용합니다.
const isolated = vi.hoisted(() => ({

  uploadDir:
    (process.env.TEMP ??
      process.env.TMP ??
      process.cwd()) +
    "/secure-starter-disk-test-" +
    process.pid +
    "-" +
    Math.random().toString(36).slice(2)

}));

vi.mock("../../config/env", () => ({
  env: {
    UPLOAD_DIR: isolated.uploadDir,
    JWT_ACCESS_SECRET:
      "test-only-deletion-journal-secret-1234567890"
  }
}));

vi.mock("../../infrastructure/logger", () => ({
  logger: {
    error: vi.fn()
  }
}));

import {
  createPendingDeletion,
  removePendingDeletion,
  listPendingDeletions,
  withCrossProcessDeletionLock
} from "./files.deletion-journal";

import {
  LocalFileStorage
} from "./storage/local.storage";

const storage = new LocalFileStorage();

const entry = {
  fileId: "44444444-4444-4444-8444-444444444444",
  ownerId: "55555555-5555-4555-8555-555555555555",
  storageKey:
    "66666666-6666-4666-8666-666666666666.png"
};

afterAll(async () => {

  // 테스트 전용 임시 디렉터리만 제거합니다.
  await rm(isolated.uploadDir, {
    recursive: true,
    force: true
  });

});

describe("실제 디스크 파일 삭제", () => {

  it("삭제 기록을 생성하고 실제 파일을 정리합니다.", async () => {

    await storage.save(
      entry.storageKey,
      Buffer.from("test-file-content")
    );

    await createPendingDeletion(entry);

    const pending = await listPendingDeletions();

    expect(pending).toContainEqual(entry);

    await expect(
      createPendingDeletion(entry)
    ).rejects.toMatchObject({
      code: "EEXIST"
    });

    await storage.remove(entry.storageKey);

    await removePendingDeletion(entry.fileId);

    expect(
      await listPendingDeletions()
    ).toEqual([]);

    await expect(
      readFile(
        path.join(
          isolated.uploadDir,
          entry.storageKey
        )
      )
    ).rejects.toMatchObject({
      code: "ENOENT"
    });

  });

});

describe("삭제 기록 보안 강화", () => {

  it("변조된 삭제 기록은 복구 목록에서 제외합니다.", async () => {

    const modified = {
      fileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      storageKey:
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc.png"
    };

    await createPendingDeletion(modified);

    const recordPath = path.join(
      isolated.uploadDir,
      ".pending-deletions",
      `${modified.fileId}.json`
    );

    const content = JSON.parse(
      await readFile(recordPath, "utf8")
    );

    content.storageKey =
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd.png";

    await writeFile(
      recordPath,
      JSON.stringify(content),
      "utf8"
    );

    const pending = await listPendingDeletions();

    expect(pending).not.toContainEqual(modified);

    await removePendingDeletion(modified.fileId);

  });

  it("파일 잠금으로 동시 작업을 순서대로 처리합니다.", async () => {

    let release!: () => void;
    let entered!: () => void;

    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });

    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });

    let secondEntered = false;

    const first = withCrossProcessDeletionLock(
      async () => {
        entered();
        await waiting;
      }
    );

    await started;

    const second = withCrossProcessDeletionLock(
      async () => {
        secondEntered = true;
      }
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(secondEntered).toBe(false);

    release();

    await Promise.all([first, second]);

    expect(secondEntered).toBe(true);

  });

  it("심볼릭 링크 파일 삭제를 차단합니다.", async () => {

    const outside = path.join(
      path.dirname(isolated.uploadDir),
      `secure-starter-outside-${process.pid}.txt`
    );

    const linkKey =
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";

    const linkPath = path.join(
      isolated.uploadDir,
      linkKey
    );

    await writeFile(outside, "protected-content");

    try {

      try {

        await symlink(outside, linkPath, "file");

      } catch (error) {

        const code =
          (error as NodeJS.ErrnoException).code;

        // Windows에서 심볼릭 링크 생성 권한이 없는 경우
        if (
          code === "EPERM" ||
          code === "EACCES" ||
          code === "ENOTSUP"
        ) {
          return;
        }

        throw error;
      }

      await expect(
        storage.remove(linkKey)
      ).rejects.toThrow();

      expect(
        await readFile(outside, "utf8")
      ).toBe("protected-content");

    } finally {

      await rm(linkPath, { force: true });
      await rm(outside, { force: true });
    }
  });

});

