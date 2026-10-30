// filepath: apps/api/src/modules/files/storage/local.storage.ts - 비공개 로컬 디스크에 파일을 안전하게 저장하고 읽는 기능
import path from "node:path";

import {
  constants
} from "node:fs";

import {
  lstat,
  mkdir,
  open,
  unlink,
  writeFile
} from "node:fs/promises";

import {
  env
} from "../../../config/env";

import type {
  FileStorage,
  StoredFileStream
} from "./storage.interface";

// ============================================================
// 로컬 저장소
// ============================================================

export class LocalFileStorage implements FileStorage {

  private readonly rootDirectory: string;

  constructor() {

    // 상대 경로는 API 실행 디렉터리를 기준으로 처리합니다.
    this.rootDirectory = path.resolve(
      process.cwd(),
      env.UPLOAD_DIR
    );
  }

  // ----------------------------------------------------------
  // 저장 키 검증
  // ----------------------------------------------------------

  // 저장소 루트가 심볼릭 링크인지 확인합니다.
  private async assertSafeRoot(): Promise<void> {

    const stats = await lstat(this.rootDirectory);

    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink()
    ) {
      throw new Error(
        "안전하지 않은 파일 저장소입니다."
      );
    }
  }
  private resolveSafePath(
    key: string
  ): string {

    // 저장 키는 서버가 생성한 UUID 기반 파일명만 허용합니다.
    // 디렉터리 구분자와 상대 경로를 허용하지 않습니다.

    const safeKeyPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i;

    if (!safeKeyPattern.test(key)) {

      throw new Error(
        "파일 저장 키가 올바르지 않습니다."
      );
    }

    return path.join(
      this.rootDirectory,
      key
    );
  }

  // ----------------------------------------------------------
  // 파일 저장
  // ----------------------------------------------------------

  async save(
    key: string,
    buffer: Buffer
  ): Promise<void> {

    const targetPath = this.resolveSafePath(
      key
    );

    // 저장 디렉터리는 외부에 공개하지 않습니다.
    await mkdir(
      this.rootDirectory,
      {
        recursive: true,
        mode: 0o700
      }
    );

    await this.assertSafeRoot();

    // wx 옵션으로 기존 파일 덮어쓰기를 방지합니다.
    await writeFile(
      targetPath,
      buffer,
      {
        flag: "wx",
        mode: 0o600
      }
    );
  }

  // ----------------------------------------------------------
  // 파일 읽기
  // ----------------------------------------------------------

  async openRead(
    key: string
  ): Promise<StoredFileStream> {

    const targetPath = this.resolveSafePath(
      key
    );

    await this.assertSafeRoot();

    const before = await lstat(targetPath);

    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1
    ) {
      throw new Error(
        "안전하지 않은 파일입니다."
      );
    }

    // 가능한 환경에서는 심볼릭 링크를 따라가지 않습니다.
    const flags =
      constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0);

    const handle = await open(
      targetPath,
      flags
    );

    try {

      const stats = await handle.stat();

      if (
        !stats.isFile() ||
        stats.nlink !== 1 ||
        stats.dev !== before.dev ||
        stats.ino !== before.ino
      ) {
        throw new Error(
          "일반 파일이 아닙니다."
        );
      }

      return {
        stream: handle.createReadStream({
          autoClose: true
        }),
        size: stats.size
      };

    } catch (error) {

      await handle.close();

      throw error;
    }
  }

  // ----------------------------------------------------------
  // 파일 삭제
  // ----------------------------------------------------------

  async remove(
    key: string
  ): Promise<void> {

    const targetPath = this.resolveSafePath(
      key
    );

    try {

      await this.assertSafeRoot();

      const stats = await lstat(targetPath);

      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.nlink !== 1
      ) {
        throw new Error(
          "안전하지 않은 파일은 삭제하지 않습니다."
        );
      }

      await unlink(targetPath);

    } catch (error) {

      const nodeError = error as NodeJS.ErrnoException;

      // 이미 삭제된 파일은 삭제 완료로 처리합니다.
      if (nodeError.code === "ENOENT") {
        return;
      }

      throw error;
    }
  }
}

