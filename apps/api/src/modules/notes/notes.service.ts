// filepath: apps/api/src/modules/notes/notes.service.ts - 게시글 CRUD 비즈니스 로직 및 공통 페이징 응답 처리
import {
  AppError
} from "../../common/app-error";

import {
  paginated
} from "../../common/pagination";

import {
  notesRepository
} from "./notes.repository";

import type {
  CreateNoteInput,
  ReplaceNoteInput,
  UpdateNoteInput,
  ListNotesQuery
} from "./notes.dto";

// ============================================================
// 게시글 서비스
// ============================================================

export const notesService = {

  // ----------------------------------------------------------
  // 게시글 등록
  // ----------------------------------------------------------

  async create(
    userId: string,
    input: CreateNoteInput
  ) {

    return notesRepository.create(
      userId,
      input
    );
  },

  // ----------------------------------------------------------
  // 게시글 목록 조회
  // ----------------------------------------------------------

  async list(
    userId: string,
    query: ListNotesQuery
  ) {

    const result = await notesRepository.findPage(
      userId,
      query
    );

    // 모든 목록 API에서 재사용할 수 있는
    // 표준 페이징 구조로 응답합니다.
    return paginated(
      result.items,
      result.total,
      query.page,
      query.limit
    );
  },

  // ----------------------------------------------------------
  // 게시글 상세 조회
  // ----------------------------------------------------------

  async getById(
    userId: string,
    noteId: string
  ) {

    const note = await notesRepository.findById(
      userId,
      noteId
    );

    if (!note) {

      // 다른 사용자의 게시글과 존재하지 않는 게시글을
      // 구분하지 않고 동일한 오류를 반환합니다.
      throw new AppError(
        404,
        "NOTE_NOT_FOUND",
        "게시글을 찾을 수 없습니다."
      );
    }

    return note;
  },

  // ----------------------------------------------------------
  // 게시글 전체 수정
  // ----------------------------------------------------------

  async replace(
    userId: string,
    noteId: string,
    input: ReplaceNoteInput
  ) {

    return notesRepository.replace(
      userId,
      noteId,
      input
    );
  },

  // ----------------------------------------------------------
  // 게시글 부분 수정
  // ----------------------------------------------------------

  async update(
    userId: string,
    noteId: string,
    input: UpdateNoteInput
  ) {

    return notesRepository.update(
      userId,
      noteId,
      input
    );
  },

  // ----------------------------------------------------------
  // 게시글 삭제
  // ----------------------------------------------------------

  async delete(
    userId: string,
    noteId: string
  ) {

    return notesRepository.delete(
      userId,
      noteId
    );
  }
};

