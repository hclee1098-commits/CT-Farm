# 새 기능의 API·화면·DB 추가하기

> **알 수 있는 것:** 기존 모듈을 참고하는 순서와 변경 검증
>
> **읽을 때:** 새 서비스 기능을 개발할 때
>
> **관련 기능:** 새 기능의 API·화면·DB 추가하기
>
> **관련 소스:** [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) · [notes.dto.ts](../../apps/api/src/modules/notes/notes.dto.ts) · [index.tsx](../../apps/web/src/shared/ui/index.tsx)
>
> **관련 문서:** [문서센터](../README.md)

## API 추가

1. `apps/api/src/modules/notes`를 예제로 새 모듈을 만듭니다. DTO(입력 규칙) → Repository(DB 접근) → Service(업무 처리) → Controller(HTTP)를 나누세요.
2. `requireAuth` 뒤에 라우트를 연결하고 DB 조회·수정에 현재 사용자 ID를 조건으로 넣습니다. 클라이언트가 전달한 ownerId를 신뢰하지 마세요.
3. `apps/api/src/bootstrap/app.ts`에 새 라우터를 연결합니다. 응답은 `common/response.ts`, 오류는 `AppError`를 사용합니다.
4. `docs/openapi.json`과 관련 기능 목록을 함께 수정합니다. OpenAPI는 모든 DTO를 모델링한 완전한 계약이 아니므로 실제 라우트를 함께 확인하세요.

## 화면과 공통 컴포넌트

`apps/web/src/app/starter` 아래 새 `page.tsx`를 만들고 `_components/Shell.tsx` 탐색 메뉴를 연결합니다. 기존 화면은 `_lib/api.ts`와 `_lib/auth.tsx`를 사용합니다. `shared/api`와 `shared/auth`도 별도 제공되므로 상태를 이중으로 관리하지 않도록 선택하세요.

```tsx
import { Button, TextField } from "../../../shared/ui";
// 파일 위치에 맞게 상대 import 경로를 조정하세요.
<Button loading={false} onClick={save}>저장</Button>
<TextField label="제목" value={title} onChange={onChange} />
```

Button, TextField, Modal, ToastProvider/useToast, Pagination, Card, DataTable, Loading, Skeleton, EmptyState 등은 실제 export와 Props를 확인하고 사용합니다. 로컬 포털의 컴포넌트 체험관도 참고하세요.

## DB 변경

`apps/api/prisma/schema.prisma`를 수정하고 **격리된 개발 DB**에서 `npm run db:migrate`로 새 마이그레이션을 만듭니다. 기존 migration SQL은 덮어쓰지 않습니다. 백업과 적용 대상을 확인한 후 배포 환경에서는 `npm run db:deploy`를 실행합니다. DB reset을 실행하지 마세요.

## 검증과 문서 유지

```text
npm run db:generate
npm test
npm run build
npm run docs:index
npm run docs:check
npm run test:portal
npm run test:docs
```

문서센터는 `docs/`의 Markdown만 읽습니다. 제목 첫 줄은 구체적인 한국어로 작성하고 상단에 목적·읽을 때·사용법·관련 소스·관련 문서를 넣습니다. 파일을 이동하면 링크를 함께 수정하세요. `docs:index`는 파일 색인과 분석 스냅샷을 갱신합니다.

[구조와 흐름](../03-프로젝트구조/전체구조와-요청흐름.md) · [API 규칙](../07-기술참고/API-요청과-응답규칙.md)
