// 도메인 오류 타입은 HTTP 오류 처리기와 분리해 순환 의존성을 막습니다.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

