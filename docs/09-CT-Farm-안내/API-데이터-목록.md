# 실제 API 선언과 PostgreSQL 모델 목록

기준일: 2026-10-30. 구현 파일의 존재와 운영 검증을 구분합니다. 최신 웹·별도 앱 범위는 [모바일 앱과 디자인](모바일앱과-디자인.md), 음성·협업·장애 검증은 [6차 결과](6차-음성과-실행복구.md)를 함께 읽으세요.

## API 읽는 방법

아래는 controller의 고정 문자열 라우트 선언을 전수 추출한 목록입니다. URL 앞에는 bootstrap/app.ts의 mount 경로를 붙입니다. farms/operations/plotImport/consultations/payments Router는 /api/v1/farms, maps는 /api/v1/maps, sensorIngest는 /api/v1/sensor-ingest, auth는 /api/v1/auth, notes는 /api/v1/notes, files는 /api/v1/files, account는 /api/v1/account, notification은 /api/v1/notifications, admin은 /api/v1/admin입니다. workspaceRouter는 /api/v1/workspace, voiceRouter는 /api/v1/voice, collaborationRouter는 /api/v1/collaboration입니다. 협업 API는 원본 DB 적용 승인 전 기본 비활성이며 6차 격리 검증 범위를 확인하세요. health는 bootstrap/health.ts를 별도로 확인합니다.

동적 선언 operationsRouter[method]는 PUT·DELETE /:id/records/:childId를 추가합니다. farmsRouter[method]는 PUT·DELETE /:id 및 /:id/diary/:entryId를 추가합니다. paymentsRouter의 action 반복문은 POST /:id/payments/:childId/confirm, /refund, /reconcile을 추가합니다. 별도 healthRouter는 GET /health, /health/live, /health/ready입니다. 런타임 OpenAPI 완전성 보증이 아니라 소스 탐색용 목록입니다. 정확한 요청·응답 필드는 각 링크의 validate·Zod와 success 호출이 기준입니다. 상담·결제의 복잡한 필드 예시는 기존 2차 운영 안내에 유지합니다.

| 메서드 | Router: 상대 경로 | 구현 파일 |
|---|---|---|
| POST | authRouter: `/web/register` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/web/login` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/web/refresh` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/web/logout` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/mobile/register` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/mobile/login` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/mobile/refresh` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/mobile/logout` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| GET | authRouter: `/me` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| POST | authRouter: `/logout-all` | [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts) |
| GET | collaborationRouter: `/farms/:id/members` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| GET | collaborationRouter: `/farms/:id/tasks/:childId/evidence` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| GET | collaborationRouter: `/farms` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| GET | collaborationRouter: `/farms/:id/summary` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| PATCH | collaborationRouter: `/farms/:id/members/:childId` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| POST | collaborationRouter: `/farms/:id/diary` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| PUT | collaborationRouter: `/farms/:id/diary/:childId` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| POST | collaborationRouter: `/farms/:id/records` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| GET | collaborationRouter: `/farms/:id/tasks` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| POST | collaborationRouter: `/farms/:id/tasks/:childId/action` | [collaboration.controller.ts](../../apps/api/src/modules/farms/collaboration.controller.ts) |
| GET | consultationsRouter: `/:id/knowledge` | [consultation.controller.ts](../../apps/api/src/modules/farms/consultation.controller.ts) |
| GET | consultationsRouter: `/:id/consultations` | [consultation.controller.ts](../../apps/api/src/modules/farms/consultation.controller.ts) |
| POST | consultationsRouter: `/:id/consultations` | [consultation.controller.ts](../../apps/api/src/modules/farms/consultation.controller.ts) |
| GET | farmsRouter: `/archived` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| POST | farmsRouter: `/:id/restore` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| GET | farmsRouter: `/:id/diary/archived` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| POST | farmsRouter: `/:id/diary/:entryId/restore` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| GET | farmsRouter: `/` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| POST | farmsRouter: `/` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| GET | farmsRouter: `/:id` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| GET | farmsRouter: `/:id/diary` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| POST | farmsRouter: `/:id/diary` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| GET | farmsRouter: `/:id/diary/:entryId` | [farms.controller.ts](../../apps/api/src/modules/farms/farms.controller.ts) |
| GET | mapsRouter: `/config` | [maps.controller.ts](../../apps/api/src/modules/farms/maps.controller.ts) |
| POST | mapsRouter: `/boundary/preview` | [maps.controller.ts](../../apps/api/src/modules/farms/maps.controller.ts) |
| POST | plotImportRouter: `/:id/plots/import` | [maps.controller.ts](../../apps/api/src/modules/farms/maps.controller.ts) |
| GET | operationsRouter: `/:id/records` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/records` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/diary/:childId/photos` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/diary/:childId/photos` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| DELETE | operationsRouter: `/:id/diary/:childId/photos/:photoId` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/sensors` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/sensors` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| DELETE | operationsRouter: `/:id/sensors/:childId` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/sensors/:childId/readings` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/sensors/:childId/simulate` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | sensorIngestRouter: `/:id` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/weather` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/advice` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/check` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/advice/task` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/sensors/:childId/rotate-key` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/sensors/:childId/commands` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/consult` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/products` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/products` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| PUT | operationsRouter: `/:id/products/:childId` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | operationsRouter: `/:id/orders` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| POST | operationsRouter: `/:id/products/:childId/orders` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| PATCH | operationsRouter: `/:id/orders/:childId` | [operations.controller.ts](../../apps/api/src/modules/farms/operations.controller.ts) |
| GET | paymentsRouter: `/:id/payment-config` | [payment.controller.ts](../../apps/api/src/modules/farms/payment.controller.ts) |
| GET | paymentsRouter: `/:id/payments` | [payment.controller.ts](../../apps/api/src/modules/farms/payment.controller.ts) |
| POST | paymentsRouter: `/:id/orders/:childId/payment` | [payment.controller.ts](../../apps/api/src/modules/farms/payment.controller.ts) |
| POST | paymentsRouter: `/:id/payments/:childId/simulate` | [payment.controller.ts](../../apps/api/src/modules/farms/payment.controller.ts) |
| POST | voiceRouter: `/sessions` | [voice.controller.ts](../../apps/api/src/modules/farms/voice.controller.ts) |
| POST | voiceRouter: `/sessions/:id/turn` | [voice.controller.ts](../../apps/api/src/modules/farms/voice.controller.ts) |
| GET | voiceRouter: `/sessions/:id` | [voice.controller.ts](../../apps/api/src/modules/farms/voice.controller.ts) |
| GET | workspaceRouter: `/dashboard` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| GET | workspaceRouter: `/farms/:id/members` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| POST | workspaceRouter: `/farms/:id/invitations` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| POST | workspaceRouter: `/invitations/accept` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| DELETE | workspaceRouter: `/farms/:id/members/:memberId` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| DELETE | workspaceRouter: `/farms/:id/invitations/:memberId` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| GET | workspaceRouter: `/shared` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| GET | workspaceRouter: `/shared/:id` | [workspace.controller.ts](../../apps/api/src/modules/farms/workspace.controller.ts) |
| GET | filesRouter: `/trash` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| POST | filesRouter: `/:id/restore` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| POST | filesRouter: `/` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | filesRouter: `/` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | filesRouter: `/:id` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | filesRouter: `/:id/download` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| DELETE | filesRouter: `/:id` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | filesRouter: `/:id/thumbnail` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| POST | filesRouter: `/batch` | [files.controller.ts](../../apps/api/src/modules/files/files.controller.ts) |
| GET | notesRouter: `/trash` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| POST | notesRouter: `/` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| GET | notesRouter: `/` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| GET | notesRouter: `/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| PUT | notesRouter: `/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| PATCH | notesRouter: `/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| DELETE | notesRouter: `/:id` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| POST | notesRouter: `/:id/restore` | [notes.controller.ts](../../apps/api/src/modules/notes/notes.controller.ts) |
| GET | adminRouter: `/dashboard` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| GET | adminRouter: `/users` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| GET | adminRouter: `/audit` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| PATCH | adminRouter: `/users/:id` | [admin.controller.ts](../../apps/api/src/modules/platform/admin.controller.ts) |
| POST | accountRouter: `/email/request` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/email/verify` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/password/reset` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/email/change/confirm` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/recover` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/email/change` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| PATCH | accountRouter: `/profile` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/password/change` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/withdraw` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | accountRouter: `/export` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | accountRouter: `/sessions` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| DELETE | accountRouter: `/sessions/:id` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | accountRouter: `/history` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/mfa/setup` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/mfa/enable` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| POST | accountRouter: `/mfa/disable` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| GET | notificationRouter: `/` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |
| PATCH | notificationRouter: `/:id/read` | [platform.controller.ts](../../apps/api/src/modules/platform/platform.controller.ts) |

## 요청·응답 예시

상담 POST /api/v1/farms/:id/consultations는 requestKey(UUID), question(2~2000자), mode(REFERENCE/MODEL), allowExternal(boolean)을 받습니다. MODEL은 서버 설정과 동의를 함께 검사합니다. 결과의 상태·sources·usage를 보고 실제 모델 답변과 자료 안내를 구분합니다. 같은 키의 다른 본문은 409입니다.

센서 POST /api/v1/sensor-ingest/:id는 Authorization: Device 형식 키와 sampleId, value, measuredAt을 받습니다. 타임스탬프·측정 범위·키·중복을 검증합니다. 키는 요청 예시에 실값으로 쓰지 않습니다. 일반 농장 변경은 Bearer 인증과 UUID·version 검사를 사용합니다. 공통 JSON 형식의 정확한 구현은 [response.ts](../../apps/api/src/common/response.ts)를 확인합니다.

## PostgreSQL 모델 (22개)

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
  farms           Farm[]
  aiQuotas        AiQuota[]
  farmMemberships FarmMember[]
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
  diaryPhotos DiaryPhoto[]
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

### Farm

```prisma
model Farm {
  id String @id @default(uuid())
  ownerId String
  name String @db.VarChar(100)
  address String @db.VarChar(300)
  latitude Float
  longitude Float
  areaM2 Float
  crop String @db.VarChar(80)
  variety String @db.VarChar(80)
  stage String @default("PREPARING") @db.VarChar(20)
  version Int @default(1)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  owner User @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  entries FarmDiary[]
  records FarmRecord[]
  sensors FarmSensor[]
  products FarmProduct[]
  consultations FarmConsultation[]
    members FarmMember[]
    invitations FarmInvitation[]
  @@index([ownerId, createdAt])
}
```

### FarmMember

```prisma
model FarmMember {
  id String @id @default(uuid())
  farmId String
  userId String
  role String @default("VIEWER") @db.VarChar(16)
  revokedAt DateTime?
  createdAt DateTime @default(now())
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@unique([farmId,userId])
  @@index([userId,revokedAt])
}
```

### FarmInvitation

```prisma
model FarmInvitation {
  id String @id @default(uuid())
  farmId String
  email String @db.VarChar(254)
  tokenHash String @unique
  expiresAt DateTime
  usedAt DateTime?
  revokedAt DateTime?
  createdAt DateTime @default(now())
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  @@index([farmId,createdAt])
}
```

### FarmDiary

```prisma
model FarmDiary {
  id String @id @default(uuid())
  farmId String
  workDate String @db.VarChar(10)
  title String @db.VarChar(120)
  content String @db.VarChar(5000)
  version Int @default(1)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  photos DiaryPhoto[]
  @@index([farmId, workDate])
}
```

### FarmRecord

```prisma
model FarmRecord {
  id String @id @default(uuid())
  farmId String
  kind String @db.VarChar(16)
  data Json
  provenance Json?
  version Int @default(1)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  @@index([farmId, kind, createdAt])
}
```

### DiaryPhoto

```prisma
model DiaryPhoto {
  id String @id @default(uuid())
  diaryId String
  fileId String
  caption String @db.VarChar(200)
  createdAt DateTime @default(now())
  diary FarmDiary @relation(fields: [diaryId], references: [id], onDelete: Restrict)
  file StoredFile @relation(fields: [fileId], references: [id], onDelete: Restrict)
  @@unique([diaryId, fileId])
}
```

### FarmSensor

```prisma
model FarmSensor {
  id String @id @default(uuid())
  farmId String
  name String @db.VarChar(100)
  kind String @db.VarChar(20)
  minValue Float
  maxValue Float
  staleMinutes Int @default(60)
  tokenHash String @unique @db.VarChar(64)
  simulated Boolean @default(false)
  revokedAt DateTime?
  createdAt DateTime @default(now())
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  readings SensorReading[]
  @@index([farmId, createdAt])
}
```

### SensorReading

```prisma
model SensorReading {
  id String @id @default(uuid())
  sensorId String
  sampleId String @db.VarChar(80)
  value Float
  measuredAt DateTime
  receivedAt DateTime @default(now())
  sensor FarmSensor @relation(fields: [sensorId], references: [id], onDelete: Restrict)
  @@unique([sensorId, sampleId])
  @@index([sensorId, measuredAt])
}
```

### FarmProduct

```prisma
model FarmProduct {
  id String @id @default(uuid())
  farmId String
  name String @db.VarChar(120)
  unit String @db.VarChar(40)
  priceWon Int
  stock Int
  version Int @default(1)
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  orders FarmOrder[]
  @@index([farmId, createdAt])
}
```

### FarmOrder

```prisma
model FarmOrder {
  id String @id @default(uuid())
  productId String
  requestKey String @db.VarChar(80)
  buyerLabel String @db.VarChar(80)
  quantity Int
  totalWon Int
  status String @default("RESERVED") @db.VarChar(16)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  product FarmProduct @relation(fields: [productId], references: [id], onDelete: Restrict)
  payment FarmPayment?
  @@unique([productId, requestKey])
}
```

### FarmConsultation

```prisma
model FarmConsultation {
  id String @id @default(uuid())
  farmId String
  requestKey String @db.VarChar(80)
  requestHash String @db.VarChar(64)
  question String @db.VarChar(2000)
  answer String? @db.VarChar(6000)
  mode String @db.VarChar(20)
  status String @db.VarChar(20)
  sources Json
  usageTokens Int @default(0)
  reservedTokens Int @default(0)
  quotaDay String? @db.VarChar(10)
  errorCode String? @db.VarChar(60)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  farm Farm @relation(fields: [farmId], references: [id], onDelete: Restrict)
  @@unique([farmId, requestKey])
  @@index([farmId, createdAt])
}
```

### AiQuota

```prisma
model AiQuota {
  id String @id @default(uuid())
  ownerId String
  day String @db.VarChar(10)
  reservedTokens Int @default(0)
  requests Int @default(0)
  owner User @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  @@unique([ownerId, day])
}
```

### FarmPayment

```prisma
model FarmPayment {
  id String @id @default(uuid())
  orderId String @unique
  requestKey String @db.VarChar(80)
  amountWon Int
  provider String @db.VarChar(20)
  status String @default("PENDING") @db.VarChar(20)
  providerKey String? @unique @db.VarChar(200)
  eventHash String? @db.VarChar(64)
  version Int @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  order FarmOrder @relation(fields: [orderId], references: [id], onDelete: Restrict)
  events PaymentEvent[]
}
```

### PaymentEvent

```prisma
model PaymentEvent {
  id String @id @default(uuid())
  paymentId String
  action String @db.VarChar(32)
  requestKey String @db.VarChar(80)
  createdAt DateTime @default(now())
  payment FarmPayment @relation(fields: [paymentId], references: [id], onDelete: Restrict)
  @@unique([paymentId, requestKey])
}
```

[원본 스키마](../../apps/api/prisma/schema.prisma). 위 스키마는 자격증명이나 DB 행을 포함하지 않습니다. 마이그레이션은 apps/api/prisma/migrations에 있으며 기존 열과 데이터를 보존합니다.

[문서센터](../README.md) · [기능 설명](기능-설명.md) · [개발현황](../CT-Farm-개발현황.md)
