// 수동 코드 검토로 작성한 흐름입니다. 분석기가 파일/기호의 존재를 다시 확인합니다.
const auth='apps/api/src/modules/auth/',files='apps/api/src/modules/files/',platform='apps/api/src/modules/platform/';
const step=(label,file,symbol)=>({label,file,symbol});
const authFlow=(name,method)=>({name,trigger:'해당 인증 API 요청',steps:[step('DTO 입력 검증',auth+'auth.dto.ts',method==='register'?'registerSchema':'loginSchema'),step('인증 업무 처리',auth+'auth.service.ts',method),step('세션·회원 저장',auth+'auth.repository.ts',method==='register'?'createUserWithSession':'createSession')]});
export const workflows=[
 authFlow('회원가입','register'),authFlow('로그인','login'),
 {name:'이메일 인증',trigger:'인증 메일 요청 후 사용자 확인',steps:[step('토큰 발행·해시 저장',platform+'account.service.ts','requestAccountAction'),step('전송 계약',platform+'mail.ts','getMailTransport'),step('일회용·만료·회원 버전 검증',platform+'account.service.ts','consumeAccountAction')]},
 {name:'로그아웃',trigger:'로그아웃 API 요청',steps:[step('세션 해제 요청',auth+'auth.service.ts','logout'),step('Refresh 세션 해제',auth+'auth.repository.ts','revokeSession')]},
 {name:'토큰 발급 및 갱신',trigger:'로그인 또는 refresh 요청',steps:[step('서명된 15분 Access Token', 'apps/api/src/common/auth.middleware.ts','createAccessToken'),step('Refresh 검증·회전',auth+'auth.service.ts','refresh'),step('DB 원자적 세션 갱신',auth+'auth.repository.ts','rotateSession')]},
 {name:'비밀번호 재설정',trigger:'RESET 메일 요청 및 새 비밀번호 제출',steps:[step('메일 요청',platform+'account.service.ts','requestAccountAction'),step('소비·비밀번호 해시·세션 무효화',platform+'account.service.ts','consumeAccountAction')]},
 {name:'권한 검사',trigger:'보호된 API 요청',steps:[step('JWT 및 회원 상태', 'apps/api/src/common/auth.middleware.ts','requireAuth'),step('ADMIN 역할·MFA 검사',platform+'admin.controller.ts','requireAdmin')]},
 {name:'API 요청 처리',trigger:'HTTP 요청',steps:[step('요청 ID','apps/api/src/bootstrap/observability/request-context.ts','requestContext'),step('보안 미들웨어·라우팅','apps/api/src/bootstrap/app.ts','app'),step('전역 오류 응답','apps/api/src/bootstrap/error-handler.ts','globalErrorHandler')]},
 {name:'CRUD',trigger:'notes API 요청',steps:[step('입력·소유자 검증','apps/api/src/modules/notes/notes.controller.ts','notesRouter'),step('업무 처리','apps/api/src/modules/notes/notes.service.ts','notesService'),step('DB 접근','apps/api/src/modules/notes/notes.repository.ts','notesRepository')]},
 {name:'파일 업로드',trigger:'multipart 업로드',steps:[step('인증·제한·Multer',files+'files.controller.ts','filesRouter'),step('시그니처·중복·저장 조정',files+'files.service.ts','upload'),step('안전한 경로에 저장',files+'storage/local.storage.ts','save'),step('메타데이터 DB 저장',files+'files.repository.ts','create')]},
 {name:'이미지 업로드',trigger:'지원 이미지 파일 업로드',steps:[step('파일 검증',files+'files.security.ts','validateUploadedFile'),step('이미지 재인코딩',files+'image.processing.ts','normalizeImage'),step('정규화된 결과 저장',files+'files.service.ts','upload')]},
 {name:'이미지 미리보기',trigger:'thumbnail API 요청',steps:[step('소유자 다운로드 검사',files+'files.service.ts','download'),step('썸네일 생성',files+'image.processing.ts','thumbnail')]},
 {name:'파일 다운로드',trigger:'인증된 다운로드 요청',steps:[step('소유자 검사',files+'files.service.ts','download'),step('파일 핸들 열기',files+'storage/local.storage.ts','openRead'),step('스트림 응답',files+'files.controller.ts','pipeline')]},
 {name:'이메일 발송',trigger:'계정 인증 메일 요청',steps:[step('제공자 선택',platform+'mail.ts','getMailTransport'),step('SMTP 전송',platform+'smtp.ts','send')]},
 {name:'오류 처리',trigger:'라우터 또는 업무 처리 실패',steps:[step('타입 있는 오류','apps/api/src/common/app-error.ts','AppError'),step('안전한 HTTP 응답','apps/api/src/bootstrap/error-handler.ts','globalErrorHandler')]},
 {name:'로그 기록',trigger:'요청 완료 또는 애플리케이션 이벤트',steps:[step('Pino 마스킹','apps/api/src/infrastructure/logger.ts','logger'),step('개발 전용 허용 필드','tools/developer-event.mjs','safeEvent'),step('포털 재검증','tools/dev-portal/events.mjs','readEvents')]},
 {name:'데이터베이스 저장',trigger:'업무별 쓰기 요청',steps:[step('Prisma 연결','apps/api/src/infrastructure/prisma.ts','prisma'),step('회원·세션 원자적 저장',auth+'auth.repository.ts','createUserWithSession')]},
 {name:'Redis 처리',trigger:'요청 제한 또는 세션 작업',steps:[step('연결 공유','apps/api/src/infrastructure/redis.ts','connectRedis'),step('요청 제한 저장소','apps/api/src/infrastructure/rate-limit.ts','RedisStore')]},
 {name:'백그라운드 작업',trigger:'확인되지 않음',steps:[],note:'독립 작업 큐/워커 미구현'},
 ...[['SETUP.exe','Do-Setup'],['STARTER.exe','Do-Start'],['STOP.exe','Do-Stop']].map(([name,symbol])=>({name,trigger:'Windows에서 같은 이름의 EXE 실행',note:'첨부 EXE 없음. Windows 실행 미검증.',steps:[step('런처가 PowerShell Action 선택','tools/SecureStarterLauncher.cs','Main'),step('설치/실행/종료 담당 함수','SECURE-LIFECYCLE.ps1',symbol)]}))
];
