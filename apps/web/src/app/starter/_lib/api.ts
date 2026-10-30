// filepath: apps/web/src/app/starter/_lib/api.ts - API 주소 및 공통 응답 처리
export { API_BASE_URL } from "../../../shared/api/config";

// API 성공 응답
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

// API 실패 응답
export interface ApiFailure {
  success: false;
  errorCode: string;
  message: string;
}

// 회원 정보
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// 공통 페이지 정보
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// 공통 목록 응답
export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}

// API 응답을 공통 규격으로 해석합니다.
export async function readApiResponse<T>(
  response: Response
): Promise<T> {

  const result = await response.json().catch(
    () => null
  ) as ApiSuccess<T> | ApiFailure | null;

  if (
    !response.ok ||
    !result ||
    !result.success
  ) {

    const message =
      result?.message ??
      "서버 요청을 처리하지 못했습니다.";

    throw new Error(message);
  }

  return result.data;
}

// 알 수 없는 오류를 사용자 메시지로 변환합니다.
export function getErrorMessage(
  error: unknown
): string {

  if (error instanceof Error) {
    if (/failed to fetch|fetch failed|networkerror|network request failed/i.test(error.message)) {
      return "서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
    }
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

