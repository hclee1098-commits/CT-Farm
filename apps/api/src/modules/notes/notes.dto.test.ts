// filepath: apps/api/src/modules/notes/notes.dto.test.ts - 게시글 CRUD 입력값과 검색, 정렬, 페이징 검증 테스트
import {
  describe,
  expect,
  it
} from "vitest";

import {
  createNoteSchema,
  replaceNoteSchema,
  updateNoteSchema,
  listNotesSchema
} from "./notes.dto";

// ============================================================
// 게시글 등록 테스트
// ============================================================

describe("게시글 등록 검증", () => {

  it("정상적인 게시글을 허용합니다.", () => {

    const result = createNoteSchema.safeParse({
      title: "테스트 제목",
      content: "테스트 내용입니다."
    });

    expect(result.success).toBe(true);
  });

  it("제목이 비어 있으면 거부합니다.", () => {

    const result = createNoteSchema.safeParse({
      title: "",
      content: "테스트 내용"
    });

    expect(result.success).toBe(false);
  });

  it("내용이 비어 있으면 거부합니다.", () => {

    const result = createNoteSchema.safeParse({
      title: "테스트 제목",
      content: ""
    });

    expect(result.success).toBe(false);
  });

  it("제목이 120자를 초과하면 거부합니다.", () => {

    const result = createNoteSchema.safeParse({
      title: "가".repeat(121),
      content: "테스트 내용"
    });

    expect(result.success).toBe(false);
  });

  it("내용이 10000자를 초과하면 거부합니다.", () => {

    const result = createNoteSchema.safeParse({
      title: "테스트 제목",
      content: "가".repeat(10001)
    });

    expect(result.success).toBe(false);
  });

  it("사용자 ID를 임의로 지정할 수 없습니다.", () => {

    const result = createNoteSchema.safeParse({
      title: "테스트 제목",
      content: "테스트 내용",
      ownerId: "other-user"
    });

    expect(result.success).toBe(false);
  });
});

// ============================================================
// 게시글 수정 테스트
// ============================================================

describe("게시글 수정 검증", () => {

  it("전체 수정에는 제목과 내용이 필요합니다.", () => {

    const result = replaceNoteSchema.safeParse({
      title: "수정 제목"
    });

    expect(result.success).toBe(false);
  });

  it("제목만 부분 수정할 수 있습니다.", () => {

    const result = updateNoteSchema.safeParse({
      title: "수정된 제목"
    });

    expect(result.success).toBe(true);
  });

  it("내용만 부분 수정할 수 있습니다.", () => {

    const result = updateNoteSchema.safeParse({
      content: "수정된 내용"
    });

    expect(result.success).toBe(true);
  });

  it("빈 수정 요청은 거부합니다.", () => {

    const result = updateNoteSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("허용되지 않은 필드는 수정할 수 없습니다.", () => {

    const result = updateNoteSchema.safeParse({
      ownerId: "other-user"
    });

    expect(result.success).toBe(false);
  });
});

// ============================================================
// 페이징 테스트
// ============================================================

describe("게시글 페이징 검증", () => {

  it("기본 페이징 값을 적용합니다.", () => {

    const result = listNotesSchema.parse({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.sortBy).toBe("createdAt");
    expect(result.sortOrder).toBe("desc");
  });

  it("문자열 페이지 번호를 숫자로 변환합니다.", () => {

    const result = listNotesSchema.parse({
      page: "3",
      limit: "10"
    });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it("페이지 번호 0을 거부합니다.", () => {

    const result = listNotesSchema.safeParse({
      page: "0"
    });

    expect(result.success).toBe(false);
  });

  it("최대 조회 개수 100을 초과하면 거부합니다.", () => {

    const result = listNotesSchema.safeParse({
      limit: "101"
    });

    expect(result.success).toBe(false);
  });

  it("허용되지 않은 정렬 필드를 거부합니다.", () => {

    const result = listNotesSchema.safeParse({
      sortBy: "passwordHash"
    });

    expect(result.success).toBe(false);
  });

  it("허용되지 않은 정렬 방향을 거부합니다.", () => {

    const result = listNotesSchema.safeParse({
      sortOrder: "random"
    });

    expect(result.success).toBe(false);
  });
});

