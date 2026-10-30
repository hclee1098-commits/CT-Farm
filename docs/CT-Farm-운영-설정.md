# CT-Farm 농장 운영 설정과 API

## 접속과 데이터 보호

로컬 기본 웹은 `http://localhost:3000/starter/farms`, API는 `http://localhost:4000/api/v1`이다. 회원가입/로그인 뒤 농장을 등록하고 각 농장의 **필지·작물·일정·센서·경영 관리**를 연다. 사용자 JWT 인증, 세션/탈퇴/정지 검사, Redis 요청 제한은 기존 V6 구조를 사용한다. 예외적으로 장치 수집 API는 폐기 가능한 장치 전용 키를 요구한다. 키는 등록 응답에서 한 번만 표시되며 DB에는 SHA-256 해시만 저장된다.

`tools/verify-farm-postgres.mjs`는 현재 Compose 프로젝트의 DB를 암호화 백업하고 `ct_farm_verify_<12 HEX>` 새 DB에 복원한다. 복원본에서 migrate deploy와 schema diff를 수행하고 기존 행 지문을 비교한다. 기본 실행은 원본 스키마를 바꾸지 않는다. `--apply-existing`은 백업 후 원본 행 지문이 동일한 경우에만 기존 DB에 추가 마이그레이션을 적용한다. `--test-operations`는 복원본에서 실제 Prisma/HTTP 통합 검증을 추가한다. 시험 DB를 삭제하거나 기존 볼륨을 지우지 않는다.

백업 키 `.starter-state/ct-farm-backup.key`는 비공개로 별도 보관해야 한다. 이 도구의 .ssbk는 DB 전용이다. 운영 환경은 기존 `tools/backup.mjs`의 DB+업로드 백업/격리 복원 절차도 검증해야 한다.

## API 경로

아래 농장별 경로는 `/api/v1/farms/:id` 뒤에 붙인다. 모든 ID는 UUID이며 사용자 입력의 ownerId/farmId는 받지 않는다. 수정·보관에는 현재 version이 필요하고 충돌은 409다. 필지·작기·일정·경영 기록은 soft delete한다.

| 경로 | 메서드 | 내용 |
|---|---|---|
| `/records?kind=PLOT&page=1` | GET | 필지, 종류별 20개 페이지 |
| `/records` | POST | `{kind,data}`. kind: PLOT/CROP/TASK/LEDGER/HARVEST |
| `/records/:childId` | PUT/DELETE | `{version,data}`로 수정 / `{version}`으로 보관 |
| `/diary/:childId/photos` | GET/POST | 본인 이미지 파일만 연결. 등록 `{fileId,caption}` |
| `/diary/:childId/photos/:photoId` | DELETE | 연결만 해제, 원본 파일 보존 |
| `/sensors` | GET/POST | 최대 200개 장치. 실제 키는 생성 응답에서만 표시 |
| `/sensors/:childId` | DELETE | 장치 중지·키 폐기, 이력 보존 |
| `/sensors/:childId/readings` | GET | 최근 200개 측정값 |
| `/sensors/:childId/simulate` | POST | 시험 장치에만 시험값 입력 |
| `/weather` | GET | 설정된 날씨 공급자의 3일 예보 |
| `/advice` | GET | 일정·작기·센서 기반 근거·한계 표시 |
| `/check` | POST | 점검 후 기존 알림에 저장, 같은 날 동일 근거 중복 방지 |
| `/consult` | POST | 현재 503 AI_NOT_CONFIGURED. 생성형 상담 미구현 |
| `/products` | GET/POST | 상품 목록/등록. `{name,unit,priceWon,stock}` |
| `/products/:childId` | PUT | 상품·재고 수정, 현재 version 필수 |
| `/products/:childId/orders` | POST | 수기 주문 `{requestKey:UUID,buyerLabel,quantity}` |
| `/orders` | GET | 페이지별 수기 주문 |
| `/orders/:childId` | PATCH | `{status:COMPLETED 또는 CANCELLED}`, 예약에서만 전이 |

복구: `/api/v1/farms/archived` GET, `/api/v1/farms/:id/restore` POST `{version}`, 농장 내 `/diary/archived` GET, `/diary/:entryId/restore` POST `{version}`. 보관 목록은 최근 100개까지다. 다른 사용자의 보관 자료는 반환하지 않는다.

자료 예시는 DTO를 참조한다. PLOT 경계는 `[경도,위도]` 꼭짓점 배열이며 마지막 점으로 첫 점을 반복하지 않는다. 저장 면적은 사용자가 직접 입력하며 법적 측량 면적을 자동 계산한 값이 아니다. 필지 경계의 위도는 도면 지원 범위인 -85~85도로 제한한다.

CROP은 `{name,variety,stage,plantingDate,harvestDate,plotId}`. 날짜는 한국 작업일 `YYYY-MM-DD`, plotId는 같은 농장의 활성 필지 UUID 또는 null이다. 활성 작기가 사용하는 필지는 보관할 수 없다. 필지 선택 UI는 최근 20개를 제공하므로 다수 필지 검색은 후속 작업이다.

TASK는 `{title,dueDate,status:TODO|DONE|CANCELLED,memo}`. LEDGER는 `{title,date,type:INCOME|EXPENSE,amountWon,memo}`. HARVEST는 `{crop,date,quantityKg,memo}`. 수입·비용 합계 UI는 **현재 페이지** 기준이며 주문 금액과 자동 합산하지 않는다. 현재 관리 범주는 법정 회계/세금 신고 기능이 아니다.

## 센서·시뮬레이터

장치 등록 입력: `{name,kind,minValue,maxValue,staleMinutes,simulated}`. kind는 MOISTURE/TEMPERATURE/HUMIDITY. 수분·습도는 0~100%, 온도는 -80~100°C다. 최소/최대 기준은 사용자 설정값이며 작물별 검증된 적정 범위가 아니다.

실장치 수집은 `POST /api/v1/sensor-ingest/:sensorId`, `Authorization: Device <등록 시 발급한 키>`로 호출한다. 본문은 `{sampleId,value,measuredAt}`. sampleId는 센서별 고유하며 같은 ID·값·시각은 중복 저장하지 않는다. 같은 ID의 다른 값은 409, 측정 시각은 최근 7일~미래 5분 범위를 허용한다. 최신 상태는 수신 시각이 아닌 측정 시각으로 판단한다. 시험 센서는 사용자 인증된 simulate 경로만 허용한다.

운영에서는 HTTPS, 장치 내부 비밀 보관, 전송 주기와 Redis 제한 용량, 재전송 보관·보존 정책, 단위 교정 및 실제 하드웨어 검증이 필요하다. 현재 HTTP JSON 수집 기반이며 MQTT 게이트웨이는 없다. 분 단위 대규모 센서 배포를 검증한 상태가 아니다.

## 날씨

기본값은 `WEATHER_MODE=DISABLED`. 미설정은 503, 공급자 오류/형식 오류는 502로 반환한다. 임의의 예보를 표시하지 않는다.

- 로컬 비상업 시험: `WEATHER_MODE=OPEN_METEO_NON_COMMERCIAL`.
- 상업/서버: 이용 계약 확인 후 `WEATHER_MODE=OPEN_METEO_CUSTOMER`, `WEATHER_API_KEY`를 서버 비공개 환경변수에 설정한다. 키를 웹의 NEXT_PUBLIC_* 변수에 넣지 않는다.
- 무료 API는 비상업 목적에 제한된다. 공식 [이용 조건](https://open-meteo.com/en/terms)과 [API 문서](https://open-meteo.com/en/docs)를 확인했다. 운영 목적에 적합한 계약이 필요하다.
- 고정 HTTPS 공급자 URL만 호출하며 사용자 URL을 받지 않는다. 농장 좌표가 공급자에게 전달되므로 실제 서비스 개인정보 안내에 반영해야 한다.
- 출처/조회 시각/결측값을 표시한다. 고온·영하·강수·바람 문구는 고정 참고 기준이며 공식 기상특보가 아니다. 캐시는 프로세스별 최대 1,000개·10분이다. 분산 캐시와 공식 기상특보는 후속 작업이다.

## 자동 점검·AI 한계

`FARM_ASSISTANT_ENABLED=true`로 API를 시작하면 시작 시와 이후 15분마다 활성 사용자 농장을 점검한다. 페이지 단위로 읽고 한 농장의 실패가 다음 농장을 막지 않는다. 중지 시 새 점검을 시작하지 않는다. 같은 날 같은 이유의 알림은 DB 멱등 키와 농장 잠금으로 중복을 막는다. 외부 이메일/SMS·추가 자동 작업 실행은 없다. 기본값 false다.

점검은 사용자 일정·수확 예정일·일지 유무·센서 지연/설정 범위 이탈과 연동된 예보의 위험 참고 기준을 안내한다. 날씨 미설정·장애는 판단하지 못한 자료로 표시한다. 모델은 연결되지 않았고 질병 진단·약제/비료 처방을 생성하지 않는다. 생성형 AI는 출처를 확보한 검색 자료와 모델 계약/키, 개인정보·비용 제한, 불확실성·유해 처방 평가가 선행돼야 한다. 현재 모델이 연결됐다고 표시하지 않는다.

## 수기 거래 한계와 복구

주문은 농장주의 **관리 기록**이다. 구매자 공개 주문·결제는 아니다. 예약에서 재고를 차감하고 취소에서 한 번만 복원한다. 제품/농장 잠금과 조건부 차감으로 동시 초과 판매를 막는다. 동일 requestKey 재시도는 같은 주문을 반환한다. 내용이 다르면 409다. 완료/취소한 주문의 다른 상태 전이는 차단한다. 결제/환불은 수행하지 않는다.

실결제는 PG 계약·테스트 키·서명 검증·웹훅 멱등성·취소/환불·정산 테스트 후 추가한다. 스마트스토어도 판매자·앱 권한 및 공식 정책 검토가 필요하다. 해당 연동 없이 판매/결제 성공을 임의 처리하지 않는다.
