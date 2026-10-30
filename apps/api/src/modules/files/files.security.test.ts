// filepath: apps/api/src/modules/files/files.security.test.ts - 파일 형식과 파일명 검증 및 목록 요청 자동 테스트
import {
  describe,
  expect,
  it
} from "vitest";

import {
  detectFileType,
  sanitizeFilename
} from "./files.security";

import {
  listFilesSchema
} from "./files.dto";

// ============================================================
// 파일 형식 검사
// ============================================================

describe("파일 시그니처 검사", () => {

  it("PNG 파일 시그니처를 인식합니다.", () => {

    const buffer = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a
    ]);

    const result = detectFileType(buffer);

    expect(result?.mimeType).toBe(
      "image/png"
    );
  });

  it("JPEG 파일 시그니처를 인식합니다.", () => {

    const buffer = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0xff,
      0xd9
    ]);

    const result = detectFileType(buffer);

    expect(result?.mimeType).toBe(
      "image/jpeg"
    );
  });

  it("알 수 없는 파일 형식을 거부합니다.", () => {

    const buffer = Buffer.from(
      "unknown-file-content"
    );

    const result = detectFileType(buffer);

    expect(result).toBeNull();
  });

});

// ============================================================
// 파일명 검사
// ============================================================

describe("파일명 보안 검사", () => {

  it("정상적인 한글 파일명을 허용합니다.", () => {

    const result = sanitizeFilename(
      "테스트이미지.png"
    );

    expect(result).toBe(
      "테스트이미지.png"
    );
  });

  it("경로 구분자를 제거합니다.", () => {

    const result = sanitizeFilename(
      "../../test.png"
    );

    expect(result.includes("/")).toBe(false);
  });

  it("빈 파일명을 거부합니다.", () => {

    expect(() => {
      sanitizeFilename("");
    }).toThrow();
  });

});

// ============================================================
// 목록 조회 검증
// ============================================================

describe("파일 목록 조회 검증", () => {

  it("기본 페이징을 적용합니다.", () => {

    const result = listFilesSchema.parse({});

    expect(result.page).toBe(1);

    expect(result.limit).toBe(20);

    expect(result.sortBy).toBe("createdAt");
  });

  it("잘못된 정렬 필드를 거부합니다.", () => {

    const result = listFilesSchema.safeParse({
      sortBy: "storageKey"
    });

    expect(result.success).toBe(false);
  });

  it("조회 개수 100개 초과를 거부합니다.", () => {

    const result = listFilesSchema.safeParse({
      limit: "101"
    });

    expect(result.success).toBe(false);
  });

});

describe("서비스 계층 업로드 크기 검증", () => {
  it("실제 버퍼와 다른 크기를 거부합니다", async () => {
    const { validateUploadedFile } = await import("./files.security");
    expect(() => validateUploadedFile({ buffer: Buffer.from("%PDF-1.7"), size: 1, originalname: "a.pdf", mimetype: "application/pdf" } as Express.Multer.File))
      .toThrow("파일 크기 정보가 일치하지 않습니다.");
  });
  it("Multer를 거치지 않아도 5MiB 초과를 거부합니다", async () => {
    const { validateUploadedFile } = await import("./files.security");
    const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    expect(() => validateUploadedFile({ buffer, size: buffer.length } as Express.Multer.File))
      .toThrow("파일 크기가 허용 용량을 초과했습니다.");
  });
});

