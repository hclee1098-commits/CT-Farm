// 검토한 설명과 실제 소스 목록을 결합합니다. 실행 성공 상태는 자동 추정하지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
const dir='docs/09-CT-Farm-안내';fs.mkdirSync(dir,{recursive:true});
const write=(name,title,text)=>fs.writeFileSync(`${dir}/${name}.md`,`# ${title}\n\n기준일: 2026-10-30. 구현 파일의 존재와 운영 검증을 구분합니다. 최신 웹·별도 앱 범위는 [모바일 앱과 디자인](모바일앱과-디자인.md), 음성·협업·장애 검증은 [6차 결과](6차-음성과-실행복구.md)를 함께 읽으세요.\n\n${text}\n\n[문서센터](../README.md) · [기능 설명](기능-설명.md) · [개발현황](../CT-Farm-개발현황.md)\n`);
write('시작','CT-Farm 문서센터 이용 안내',`CT-Farm은 농장·영농일지·센서·판매 기록을 한곳에서 관리하는 플랫폼입니다. 현재 전체 운영 서비스가 완성된 상태는 아닙니다. 아래 안내는 실제 소스의 기능과 제한을 함께 설명합니다.

## 원하는 안내 찾기

- 처음 시작: [설치·실행·백업](설치-운영.md)
- 새 웹·모바일 앱: [실행·설치·디자인·검증 범위](모바일앱과-디자인.md)
- 농민과 운영자: [전체 기능 사용 설명](기능-설명.md)
- 개발자: [구조와 데이터 흐름](시스템-구조.md), [기술·환경·보안](개발자-안내.md), [API·DB 목록](API-데이터-목록.md)
- 외부 연동 담당자: [미완성 기능과 준비 사항](외부-연동.md)
- 디자인 담당자: [브랜드 사용 가이드](브랜드-가이드.md)
- 검증 담당자: [문서 검증과 정리 기준](문서-관리.md)
- 공통 기반 검증: [실제 검증 상태·실행 명령·운영 준비](공통기반-검증.md)
- 4차 이력: [모바일 앱·읽기 공유·사진 복구·Linux·운영 알림](4차-모바일과-운영.md)

- 최신 6차: [실행 복구·음성 비서·작업 협업·검증 한계](6차-음성과-실행복구.md)
- 5차 이력: [검증 증거와 권한 후보](5차-검증과-권한확장.md)

## 문서 화면 사용법

상단 검색창은 제목과 본문을 함께 검색합니다. 왼쪽 분류에서 문서를 선택하고 오른쪽 목차를 누르면 해당 설명으로 이동합니다. 좁은 화면에서는 문서 목록과 목차를 접어 사용할 수 있습니다. 문서 끝에는 관련 문서가 있습니다. 최종 수정일은 실제 파일 수정 시각이며 기능 검증일을 뜻하지 않습니다.

앱의 ‘도움말 · 문서’ 메뉴는 검토한 안내만 보여줍니다. 내부 개발 기록 전체는 기존 로컬 개발자 포털의 접근키 보호 문서센터에서 확인합니다. 접근키는 주소·문서에 기록하지 않습니다.

## 상태 읽는 법

| 표시 | 뜻 |
|---|---|
| 구현 및 검증 완료 | 명시된 시험 범위에서 통과. 운영 준비 완료를 의미하지 않음 |
| 구현되었으나 검증 미완료 | 코드가 있지만 해당 환경의 실제 동작 증거 없음 |
| 부분 구현 | 일부 흐름만 지원 |
| 개발 예정 | 실행 기능 없음 |
| 외부 API 또는 장치 연동 대기 | 키·승인·장치 확보와 실제 통합 검증 필요 |`);
const farmPage='apps/web/src/app/starter/farms/[id]/page.tsx';
const base='apps/api/src/modules/farms/';
const items=[
 ['농장 등록·수정·보관','농장 위치·주소·면적을 관리합니다.','내 농장 → 농장 등록 또는 상세 수정. 삭제는 보관이며 복원할 수 있습니다.','apps/web/src/app/starter/farms/page.tsx',base+'farms.controller.ts','/api/v1/farms','Farm','구현 및 검증 완료','좌표·면적 입력, 버전 충돌·소유권·보관·복원 검사. 법적 토지 소유권을 확인하는 기능은 없습니다.'],
 ['필지·경계','농장 안의 재배 구역을 나눕니다.','농장 상세 → 필지. 경계 좌표와 면적을 입력합니다.',farmPage,base+'operations.controller.ts','/api/v1/farms/:id/records (kind=PLOT)','FarmRecord','구현 및 검증 완료','입력 범위·교차 경계·타 농장 접근 차단 검사. 지적 측량을 대체하지 않습니다.'],
 ['작기·작물·생육·수확','어떤 품종을 언제 심고 수확하는지 남깁니다.','농장 상세 → 작기·수확. 작물·품종·날짜·필지를 선택합니다.',farmPage,base+'operations.dto.ts','/api/v1/farms/:id/records (CROP/HARVEST)','FarmRecord','구현 및 검증 완료','필지 소속·날짜·단위 검증. 작물 전문 생육 모델과 품종 사전은 개발 예정입니다.'],
 ['지도·좌표 변환','농장과 필지 위치를 도면에서 확인합니다.','농장 상세 → 지도. 키가 있으면 네이버 지도 불러오기를 누릅니다.','apps/web/src/app/starter/farms/NaverMap.tsx',base+'maps.controller.ts','/api/v1/maps/config; /maps/boundary/preview; /farms/:id/plots/import','Farm, FarmRecord','외부 API 또는 장치 연동 대기','EPSG:5179 기준점·100㎡·SDK 어댑터 검증. 실제 네이버 인증·타일 및 팜맵 WMS/WFS는 미검증입니다.'],
 ['영농일지·생육 메모','작업과 현장 상태를 날짜별로 기록합니다.','농장 상세 → 영농일지 → 작성·수정·보관. 생육은 메모와 작기로 기록합니다.',farmPage,base+'farms.controller.ts','/api/v1/farms/:id/diary','FarmDiary','구현 및 검증 완료','CRUD·충돌·보관·복원·격리 검사. 전문 생육 측정 템플릿은 부분 구현입니다.'],
 ['일지 사진','현장 사진을 일지에 연결합니다.','일지 사진에서 업로드·조회·연결 삭제를 사용합니다.','apps/web/src/app/starter/farms/DiaryPhotos.tsx',base+'operations.controller.ts','/api/v1/farms/:id/diary/:childId/photos; /api/v1/files','DiaryPhoto, StoredFile','구현 및 검증 완료','파일 소유권·형식·연결 권한 검사. 사진 연결 삭제와 원본 파일 삭제는 구분됩니다.'],
 ['작업 일정','해야 할 농작업과 완료 상태를 관리합니다.','농장 상세 → 일정 → 할 일 작성·완료 표시.',farmPage,base+'operations.controller.ts','/api/v1/farms/:id/records (TASK)','FarmRecord','구현 및 검증 완료','날짜·상태·버전 검사. 외부 캘린더 동기화는 개발 예정입니다.'],
 ['날씨·위험','위치 기반 기상과 조건별 위험을 참고합니다.','농장 상세 → 날씨. 비활성·오류·자료 시각을 확인합니다.',farmPage,base+'weather.service.ts','/api/v1/farms/:id/weather','Farm (날씨 응답은 전용 DB 테이블 없음)','부분 구현','위험 규칙·캐시·오류 검사. 공급자 설정과 사용 조건 확인 필요. 기상청 공식 특보 전달은 미구현입니다.'],
 ['센서 등록·시각화·시뮬레이터','측정값과 임계값을 확인합니다.','농장 상세 → 센서 → 등록 → 모의 측정 또는 측정 이력.',farmPage,base+'operations.controller.ts','/api/v1/farms/:id/sensors; /sensors/:childId/readings; /simulate','FarmSensor, SensorReading','구현 및 검증 완료','모의 데이터·범위·키·중복 측정 검사. 물리 장치의 정확성·교정은 검증하지 않았습니다.'],
 ['실장치 수집·키 교체','장치가 인증된 JSON 측정을 전송합니다.','소유자가 장치 키를 발급·교체한 뒤 참고 클라이언트를 설정합니다.',farmPage,base+'operations.service.ts','/api/v1/sensor-ingest/:id; /farms/:id/sensors/:childId/rotate-key','FarmSensor, SensorReading','외부 API 또는 장치 연동 대기','HTTP 장치 모의 시험 통과. MQTT·물리 센서·원격 제어 승인 체계는 미완성. commands는 501을 반환합니다.'],
 ['알림·자동 점검·위험 분석','일정·센서·기상 위험을 찾아 알려줍니다.','농장 상세 → 상태 점검; 상단 알림에서 읽음·처리 상태 확인.',farmPage,base+'assistant.worker.ts','/api/v1/farms/:id/check; /advice; /api/v1/notifications','Notification, FarmRecord, FarmSensor','부분 구현','규칙·중복 억제·worker 검사. 자동 점검은 별도 설정이 필요하고 실제 상시 운영·외부 푸시는 미검증입니다.'],
 ['농사 상담·대화 이력','농장 문맥과 참고 자료를 확인하며 질문합니다.','농장 상세 → 농사 상담. 자료 안내 또는 외부 전송 동의 후 모델 모드 선택.','apps/web/src/app/starter/farms/ConsultationChat.tsx',base+'consultation.controller.ts','/api/v1/farms/:id/consultations','FarmConsultation, AiQuota','부분 구현','자료 안내·이력 격리·예산·모의 공급자 오류 검사. 실제 모델 응답은 키가 없어 미검증입니다.'],
 ['농업 자료 검색·안전 검토','공식 자료의 탐색 경로와 검토 필요 상태를 표시합니다.','상담 결과의 출처를 확인합니다. 약제 질문은 전문가 확인이 필요합니다.','apps/web/src/app/starter/farms/ConsultationChat.tsx',base+'knowledge.ts','/api/v1/farms/:id/knowledge','FarmConsultation.sources (정적 탐색 색인)','부분 구현','허용 출처·위험 표현 검사. 상세 재배 문서 RAG·라벨 검증·검색 평가·전문가 승인 체계는 미완성입니다.'],
 ['농장 맞춤 추천·확인 후 일정 생성','점검 이유를 읽고 추천을 할 일로 저장합니다.','농장 상세 → 추천 → 확인란 선택 → 일정 추가.',farmPage,base+'operations.service.ts','/api/v1/farms/:id/advice; /advice/task','FarmRecord, Notification','부분 구현','근거·동의·중복 요청 검사. 규칙 기반이며 실제 농작업이나 장치를 자동 실행하지 않습니다.'],
 ['상품·재고','판매 단위와 가격·재고를 기록합니다.','농장 상세 → 판매 상품 → 등록·수정.',farmPage,base+'operations.controller.ts','/api/v1/farms/:id/products','FarmProduct','구현 및 검증 완료','가격·재고·버전 충돌·동시 주문 검사. 구매자 공개 상점은 개발 예정입니다.'],
 ['수기 주문·상태·취소','전화·직거래 주문을 농장주가 기록합니다.','농장 상세 → 상품 주문 → 주문 상태 변경.',farmPage,base+'operations.controller.ts','/api/v1/farms/:id/products/:childId/orders; /orders','FarmOrder, FarmProduct','구현 및 검증 완료','예약 차감·취소 시 단일 복원·상태 전이 검사. 배송사·구매자 계정 연동은 개발 예정입니다.'],
 ['매출·비용·수확 기록','경영 참고 자료를 수기로 남깁니다.','농장 상세 → 경영·수확 기록.',farmPage,base+'operations.controller.ts','/api/v1/farms/:id/records (LEDGER/HARVEST)','FarmRecord','구현 및 검증 완료','입력·금액·격리 검사. 세금 신고·회계 결산·스마트스토어 연동은 미구현입니다.'],
 ['시험 결제·환불','주문 금액을 서버에서 확인하고 시험 상태를 관리합니다.','농장 상세 → 시험 결제. 기본 비활성 상태에서는 생성할 수 없습니다.','apps/web/src/app/starter/farms/PaymentsPanel.tsx',base+'payment.controller.ts','/api/v1/farms/:id/payments','FarmPayment, PaymentEvent, FarmOrder','부분 구현','모의 승인·위변조·멱등성·환불 재고 검사. 토스 실제 테스트 호출·결제창·웹훅·부분환불·실결제는 미완성입니다.'],
 ['가입·로그인·로그아웃·탈퇴·내보내기','사용자 계정과 개인정보를 관리합니다.','상단 가입·로그인; 계정 보안에서 탈퇴·내보내기.','apps/web/src/app/starter/_lib/auth.tsx','apps/api/src/modules/auth/auth.controller.ts','/api/v1/auth; /api/v1/account','User, RefreshSession, AccountAction','구현 및 검증 완료','세션 회전·폐기·MFA·정지·입력 검사. 메일 전달은 SMTP 설정과 별도 실수신 검증이 필요합니다.'],
 ['사용자 권한·농장 접근·관리자','타인의 자료를 보호합니다.','자신의 농장만 표시. 관리자 메뉴는 ADMIN만 이용합니다.','apps/web/src/app/starter/_components/Shell.tsx','apps/api/src/common/auth.middleware.ts','/api/v1/admin; 모든 농장 API','User, AuditEvent','구현 및 검증 완료','다계정 격리·관리자 거부·정지·세션 검사. 별도 workspace 경로에서 읽기 전용 멤버 초대를 지원합니다. 관리자·작업자 쓰기 공유는 미구현이며 플랫폼 관리자도 기존 소유권을 우회하지 않습니다.'],
 ['게시글·파일·페이지 공통 UI','기존 Starter 기능을 재사용합니다.','상단 게시글·파일 관리와 공통 대화상자·페이지 이동을 이용합니다.','apps/web/src/app/starter/_components/Shell.tsx','apps/api/src/modules/files/files.controller.ts','/api/v1/notes; /api/v1/files','Note, StoredFile, IdempotentRequest','구현 및 검증 완료','권한·파일 실형식·경로·링크 보안·삭제 복구 검사. Windows 파일 symlink는 EPERM 때 junction 대체 범위로 구분합니다.'],
 ['감사·보안·모니터링·배포·백업','운영 변경을 추적하고 복구를 준비합니다.','운영 담당자는 로컬 포털과 백업·배포 도구를 사용합니다.','tools/dev-portal/app.js','apps/api/src/bootstrap/app.ts','/health; /api/v1 (정확한 health 경로는 API 목록 참조)','AuditEvent 및 암호화 백업 파일','부분 구현','로컬 도구·보안·백업 시험 존재. 실제 운영 배포·오프사이트 DB+파일 복구·보존 정책은 추가 검증이 필요합니다.']
];
write('기능-설명','전체 기능 사용 방법과 구현 근거',`## 먼저 알아두세요

각 항목의 검증 상태는 명시한 시험 범위에 한정됩니다. 현재 실행 결과는 [문서 관리](문서-관리.md)에 별도로 기록합니다. 기존 농장 쓰기는 로그인한 소유자 범위이며 읽기 공유는 별도 workspace 경로에서만 제공하고, API는 화면을 숨기는 것과 별도로 서버에서 권한을 검사합니다. 공통 오류: 400 입력, 401 인증, 404 권한 범위의 자료 없음, 409 버전·중복·상태 충돌입니다.

${items.map(([name,purpose,usage,front,back,api,table,status,note])=>`## ${name}\n\n- 목적: ${purpose}\n- 사용법·화면 위치: ${usage}\n- 프론트엔드: [${front}](../../${front})\n- 백엔드: [${back}](../../${back})\n- API: \`${api}\` (개별 하위 경로는 API 목록 참조)\n- 데이터베이스: ${table}\n- 의존성: 기존 인증·입력 검증·PostgreSQL, 농장 기능은 농장 소유권 검사. 외부 공급자 설정은 외부 연동 안내 참조.\n- 보안·접근 권한: 사용자 세션과 서버 권한 검사. 장치 수집은 별도 장치 키만 사용. 비밀키를 브라우저에 저장하지 않음.\n- 현재 구현 상태: **${status}**\n- 테스트·알려진 문제·개선: ${note}\n- 검증 근거: API·웹 단위 테스트 및 tools/test-farm.mts 계열 통합 시험. 이번 실행 결과와 이전 보고는 문서 관리에서 구분.\n- 관련 문서: [시스템 구조](시스템-구조.md), [외부 연동](외부-연동.md)`).join('\n\n')}`);
write('설치-운영','처음 설치하고 실행·종료·백업하기',`## 준비와 설치

Windows PowerShell 5.1, Node.js 22 이상, Docker Desktop을 준비합니다. 기존 설치가 있으면 먼저 소스·DB·업로드를 따로 백업합니다. 아래 설치 명령은 새 설치에 사용합니다. 기존 환경파일을 예시로 덮어쓰지 않습니다.

\`\`\`powershell
Set-Location C:\\workspace\\CT-Farm
.\\SECURE-LIFECYCLE.ps1 -Action SETUP
.\\SECURE-LIFECYCLE.ps1 -Action STARTER
\`\`\`

SETUP이 안내하는 주소를 엽니다. 보통 웹은 http://localhost:3000 입니다. Docker의 PostgreSQL·Redis와 로컬 앱을 런처가 관리하므로 별도로 새 compose 구성을 만들 필요가 없습니다. 처음에는 가입 → 로그인 → 내 농장 → 농장 등록 → 일지 작성 순으로 사용합니다. 지도·AI·결제는 기본 설정만으로 외부 유료 서비스를 호출하지 않습니다.

## 종료와 재시작

\`\`\`powershell
.\\SECURE-LIFECYCLE.ps1 -Action STOP
.\\SECURE-LIFECYCLE.ps1 -Action STARTER
\`\`\`

STOP은 프로젝트 프로세스 종료용입니다. 오류 해결을 위해 DB reset이나 Docker volume 삭제 명령을 사용하지 않습니다.

## 환경과 DB 확인

환경 예시는 apps/api/.env.example에 있습니다. 실제 값은 비공개 환경파일에만 둡니다. DATABASE_URL이 대상 DB를 가리키는지 확인하되 출력·스크린샷에 비밀번호를 노출하지 않습니다. Docker Desktop에서 프로젝트 컨테이너의 실행 상태와 로그를 확인합니다. 개발자 직접 실행은 기존 [설치 안내](../01-시작하기/설치와-실행.md)를 따릅니다. npm run db:deploy는 데이터 보존 마이그레이션이지만 백업과 대상 확인 후 실행해야 합니다.

## 백업과 복구

소스 ZIP, 암호화 DB 백업, 업로드 파일, 복호화 키는 별개입니다. 소스 ZIP만으로 사용자 데이터를 복구할 수 없습니다. 키는 백업과 다른 안전한 장소에 보관합니다. 기존 [백업 설명](../05-운영과보안/배포와-백업복구.md)이 실제 도구의 옵션을 설명합니다. 원본에 즉시 복원하지 말고 별도 DB와 폴더에 복원하여 레코드·파일·권한·로그인·마이그레이션을 검사한 후 전환합니다. 복구 작업은 운영 담당자와 진행합니다.

## 오류 확인과 운영 차이

화면이 열리지 않으면 STARTER 출력의 실제 포트, Docker 상태, API 상태, 브라우저 오류를 확인합니다. 로그인 실패는 쿠키 허용·서버 주소·계정 정지 상태를 확인합니다. 409는 최신 자료를 다시 읽고 수정합니다. 외부 연동 비활성 표시는 실패 은폐가 아니라 미설정 안내입니다.

개발환경은 localhost·모의 데이터 시험용입니다. 운영은 HTTPS·허용 Origin·서버 비밀관리·SMTP·백업 보존·상시 감시·실장치·부하/접근성/복원 검증이 필요합니다. 시험 결제를 실제 판매 결제로 사용하지 않습니다.`);
write('개발자-안내','개발자를 위한 코드·보안·테스트·배포 안내',`## 디렉터리와 의존성

| 경로 | 역할 |
|---|---|
| apps/web/src/app/starter | Next.js 화면과 인증 컨텍스트 |
| apps/web/src/shared | 공통 UI·API 지원 코드 |
| apps/api/src/bootstrap | 서버 시작·미들웨어·라우터 조합 |
| apps/api/src/common | 인증·스키마 검증·응답·오류 |
| apps/api/src/modules | auth, notes, files, platform, farms 도메인 |
| apps/api/prisma | PostgreSQL 모델과 순차 마이그레이션 |
| tools | 백업·검증·문서·배포·모니터링 |
| docs / verification | 설명 원본 / 시험 결과와 증거 |

화면은 공유 API 클라이언트를 통해 Express에 요청합니다. Controller는 인증·검증 후 서비스와 Prisma를 사용합니다. 농장 변경은 소유권과 transaction·버전 조건으로 충돌을 검사합니다. FarmRecord는 PLOT/CROP/TASK/LEDGER/HARVEST JSON을 Zod로 종류별 검증합니다. JSON의 plotId 관계는 SQL 외래키가 아니라 서비스 검사입니다.

## API 계약·오류·권한

[API·DB 목록](API-데이터-목록.md)은 실제 라우트 선언과 모델을 추출합니다. 동적 선언은 별도 표시되므로 소스 DTO와 함께 읽습니다. 요청 필드의 정확한 범위는 farms.dto.ts, operations.dto.ts와 각 controller의 Zod 스키마가 기준입니다. 공통 응답은 apps/api/src/common/response.ts, 오류는 bootstrap/error-handler.ts를 따릅니다. 요청 성공 여부는 HTTP 상태와 응답의 성공 필드를 함께 확인합니다. 사용자 ID를 클라이언트 입력으로 신뢰하지 않습니다. 조회·수정 모두 소유권을 확인하며 보관 자료는 별도 복원 절차만 허용합니다.

인증은 JWT·RefreshSession·HttpOnly 쿠키·세션 폐기와 MFA를 재사용합니다. 관리자 검사는 서버에서 수행합니다. CORS·보안 헤더·요청 제한·파일 실형식/경로 검증과 감사 로그를 유지합니다. 센서 토큰은 해시로 저장하며 발급/교체 시 한 번만 노출합니다. AI·PG 비밀키는 서버 전용입니다. 공개 지도 ID와 서버 비밀키는 다릅니다.

## 환경변수·백그라운드 작업

전체 변수명·검증 규칙은 apps/api/src/config/env.schema.ts와 .env.example을 확인합니다. DATABASE_URL, REDIS_URL, JWT 관련 키와 Origin 설정이 기반입니다. WEATHER_MODE, AI_MODE, AI_DAILY_TOKEN_LIMIT, NAVER_MAP_KEY_ID, PAYMENT_MODE 등 외부 설정은 [외부 연동](외부-연동.md)에 설명합니다. 실제 값을 문서에 복사하지 않습니다. assistant.worker.ts는 설정에 따라 주기적으로 소유 농장을 점검하고 알림을 저장합니다. 전용 분산 작업 큐나 물리 제어 worker가 아닙니다.

## 검증과 배포

\`\`\`powershell
npm run check:source
npm test
npm run test:farm
npm run test:sql
npm run test:backup
npm run test:docs
node --test tools/docs-center.test.mjs
npm run build
npm audit
npm run docs:index
npm run docs:check
\`\`\`

test:farm은 격리 PGlite DB와 실제 Prisma/HTTP를 사용하며 외부 AI·결제는 모의 응답입니다. 실제 PostgreSQL 격리 복원 검증 도구는 tools/verify-farm-postgres.mjs입니다. 원본에 fixture를 넣지 않습니다. 이번 문서/브랜드 변경은 DB migration이 없습니다. npm run db:deploy를 운영에 실행하기 전 암호화 DB·파일 백업과 별도 복원 검증이 필요합니다. db:migrate는 개발용이며 reset을 복구 수단으로 사용하지 않습니다.

배포는 기존 tools/deployment 도구와 운영 문서를 사용합니다. source build 통과는 운영 배포 완료가 아닙니다. HTTPS·비밀주입·마이그레이션·readiness·트래픽 전환·복구 지점·백업 복원을 확인합니다. 문서 빌드는 검토한 문서만 allowlist로 공개합니다. 과거 내부 기록은 접근키 보호 포털에 남습니다.`);
write('외부-연동','외부 서비스·미완성 기능과 준비 사항',`## 실제 연결과 모의 시험을 구분합니다

| 항목 | 현재 상태 | 필요한 준비·다음 검증 |
|---|---|---|
| 네이버 지도 | 어댑터·도면 구현, 실연동 대기 | 공개 Key ID·도메인 등록·허용 API·실제 인증/타일 시험 |
| 팜맵 | EPSG:5179/4326 좌표 입력·변환 지원 | 승인키·사용권·갱신 주기·WMS/WFS 구현과 정확성 검증 |
| 날씨 | 선택 공급자 모드·위험 규칙 | 이용조건·자료 시각·누락/장애·지역 정확성 확인, 공식 특보 미구현 |
| 생성형 AI | 서버 어댑터·동의·예산·모의 시험 | 서버 AI_API_KEY·명시 모델·비용·인용·안전 평가 |
| 자료 검색 | 공식 포털 탐색 색인 | 상세 문서 이용허락·수집·갱신·문서별 근거·RAG 평가 |
| 실장치 | Device JSON 수집·키교체·참고 클라이언트 | 물리 센서·교정·통신 지연·현장 시험·MQTT 별도 개발 |
| 원격 제어 | 501 비활성 | 권한·명시 승인·인터록·긴급정지·실행 확인 모델 개발 |
| 결제 | DISABLED 기본, 모의·TOSS_TEST 어댑터 | 테스트 계정·결제창·웹훅·대조·장애 복구·부분환불·정산 |
| 실결제·스마트스토어 | 개발 예정 | 계약·인증·승인·보안 검증. 실결제 자동 활성화 경로 없음 |
| 이메일·운영 | SMTP 등 설정 필요 | 실제 발송/수신·운영 인증서·감시·복구 훈련 |

## 농업 안전과 개인정보

자료 안내는 생성형 AI가 아닙니다. 농약·비료 용량/혼용 질문은 검토 필요 상태로 보류합니다. 패턴 차단이 완전한 안전 보장은 아닙니다. 최신 등록·작물·라벨·전문가 확인을 거치기 전 처방 서비스로 운영하지 않습니다. 모델 모드에서는 질문과 일부 일지·대화가 전송되므로 요청별 동의가 필요합니다. 주소·좌표·장치키를 자동 전송하지 않더라도 자유 텍스트 개인정보는 작성자가 주의해야 합니다.

구체적인 API 필드·실험 조건·이전 공식 출처는 내부 [2차 운영 안내](../CT-Farm-2차-운영안내.md)를 참조합니다. 이 문서 작성으로 외부 공급자의 최신 계약 조건을 새로 검증한 것은 아닙니다.`);
write('브랜드-가이드','CT-Farm 로고·색상·아이콘 사용 가이드',`## 브랜드와 형태

CT-Farm은 농민과 농장, 데이터와 AI를 연결합니다. 기존 CT-Farm 문자명을 유지하고 C 형태의 외곽, 새싹, 연결 노드를 결합했습니다. 단순한 윤곽을 사용해 작은 아이콘에서 구분하도록 설계했습니다. 상표 등록·유사 상표 법률 검토는 수행하지 않았습니다.

## 원본과 배포 파일

원본은 apps/web/public/brand의 SVG입니다. logo-light.svg는 밝은 바탕, logo-dark.svg는 짙은 바탕, symbol.svg는 심볼, app-icon.svg는 앱, favicon.svg는 작은 웹 아이콘입니다. 같은 이름 PNG와 app-icon-192.png·app-icon-512.png, public/favicon.ico가 있습니다. preview.png는 배경 비교용입니다. tools/build-brand.mjs에서 모두 재생성합니다. 가로형 문자는 Segoe UI/Arial 계열을 사용하므로 환경에 따라 미세한 글꼴 차이가 생길 수 있습니다. 대외 인쇄 전 글자 윤곽 확정이 권장됩니다.

## 색상

| 용도 | HEX |
|---|---|
| 주 녹색 | #137548 |
| 짙은 배경·문자 | #103F30 |
| 밝은 배경용 문자 | #103F30 |
| 어두운 배경용 심볼 | #B4E791 |
| 데이터 연결 강조 | #39A995 |
| 어두운 배경용 문자 | #F2FFF7 |

심볼 주변은 폭의 1/8 이상 비우고, 가로형은 최소 132px·심볼은 24px를 권장합니다. 16px 파비콘은 전용 favicon을 씁니다. 비율·색상·노드 위치를 임의로 바꾸거나 복잡한 사진 위에 직접 겹치지 않습니다. 아이콘의 강조색은 작은 장식용이며 본문 글자색으로 사용하지 않습니다. 로고 링크에는 CT-Farm 대체 텍스트를 제공합니다.

## 적용과 검증 범위

앱 헤더·문서센터·브라우저 아이콘에 적용합니다. PNG는 SVG에서 sharp로 생성하며 래스터 이미지를 SVG라고 포장하지 않습니다. 다크 배경 변형과 작은 아이콘은 별도 파일로 제공합니다. 기기별 런처·모든 모바일 OS 설치 동작은 별도 현장 검증 대상입니다.`);
write('문서-관리','문서 정리 기준·검증 결과·재개 방법',`## 유지·통합·보관

이전 문서는 삭제하지 않았습니다. 09-CT-Farm-안내가 현재 입문·기능·구조 안내의 기준이며 docs/README.md에서 연결합니다. 01~07은 기존 Starter·운영 상세 참고, 08은 과거 이력입니다. 개발현황과 2차 운영 안내는 기술 근거로 유지합니다. 오래된 시험 숫자는 당시 결과이며 최신 통과로 재해석하지 않습니다. 중복 내용을 파괴적으로 합치지 않고 최신 안내로 진입점을 통합했습니다.

## 안전과 공개 범위

변경 전 소스·문서 백업은 backup/ct-farm-docs-brand-before-20261029-174655.zip입니다. DB 변경은 없습니다. 공개 앱 문서에는 이 폴더의 검토된 안내만 빌드 시 포함하며 환경파일·로그·백업·상담·사용자 자료는 읽지 않습니다. 내부 파일 링크는 경로 안내로 표시하고 임의 파일 제공 API를 만들지 않습니다. 모든 기존 문서는 접근키 보호 로컬 포털에서 볼 수 있습니다.

## 검증 결과

이번 실행 결과는 verification/ct-farm-docs-brand-results.json과 개발현황에 기록합니다. 이전 API 157·웹 18·통합 27그룹 통과 보고는 출발점이며 이번 결과와 구분합니다. 문서 목록·실제 경로·모델·검색·목차·링크·Mermaid·PNG·favicon·반응형·빌드·회귀를 검증한 범위만 완료로 표시합니다.

## 문서 변경 후

tools/write-ctfarm-guides.mjs는 현재 안내의 편집 원본입니다. 이 파일과 생성 Markdown을 함께 갱신합니다. tools/build-docs-center.mjs는 allowlist 문서만 번들링합니다. npm run docs:index 후 npm run docs:check로 색인 일치를 확인합니다. 개발현황에 검증일·실패·외부 대기·다음 실행 지점을 남깁니다. 오래된 문서는 별도 상태로 유지하며 링크·결정 기록을 잃지 않도록 합니다.`);
// 실제 모델 이름·관계와 라우트 선언을 추출합니다. 동적 선언의 제한을 명시합니다.
const controllers=fs.readdirSync('apps/api/src/modules',{recursive:true}).filter(x=>String(x).endsWith('.controller.ts')).map(x=>'apps/api/src/modules/'+String(x).replaceAll('\\','/'));
let apiRows=[];for(const file of controllers){const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/(\w+Router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g))apiRows.push(`| ${m[2].toUpperCase()} | ${m[1]}: \`${m[3]}\` | [${path.basename(file)}](../../${file}) |`);}
const schema=fs.readFileSync('apps/api/prisma/schema.prisma','utf8');const models=[...schema.matchAll(/model (\w+)\s*\{([\s\S]*?)\n\}/g)];
write('API-데이터-목록','실제 API 선언과 PostgreSQL 모델 목록',`## API 읽는 방법

아래는 controller의 고정 문자열 라우트 선언을 전수 추출한 목록입니다. URL 앞에는 bootstrap/app.ts의 mount 경로를 붙입니다. farms/operations/plotImport/consultations/payments Router는 /api/v1/farms, maps는 /api/v1/maps, sensorIngest는 /api/v1/sensor-ingest, auth는 /api/v1/auth, notes는 /api/v1/notes, files는 /api/v1/files, account는 /api/v1/account, notification은 /api/v1/notifications, admin은 /api/v1/admin입니다. workspaceRouter는 /api/v1/workspace, voiceRouter는 /api/v1/voice, collaborationRouter는 /api/v1/collaboration입니다. 협업 API는 원본 DB 적용 승인 전 기본 비활성이며 6차 격리 검증 범위를 확인하세요. health는 bootstrap/health.ts를 별도로 확인합니다.

동적 선언 operationsRouter[method]는 PUT·DELETE /:id/records/:childId를 추가합니다. farmsRouter[method]는 PUT·DELETE /:id 및 /:id/diary/:entryId를 추가합니다. paymentsRouter의 action 반복문은 POST /:id/payments/:childId/confirm, /refund, /reconcile을 추가합니다. 별도 healthRouter는 GET /health, /health/live, /health/ready입니다. 런타임 OpenAPI 완전성 보증이 아니라 소스 탐색용 목록입니다. 정확한 요청·응답 필드는 각 링크의 validate·Zod와 success 호출이 기준입니다. 상담·결제의 복잡한 필드 예시는 기존 2차 운영 안내에 유지합니다.

| 메서드 | Router: 상대 경로 | 구현 파일 |
|---|---|---|
${apiRows.join('\n')}

## 요청·응답 예시

상담 POST /api/v1/farms/:id/consultations는 requestKey(UUID), question(2~2000자), mode(REFERENCE/MODEL), allowExternal(boolean)을 받습니다. MODEL은 서버 설정과 동의를 함께 검사합니다. 결과의 상태·sources·usage를 보고 실제 모델 답변과 자료 안내를 구분합니다. 같은 키의 다른 본문은 409입니다.

센서 POST /api/v1/sensor-ingest/:id는 Authorization: Device 형식 키와 sampleId, value, measuredAt을 받습니다. 타임스탬프·측정 범위·키·중복을 검증합니다. 키는 요청 예시에 실값으로 쓰지 않습니다. 일반 농장 변경은 Bearer 인증과 UUID·version 검사를 사용합니다. 공통 JSON 형식의 정확한 구현은 [response.ts](../../apps/api/src/common/response.ts)를 확인합니다.

## PostgreSQL 모델 (${models.length}개)

${models.map(m=>`### ${m[1]}\n\n\`\`\`prisma\nmodel ${m[1]} {${m[2]}\n}\n\`\`\``).join('\n\n')}

[원본 스키마](../../apps/api/prisma/schema.prisma). 위 스키마는 자격증명이나 DB 행을 포함하지 않습니다. 마이그레이션은 apps/api/prisma/migrations에 있으며 기존 열과 데이터를 보존합니다.`);
write('시스템-구조','실제 코드로 보는 시스템 구조와 기능 흐름',`## 전체 아키텍처와 프론트·백엔드 연결

\`\`\`mermaid
flowchart LR
 U[농민 브라우저] --> W[Next.js starter 화면]
 W --> A[Express API v1]
 A --> P[Prisma]
 P --> DB[(PostgreSQL)]
 A --> R[(Redis 요청 제한)]
 A --> F[로컬 파일 저장소]
 A -. 선택 설정 .-> E[지도 · 날씨 · AI · 테스트 PG]
\`\`\`

## API 요청·응답

\`\`\`mermaid
sequenceDiagram
 participant W as 화면
 participant A as Express
 participant S as 서비스
 participant D as PostgreSQL
 W->>A: 인증된 요청
 A->>A: requireAuth 및 Zod 검사
 A->>S: 사용자 범위 작업
 S->>D: 소유권 및 transaction 검사
 D-->>S: 결과 또는 충돌
 S-->>A: 성공 또는 AppError
 A-->>W: JSON 및 HTTP 상태
\`\`\`

## 주요 DB 관계

\`\`\`mermaid
erDiagram
 User ||--o{ Farm : owns
 User ||--o{ RefreshSession : authenticates
 User ||--o{ StoredFile : uploads
 Farm ||--o{ FarmDiary : contains
 Farm ||--o{ FarmRecord : contains
 Farm ||--o{ FarmSensor : contains
 FarmSensor ||--o{ SensorReading : measures
 Farm ||--o{ FarmProduct : sells
 FarmProduct ||--o{ FarmOrder : ordered
 FarmOrder ||--o| FarmPayment : payment
 FarmPayment ||--o{ PaymentEvent : events
 Farm ||--o{ FarmConsultation : consults
 FarmDiary ||--o{ DiaryPhoto : photos
 StoredFile ||--o{ DiaryPhoto : linked
\`\`\`

## 농장·필지·작기·일지

\`\`\`mermaid
flowchart TD
 F[Farm 소유 농장] --> P[FarmRecord PLOT]
 F --> C[FarmRecord CROP]
 F --> D[FarmDiary]
 C -. JSON plotId 서비스 검사 .-> P
 D --> H[DiaryPhoto]
 H --> S[StoredFile]
\`\`\`

일지는 농장에 연결되며 작기와 직접 SQL 외래키로 연결된 것은 아닙니다.

## 센서 데이터 처리

\`\`\`mermaid
flowchart LR
 D[장치 또는 simulator] --> I[수집 API]
 I --> K[장치 해시 키 또는 사용자 소유권]
 K --> V[시각 · 범위 · sampleId 검사]
 V --> T[트랜잭션 저장]
 T --> R[SensorReading]
 T --> N[임계값 알림]
\`\`\`

## 알림 생성·전달

\`\`\`mermaid
flowchart LR
 C[사용자 점검 또는 설정된 worker] --> B[buildAdvice]
 B --> D[작기 · 일정 · 센서 · 날씨 규칙]
 D --> N[중복 억제 후 Notification 저장]
 N --> U[소유자 알림 조회]
 U --> S[읽음 · 처리 상태]
\`\`\`

외부 SMS·앱 푸시 발송을 구현한 흐름이 아닙니다.

## AI 상담·분석

\`\`\`mermaid
flowchart TD
 Q[상담 요청] --> A[소유권 · 멱등성 · 안전 검사]
 A --> M{모드}
 M -->|REFERENCE| R[공식 포털 탐색 안내]
 M -->|MODEL| C[동의 · 서버 설정 · 예산 예약]
 C --> P[최소 농장 문맥 · 허용 자료 ID]
 P --> O[외부 모델 어댑터]
 O --> V[출력 스키마 · 근거 · 안전 검사]
 V --> H[상태 · sources · usage 이력]
 R --> H
\`\`\`

농장 추천은 별도 규칙 엔진입니다. 생성형 모델이 물리 장치를 제어하지 않습니다.

## 인증·권한

\`\`\`mermaid
flowchart LR
 L[로그인] --> V[비밀번호 · MFA 검사]
 V --> T[JWT · RefreshSession]
 T --> A[requireAuth · 정지 · 세션 검사]
 A --> O[농장 ownerId 또는 관리자 역할 검사]
 O --> D[허용된 자료 작업]
 D --> G[감사 이벤트]
\`\`\`

## 백업·복원

\`\`\`mermaid
flowchart LR
 S[소스] --> Z[소스 ZIP]
 D[(원본 DB)] --> P[pg_dump]
 P --> E[AES GCM 암호화 백업]
 E --> R[별도 DB 복원]
 R --> M[마이그레이션 · 지문 · 통합 검사]
 F[업로드] --> B[별도 파일 백업 및 복원 검사]
 K[별도 보관 키] --> R
\`\`\`

## 문서·브랜드 빌드

\`\`\`mermaid
flowchart LR
 G[검토한 Markdown allowlist] --> B[build-docs-center]
 V[기존 정화 Markdown · Mermaid 렌더러] --> B
 B --> W[Next public 문서센터]
 S[SVG 원본 생성 스크립트] --> P[SVG · PNG · ICO]
 P --> H[앱 헤더 · 문서 · 아이콘]
\`\`\`

연결 근거: bootstrap/app.ts, operations.service.ts, consultation.controller.ts, assistant.worker.ts, prisma/schema.prisma, tools/verify-farm-postgres.mjs. 전체 세부 모델과 필드는 API·데이터 목록을 함께 읽습니다.`);
console.log(`CT-Farm 안내 9개, 기능 ${items.length}개, 고정 API 선언 ${apiRows.length}개, 모델 ${models.length}개 생성`);

