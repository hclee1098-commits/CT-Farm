// filepath: apps/api/src/modules/files/storage/storage.interface.ts - 로컬 디스크와 AWS S3에서 공통으로 사용할 파일 저장소 인터페이스
import type {
  Readable
} from "node:stream";

// ============================================================
// 파일 읽기 결과
// ============================================================

export interface StoredFileStream {

  stream: Readable;

  size: number;

}

// ============================================================
// 파일 저장소 인터페이스
// ============================================================

// 파일 저장 방식이 변경되어도
// Service는 동일한 인터페이스를 사용합니다.

export interface FileStorage {

  // 파일 저장
  save(
    key: string,
    buffer: Buffer
  ): Promise<void>;

  // 파일 읽기
  openRead(
    key: string
  ): Promise<StoredFileStream>;

  // 파일 삭제
  remove(
    key: string
  ): Promise<void>;

}

