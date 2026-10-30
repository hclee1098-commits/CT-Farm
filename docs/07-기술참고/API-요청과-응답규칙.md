# API 요청과 인증·게시글·파일 상세

> **알 수 있는 것:** 설정·동작·제한과 실제 사용 절차
>
> **읽을 때:** 해당 기능의 상세 설정을 확인할 때
>
> **관련 기능:** API 공통 규칙
>
> **관련 소스:** [인증](../../apps/api/src/modules/auth/auth.controller.ts) · [게시글](../../apps/api/src/modules/notes/notes.controller.ts) · [파일](../../apps/api/src/modules/files/files.controller.ts) · [app.ts](../../apps/api/src/bootstrap/app.ts)
>
> **관련 문서:** [문서센터](../README.md)


## 이 문서의 목차

- [인증 API 사용 설명서](#인증-api-사용-설명서)
- [게시글 CRUD API 사용 설명서](#게시글-crud-api-사용-설명서)
- [파일 관리 공통 모듈](#파일-관리-공통-모듈)

기본 경로: `/api/v1`. 성공은 `{success:true,data,message}`, 실패는 `{success:false,errorCode,message}`입니다. 요청 식별자는 `X-Request-ID` 응답 헤더를 확인합니다. 오류 본문에 내부 오류 원문을 반환하지 않습니다.

`docs/openapi.json`은 경로 목록과 주요 요청 형식을 제공합니다. 모든 DTO를 완전히 모델링한 계약 문서는 아니며, 파일 다운로드/썸네일 응답은 바이너리입니다. 웹 인증 POST는 허용 Origin이 필요하고 Refresh Token은 HttpOnly 쿠키로만 전달합니다. 모바일 API는 JSON Refresh Token을 사용합니다.

- 게시글 생성: `POST /notes`, JSON `{title,content}`. 선택적으로 `Idempotency-Key`에 16~128자 영숫자/밑줄/하이픈을 전송합니다. 같은 사용자·키·본문은 동일 자원 응답을 반환하고 다른 본문은 409입니다. 키는 자동 만료하지 않습니다.
- 게시글 PUT/PATCH: 선택 필드 `version`을 전달하면 낙관적 잠금을 적용합니다. 충돌 시 409, 최신 데이터 재조회 후 사용자의 의도를 확인하세요. 기존 클라이언트 호환을 위해 생략도 허용합니다.
- `DELETE /notes/:id`와 `DELETE /files/:id`는 V6에서 휴지통 이동입니다. `/notes/trash`, `/files/trash`로 조회하고 `POST /notes/:id/restore`, `POST /files/:id/restore`로 복구합니다. 파일 삭제 응답 데이터는 `{count:1}`입니다. 영구 삭제는 자동 수행하지 않습니다.
- 파일 업로드는 `POST /files` multipart 필드 `file`, 다중 업로드는 `POST /files/batch` 필드 `files` 최대 5개입니다. 파일당 5MiB, 배치 최대 25MiB를 메모리에 사용하므로 동시 접속 수에 맞는 인프라 제한이 필요합니다. 배치는 207 응답이며 파일별 독립 성공/실패를 확인해야 합니다.
- 업로드한 이미지는 최대 40MP 입력, 최대 4096×4096 보존 비율로 재인코딩하고 EXIF를 제거합니다. PDF는 기존 시그니처 검사만 적용하며 악성코드 검사 기능은 없습니다. SHA-256은 재인코딩된 실제 저장 파일 기준입니다. 중복 검사는 사용자별이며 동시에 들어온 중복 업로드에 대한 DB 유일성 보장은 없습니다.
- `GET /files/:id/thumbnail`: 소유권 검사 후 320×320 범위 WebP 썸네일 생성. 공개 URL은 발급하지 않습니다.
- MFA 등록: 비밀번호 재인증 후 `/account/mfa/setup`, 10분 내 `/account/mfa/enable`에 `{code}` 전송. 등록 시 모든 세션이 폐기됩니다. 반환된 복구 코드는 한 번만 표시됩니다.
- 로그인 JSON에 선택적으로 `mfaCode`를 추가합니다. 6자리 TOTP 또는 32자리 HEX 복구 코드입니다. 복구 코드는 1회용입니다. 관리자는 로그인 후에도 각 관리자 API 요청에 새 `X-MFA-Code`가 필요하며 관리자 재인증에는 복구 코드를 사용할 수 없습니다.
- `/account/password/change`: `{password,newPassword,mfaCode?}`. `/account/withdraw`: `{password,mfaCode?}`. 탈퇴는 논리적 잠금이며 데이터/이메일을 자동 삭제하거나 재사용하지 않습니다.
- `/account/sessions/:id` DELETE는 해당 Refresh Token과 모든 Access Token을 폐기합니다. 다른 기기는 Refresh Token으로 새 Access Token을 발급받을 수 있습니다. V5 JWT에 세션 ID가 없기 때문에 생기는 의도된 호환성 정책입니다.
- 메일 인터페이스: `/account/email/request`에 `{email,kind:'VERIFY'|'RESET'}`, `/account/email/verify`에 `{token}`, `/account/password/reset`에 `{token,newPassword}`. 메일 전송 어댑터 미설정 시 503입니다. Mock이 실제 발송으로 표시되지 않습니다. MFA는 비밀번호 재설정으로 해제되지 않습니다.

이메일 변경·30일 내 계정 복구 API는 제공하며 해당 UI, 범용 역할/권한 편집, 전체 개인정보 대용량 내보내기는 미구현입니다. 내보내기는 범주별 최대 1000개 제한을 명시합니다. 관리자/보안 이력은 최근 100개, 휴지통도 최근 100개이며 범용 커서 페이지네이션은 후속 구현 대상입니다.


## 인증 API 사용 설명서

### 개요

웹 브라우저와 모바일 앱은 동일한 회원 데이터베이스를 사용합니다.

Refresh Token 전달 방식은 서로 다릅니다.

웹 브라우저:
- Access Token: 메모리에 저장
- Refresh Token: HttpOnly Cookie

모바일 앱:
- Access Token: 메모리에 저장
- Refresh Token: 운영체제 보안 저장소

### 웹 회원가입

POST /api/v1/auth/web/register

요청 JSON 예시:

{
  "email": "test@example.com",
  "password": "StrongPassword123!",
  "name": "테스트회원"
}

성공하면 회원 정보와 Access Token을 반환합니다.

Refresh Token은 HttpOnly Cookie로 전달됩니다.

### 웹 로그인

POST /api/v1/auth/web/login

요청 JSON 예시:

{
  "email": "test@example.com",
  "password": "StrongPassword123!"
}

웹에서는 credentials: "include" 옵션을 사용합니다.

### 웹 토큰 갱신

POST /api/v1/auth/web/refresh

Refresh Token은 쿠키에서 자동으로 읽습니다.

성공하면 새로운 Access Token을 반환합니다.

### 웹 로그아웃

POST /api/v1/auth/web/logout

현재 브라우저의 Refresh Token 세션을 종료합니다.

### 모바일 앱 회원가입

POST /api/v1/auth/mobile/register

요청 JSON 예시:

{
  "email": "test@example.com",
  "password": "StrongPassword123!",
  "name": "테스트회원"
}

### 모바일 앱 로그인

POST /api/v1/auth/mobile/login

요청 JSON 예시:

{
  "email": "test@example.com",
  "password": "StrongPassword123!"
}

성공하면 Access Token과 Refresh Token을 반환합니다.

모바일 앱은 Refresh Token을 안전한 저장소에 보관해야 합니다.

### 모바일 앱 토큰 갱신

POST /api/v1/auth/mobile/refresh

요청 JSON 예시:

{
  "refreshToken": "기존_Refresh_Token"
}

성공하면 새로운 Access Token과 Refresh Token을 반환합니다.

기존 Refresh Token은 사용할 수 없게 됩니다.

### 모바일 앱 로그아웃

POST /api/v1/auth/mobile/logout

요청 JSON 예시:

{
  "refreshToken": "현재_Refresh_Token"
}

### 내 정보 조회

GET /api/v1/auth/me

요청 헤더:

Authorization: Bearer ACCESS_TOKEN

### 전체 기기 로그아웃

POST /api/v1/auth/logout-all

요청 헤더:

Authorization: Bearer ACCESS_TOKEN

모든 Refresh Token 세션을 종료합니다.

기존 Access Token도 무효화됩니다.

### 보안 주의사항

1. 운영 환경에서는 반드시 HTTPS를 사용합니다.
2. JWT 비밀키를 소스코드에 저장하지 않습니다.
3. Refresh Token을 로그에 기록하지 않습니다.
4. 모바일 앱은 운영체제 보안 저장소를 사용합니다.
5. Refresh Token은 갱신할 때마다 교체합니다.
6. 인증 요청에는 Rate Limiting을 적용합니다.
7. 쿠키 기반 요청에는 CSRF 방어가 필요합니다.
8. 실제 운영 전 보안 테스트를 수행해야 합니다.


## 게시글 CRUD API 사용 설명서

### 1. 개요

이 모듈은 웹과 모바일 앱에서 공통으로 사용하는
게시글 CRUD 기능을 제공합니다.

모든 API는 JWT Access Token 인증이 필요합니다.

게시글은 사용자별로 분리됩니다.

다른 사용자의 게시글은 조회, 수정, 삭제할 수 없습니다.

### 2. 인증

모든 요청에 다음 HTTP 헤더가 필요합니다.

Authorization: Bearer ACCESS_TOKEN

### 3. 게시글 등록

POST /api/v1/notes

요청 JSON:

{
  "title": "게시글 제목",
  "content": "게시글 내용"
}

성공 HTTP 상태 코드: 201

### 4. 게시글 목록 조회

GET /api/v1/notes

지원하는 Query 파라미터:

page: 페이지 번호

limit: 페이지당 조회 개수

search: 제목과 내용 검색어

sortBy: 정렬 필드

sortOrder: 정렬 방향

기본값:

page = 1

limit = 20

sortBy = createdAt

sortOrder = desc

조회 개수는 최대 100개입니다.

정렬 필드:

createdAt

updatedAt

title

정렬 방향:

asc

desc

예시:

GET /api/v1/notes?page=1&limit=20

GET /api/v1/notes?search=테스트

GET /api/v1/notes?sortBy=title&sortOrder=asc

GET /api/v1/notes?page=2&limit=10&search=안내

### 5. 목록 응답

{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0,
      "hasNext": false,
      "hasPrevious": false
    }
  },
  "message": "게시글 목록을 조회했습니다."
}

### 6. 게시글 상세 조회

GET /api/v1/notes/:id

게시글 ID는 UUID 형식이어야 합니다.

### 7. 게시글 전체 수정

PUT /api/v1/notes/:id

요청 JSON:

{
  "title": "수정한 제목",
  "content": "수정한 내용"
}

제목과 내용을 모두 전달해야 합니다.

### 8. 게시글 부분 수정

PATCH /api/v1/notes/:id

요청 JSON:

{
  "title": "수정한 제목"
}

또는:

{
  "content": "수정한 내용"
}

수정할 필드를 하나 이상 전달해야 합니다.

### 9. 게시글 삭제

DELETE /api/v1/notes/:id

삭제는 휴지통 이동이며 `{deleted: true}`를 반환합니다. `GET /api/v1/notes/trash`로 조회하고 `POST /api/v1/notes/:id/restore`로 복구합니다.

### 10. 보안 정책

1. 모든 요청에 JWT 인증을 적용합니다.

2. ownerId는 클라이언트에서 받지 않습니다.

3. ownerId는 인증된 사용자 정보에서 가져옵니다.

4. 데이터베이스 조회 시 ownerId 조건을 적용합니다.

5. 수정 및 삭제 시에도 ownerId 조건을 적용합니다.

6. 다른 사용자의 게시글은 404로 응답합니다.

7. 정렬 가능한 필드를 제한합니다.

8. 페이지당 조회 개수를 최대 100개로 제한합니다.

9. 제목과 내용 길이를 제한합니다.

10. 반환할 데이터베이스 필드를 명시합니다.

11. 검색에는 Prisma의 매개변수화된 쿼리를 사용합니다.

12. 클라이언트는 사용자 입력을 HTML로 직접 삽입하지 않아야 합니다.

### 11. 주의사항

이 모듈은 인증 모듈과 Prisma 연결 모듈에 의존합니다.

Express 서버에 notesRouter를 등록해야 실제 API가 동작합니다.

이 모듈의 DTO 테스트만으로 DB 접근 권한이
검증되었다고 판단해서는 안 됩니다.

운영 전에는 실제 PostgreSQL을 이용한
사용자별 접근 권한 통합 테스트가 필요합니다.


## 파일 관리 공통 모듈

### 1. 개요

이 모듈은 웹과 모바일 앱에서 공통으로 사용할 수 있는
파일 업로드 및 다운로드 기능을 제공합니다.

모든 API에는 JWT 인증이 필요합니다.

### 2. 지원 파일

JPEG 이미지

PNG 이미지

WebP 이미지

PDF 문서

기본 최대 용량은 파일당 5MB입니다.

### 3. 파일 업로드

POST /api/v1/files

요청 형식:

multipart/form-data

파일 필드 이름:

file

요청 헤더:

Authorization: Bearer ACCESS_TOKEN

성공 HTTP 상태 코드:

201

### 4. 파일 목록

GET /api/v1/files

지원하는 파라미터:

page

limit

search

sortBy

sortOrder

정렬 필드:

createdAt

originalName

size

### 5. 파일 상세 조회

GET /api/v1/files/:id

파일 ID는 UUID 형식이어야 합니다.

### 6. 파일 다운로드

GET /api/v1/files/:id/download

다운로드 시 인증 및 소유권을 검사합니다.

Content-Disposition은 attachment로 설정합니다.

원본 한글 파일명은 UTF-8로 인코딩하여 전달합니다.

### 7. 파일 삭제

DELETE /api/v1/files/:id

본인이 업로드한 파일만 휴지통으로 이동할 수 있습니다. 응답 데이터는 `{count:1}`입니다. `GET /api/v1/files/trash`, `POST /api/v1/files/:id/restore`로 조회·복구합니다. 파일 바이트는 자동 삭제되지 않습니다.

### 8. 파일 저장 구조

실제 파일은 로컬 비공개 디렉터리에 저장합니다.

데이터베이스에는 파일 메타데이터를 저장합니다.

원본 파일명은 저장 경로에 사용하지 않습니다.

서버가 생성한 UUID 파일명을 사용합니다.

### 9. AWS S3 전환

storage.interface.ts에 정의된 FileStorage 인터페이스를
구현하는 S3 저장소 클래스를 작성합니다.

S3 저장소는 비공개 버킷을 사용해야 합니다.

서버에서 사용자 권한을 검증한 뒤
파일 다운로드를 허용해야 합니다.

현재 코드는 S3 구현 자체를 포함하지 않습니다.

### 10. 보안 주의사항

파일 시그니처 검사만으로 악성코드를 탐지할 수 없습니다.

PDF 파일에는 위험한 콘텐츠가 포함될 수 있습니다.

운영 환경에서는 악성코드 검사와
파일 형식별 구조 검증을 추가해야 합니다.

업로드 저장소를 웹 정적 파일 디렉터리로 공개하지 마세요.

파일 접근 시 항상 사용자 소유권을 검사해야 합니다.

운영 환경에서는 업로드 요청 제한과
전체 저장 용량 제한도 적용해야 합니다.

### 11. 운영 환경의 추가 요구사항

현재 구현은 로컬 개발용 기본 저장소입니다.

파일과 DB의 변경은 하나의 트랜잭션으로
묶을 수 없습니다.

따라서 운영 환경에서는 업로드 및 삭제 실패 시
정리 작업을 재시도하는 작업 큐 또는
Transactional Outbox 패턴을 고려해야 합니다.

여러 서버에서 로컬 저장소를 공유하지 않는 경우
서버별 파일 불일치가 발생할 수 있습니다.

운영 환경에서는 S3와 같은 공용 객체 저장소를 권장합니다.

### 12. 테스트

파일 형식과 파일명에 대한 단위 테스트가 포함됩니다.

실제 파일 업로드, 다운로드, 권한 검사는
별도의 통합 테스트가 필요합니다.
