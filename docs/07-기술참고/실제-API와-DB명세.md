# 실제 API 경로와 데이터베이스 명세

> **알 수 있는 것:** 소스에 등록된 HTTP 메서드·경로와 DB 모델
>
> **읽을 때:** API를 호출하거나 DB를 변경할 때
>
> **관련 기능:** 인증·게시글·파일·계정·관리자
>
> **관련 소스:** [app.ts](../../apps/api/src/bootstrap/app.ts), [schema.prisma](../../apps/api/prisma/schema.prisma)
>
> **관련 문서:** [요청 규칙](API-요청과-응답규칙.md), [문서센터](../README.md)

## 이 문서의 목차

- [HTTP 라우트](#http-라우트)
- [DB 열과 인덱스](#db-열과-인덱스)

소스의 라우트 문자열을 추출한 색인입니다. 동적으로 등록되는 경로를 완전히 해석하지 않으며 권한과 DTO는 각 컨트롤러가 기준입니다. [OpenAPI JSON](../openapi.json)은 일부 DTO만 모델링합니다.

## HTTP 라우트

| 메서드 | 전체 경로 | 실제 소스 |
|---|---|---|
| GET | `/api/v1/files/trash` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| POST | `/api/v1/files/:id/restore` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| POST | `/api/v1/files/` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | `/api/v1/files/` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | `/api/v1/files/:id` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | `/api/v1/files/:id/download` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| DELETE | `/api/v1/files/:id` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | `/api/v1/files/:id/thumbnail` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| POST | `/api/v1/files/batch` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | `/api/v1/notes/trash` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| POST | `/api/v1/notes/` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| GET | `/api/v1/notes/` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| GET | `/api/v1/notes/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| PUT | `/api/v1/notes/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| PATCH | `/api/v1/notes/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| DELETE | `/api/v1/notes/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| POST | `/api/v1/notes/:id/restore` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| POST | `/api/v1/account/email/request` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/email/verify` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/password/reset` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/email/change/confirm` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/recover` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/email/change` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| PATCH | `/api/v1/account/profile` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/password/change` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/withdraw` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | `/api/v1/account/export` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | `/api/v1/account/sessions` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| DELETE | `/api/v1/account/sessions/:id` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | `/api/v1/account/history` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/mfa/setup` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/mfa/enable` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | `/api/v1/account/mfa/disable` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | `/api/v1/notifications/` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| PATCH | `/api/v1/notifications/:id/read` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | `/api/v1/admin/dashboard` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| GET | `/api/v1/admin/users` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| GET | `/api/v1/admin/audit` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| PATCH | `/api/v1/admin/users/:id` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| POST | `/api/v1/auth/web/register` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/web/login` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/web/refresh` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/web/logout` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/mobile/register` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/mobile/login` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/mobile/refresh` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/mobile/logout` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| GET | `/api/v1/auth/me` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | `/api/v1/auth/logout-all` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |

## DB 열과 인덱스

이 모델들은 새 기능 설명을 위해 추출했으며 스키마를 변경하지 않았습니다. `?`는 선택값, `[]`는 여러 값, `@relation`은 외래키 관계입니다. 비밀번호 해시·토큰 해시·암호화된 MFA 값은 응답에 그대로 공개하면 안 됩니다.

### User

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique @db.VarChar(254)
  passwordHash  String
  name          String   @db.VarChar(60)
  tokenVersion  Int      @default(0)
  failedLoginCount Int @default(0)
  lockedUntil DateTime?
  role          String   @default("USER") @db.VarChar(16)
  suspendedAt   DateTime?
  deletedAt     DateTime?
  emailVerifiedAt DateTime?
  mfaSecret     String?
  mfaSetupExpiresAt DateTime?
  mfaEnabled    Boolean  @default(false)
  mfaLastStep   BigInt   @default(-1)
  recoveryHashes String[] @default([])
  notificationEmail Boolean @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  refreshSessions RefreshSession[]
  notes           Note[]
  files           StoredFile[]
  actions         AccountAction[]
  notifications   Notification[]
}
```

### RefreshSession

```prisma
model RefreshSession {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

### Note

```prisma
model Note {
  id        String   @id @default(uuid())
  ownerId   String
  title     String   @db.VarChar(120)
  content   String   @db.Text
  deletedAt DateTime?
  version   Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@index([ownerId, createdAt])
}
```

### StoredFile

```prisma
model StoredFile {
  id           String   @id @default(uuid())
  ownerId      String
  storageKey   String   @unique
  originalName String   @db.VarChar(255)
  mimeType     String   @db.VarChar(100)
  deletedAt    DateTime?
  sha256       String? @db.VarChar(64)
  size         Int
  createdAt    DateTime @default(now())

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@index([ownerId, createdAt])
  @@index([ownerId, sha256])
}
```

### AuditEvent

```prisma
model AuditEvent {
  id String @id @default(uuid())
  actorId String?
  action String @db.VarChar(80)
  targetId String?
  createdAt DateTime @default(now())
  @@index([createdAt])
  @@index([actorId, createdAt])
}
```

### AccountAction

```prisma
model AccountAction {
  id String @id @default(uuid())
  userId String
  pendingEmail String? @db.VarChar(254)
  issuedVersion Int @default(0)
  kind String @db.VarChar(20)
  tokenHash String @unique
  expiresAt DateTime
  consumedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([expiresAt])
}
```

### Notification

```prisma
model Notification {
  id String @id @default(uuid())
  userId String
  title String @db.VarChar(120)
  message String @db.VarChar(2000)
  readAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
}
```

### IdempotentRequest

```prisma
model IdempotentRequest {
  id String @id @default(uuid())
  scope String @db.VarChar(160)
  key String @db.VarChar(128)
  requestHash String @db.VarChar(64)
  response Json
  createdAt DateTime @default(now())
  @@unique([scope, key])
  @@index([createdAt])
}
```
