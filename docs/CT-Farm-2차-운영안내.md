# CT-Farm 2차 운영 설정·연동·검증 안내

## 안전한 설정

`apps/api/.env.example`을 참고해 **비공개 서버 환경변수**에 설정한다. 실제 키를 저장소·문서·로그·채팅에 남기지 않는다. 이번 코드에는 실결제 모드가 없다. 새 의존성은 좌표 변환용 proj4 2.22.0이며 lock 파일을 갱신했다.

| 변수 | 기본/필요 값 | 동작·한계 |
|---|---|---|
| NAVER_MAP_KEY_ID | 미설정, 공개 JavaScript Key ID | 브라우저 노출을 전제로 하는 ID다. NCP 비밀키를 넣으면 안 된다. 등록 웹 도메인과 Maps 사용 설정 필요 |
| AI_MODE | REFERENCE / OPENAI | 기본 자료 안내는 모델 호출 없음. OPENAI도 요청별 MODEL 선택·전송 동의가 있어야 호출 |
| AI_API_KEY | 서버 전용, 미설정 | 브라우저 NEXT_PUBLIC 변수에 넣지 않음 |
| AI_MODEL | 사용자가 사용할 구조화 출력 지원 모델 ID | 임의 모델 자동 선택 없음. 접근 권한·가격·지원 스키마를 확인해야 함 |
| AI_DAILY_TOKEN_LIMIT | 30000 | 사용자별 한국 날짜 기준 예약 토큰 한도. 통화 금액 예산은 아니며 요청 50회/일 한도도 적용 |
| PAYMENT_MODE | DISABLED / SIMULATOR / TOSS_TEST | SIMULATOR는 로컬 전용. LIVE 값 자체가 허용되지 않음 |
| TOSS_TEST_SECRET_KEY | test_sk_ 또는 test_gsk_ 접두사 | 서버 전용. live 키는 시작 설정/요청에서 거부 |

## 지도와 팜맵

`GET /api/v1/maps/config`는 인증 후 공개 Key ID와 연동 상태만 반환한다. 사용자가 **네이버 지도 불러오기**를 누르면 고정 HTTPS SDK를 불러오며 위치가 공급자에게 전달된다는 안내를 표시한다. SDK 로딩 오류/키 미설정 때 좌표 도면을 유지한다. 클릭 좌표·농장 마커·필지 다각형을 지원한다. 실제 지도 호출은 키가 없어 검증하지 않았다.

네이버 공식 [시작 안내](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html)는 `ncpKeyId`를 사용한다. [Polygon 문서](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Polygon.html)의 경계 표시 인터페이스를 구현했다. SDK 어댑터 시험은 실제 인증/타일 검증을 대체하지 않는다.

팜맵 공식 [FAQ](https://agis.epis.or.kr/ASD/guide/faq.do?bbsSn=2)는 EPSG:5179와 WMS/WFS 연계 및 도메인 기반 인증키를 안내한다. **현재 live WMS/WFS를 조회한 것은 아니다.** 내려받은 좌표를 입력해 가져오는 대체 경로를 제공한다.

- `POST /api/v1/maps/boundary/preview`: `{name,sourceCrs,sourceId,coordinates}`.
- `POST /api/v1/farms/:id/plots/import`: 같은 입력으로 해당 사용자 농장에 필지를 저장한다.
- sourceCrs는 `EPSG:5179` 또는 `EPSG:4326`. coordinates는 닫는 중복 점을 제외한 3~200개 `[Easting,Northing]` 또는 `[경도,위도]`다. 단일 고리만 지원하며 SHP 파서·구멍/다중 폴리곤은 없다.
- 공식 FAQ의 EPSG:5179 점 `(984692.0210907353,1830469.4351968889)`를 경도 `127.32912887285937`, 위도 `36.47171751842438`와 비교했다. 10m 정사각형은 100㎡로 검사했다. 축 반전·한국 인근 범위 이탈·중복·자기교차·면적 범위 오류를 거부한다.
- 저장은 WGS84 위경도. 면적은 EPSG:5179 평면 근사로 표시하고 법적 측량 값이라고 표시하지 않는다. 원본 좌표계·식별자·변환법은 provenance에 저장한다. 기존 수동 등록 면적을 자동 덮어쓰지 않는다.

## 상담·자료 탐색·비용

새 경로는 `/api/v1/farms/:id/consultations` GET/POST다. 기존 `/consult` 자리표시자는 실제 호출 경로가 아니며 생성형 답변을 임의로 성공 처리하지 않는다. `GET /knowledge?q=...`는 승인된 공식 포털 색인만 검색한다.

POST 예시 필드: `requestKey` UUID, `question` 2~2000자, `mode` REFERENCE/MODEL, `allowExternal` boolean. 사용자/농장 ID 주입은 허용하지 않는다. GET은 페이지당 20턴이다. 같은 키의 같은 내용은 같은 턴을 반환하며 다른 내용은 409다.

- REFERENCE: 작물과 점검 요약·자료 탐색 경로를 반환하고 **생성형 AI가 아니라고 표시**한다.
- MODEL: OPENAI 서버 설정과 요청별 동의가 필요하다. 주소·좌표·계정·장치 키를 전송하지 않는다. 질문/일지/이전 모델 대화의 자유 텍스트에는 개인정보가 있을 수 있어 동의 화면에서 알린다.
- 컨텍스트는 해당 농장의 작기/일정 최근 20개 요약, 일지 5개 일부, 점검 요약 5개, 최근 정상 모델 대화 3개 일부로 제한한다. 전체 과거 이력을 모두 읽었다고 표시하지 않는다. 자료 안내로만 남긴 이전 질문을 모델 대화로 자동 전송하지 않는다.
- 서버는 `store:false`, 고정 Responses API URL, 20초 제한, 응답 크기 제한, 구조화 JSON 스키마·허용 sourceIds를 검증한다. 최신 [OpenAI 구조화 출력 문서](https://developers.openai.com/api/docs/guides/structured-outputs)를 근거로 구현했다. 실제 모델 호출은 키가 없어 수행하지 않았다.
- 사용자 행 잠금과 일별 AiQuota로 복수 농장에 분산한 예산 우회를 방지한다. UTF-8 입력 바이트와 출력/오버헤드 여유를 보수적으로 예약한다. 시간 초과·오류 때 자동 재호출하거나 예약 예산을 환급하지 않는다. 불확실한 과금 가능성을 성공으로 숨기지 않는다. PENDING/FAILED 기록이 남으며 프로세스 중단 후 운영자 조사·복구는 후속 작업이다.
- FarmConsultation은 QUESTION/ANSWER 텍스트·상태·sources·usage만 보관하고 API 비밀키는 저장하지 않는다. PENDING/ANSWERED/REFERENCE/NEEDS_REVIEW/FAILED를 화면에 구분한다. 계정 내보내기에는 상담과 공개 테스트 결제 필드를 포함하며 providerKey·장치 키는 포함하지 않는다.

### 자료와 안전 검토의 한계

현재 검색 자료는 [농사로](https://www.nongsaro.go.kr/portal/portalMain.ps?menuId=PS00001), [농약안전정보시스템](https://psis.rda.go.kr/), [농업기술 데이터 플랫폼 안내](https://adp.rda.go.kr/portal/pub/openApi/info.do)의 **탐색 색인**이다. 개별 제품 라벨이나 작물별 기술 문서를 수집해 검증한 RAG가 아니다. 원문 대량 수집·라이선스 확보·만료/갱신·검색 품질 평가는 남아 있다.

농약·비료·희석·혼용·용량 표현은 요청 전과 모델 출력 후 보수적으로 점검하며 전문가 확인 대상으로 분리한다. 위험 답변은 표시를 보류한다. 키워드/패턴 검사는 완전한 안전 보증이 아니며 오탐·미탐 평가가 필요하다. 인용 가능한 상세 문서·최신 등록·지역/품종/라벨 검증 없이 농약/비료 처방 서비스로 운영하면 안 된다. 모델 출력은 전문가 검증 전 참고 답변이다.

## 추천과 장치

점검은 기존 규칙 엔진과 날씨/작기/일정/센서 자료를 재사용한다. 반환 메타데이터는 automaticActions=`SAVE_NOTIFICATION`, confirmationRequiredActions=`CREATE_TASK`, remoteControlEnabled=false다.

`POST /api/v1/farms/:id/advice/task`는 `{key,requestKey,dueDate,confirmed:true}`를 요구한다. 현재 점검의 추천을 찾아 서버에서 제목/근거를 만들고 TODO 일정만 생성한다. 입력이 확인됐다는 이유로 농작업·물리 제어를 실행하지 않는다. 중복 요청 키는 같은 recordId를 반환한다.

`POST /api/v1/farms/:id/sensors/:childId/rotate-key`는 활성 실장치의 이전 키를 즉시 폐기하고 새 키를 한 번 표시한다. 측정 이력은 보존한다. 수집 프로토콜은 기존 `/api/v1/sensor-ingest/:sensorId`와 `Authorization: Device <키>`, `{sampleId,value,measuredAt}`다.

`tools/sensor-client.mjs`는 SENSOR_API_ORIGIN, SENSOR_ID, SENSOR_DEVICE_TOKEN, SENSOR_VALUE를 환경변수로 받아 전송하는 참고 클라이언트다. SENSOR_SAMPLE_ID/SENSOR_MEASURED_AT를 주면 재시작 시 같은 측정 재전송에도 이용할 수 있다. HTTPS 또는 localhost HTTP만 허용하고 5초 제한·최대 3회 같은 본문 재시도를 한다. 401/4xx는 재시도하지 않는다. 키나 원본 응답은 출력하지 않는다.

물리 센서·교정·MQTT는 미검증이다. `/sensors/:childId/commands`는 소유권 검사 후 501 REMOTE_CONTROL_DISABLED만 반환한다. 원격 제어의 승인/인터록/긴급 중지/실행 확인 모델이 아직 없으므로 제어를 활성화할 수 없다.

## 테스트 결제·환불

새 API는 모두 농장 소유자 인증이 필요하다. 실결제 지원 경로·라이브 키 설정은 없다.

| 농장 내 경로 | 메서드 | 의미 |
|---|---|---|
| `/payment-config` | GET | mode·testOnly·liveSupported:false |
| `/payments` | GET | 최근 테스트 결제 100개, providerKey 제외 |
| `/orders/:orderId/payment` | POST | `{requestKey}`. 서버 주문 금액으로 단일 결제 의도 생성 |
| `/payments/:id/simulate` | POST | `{requestKey,event:APPROVE|DECLINE|REFUND}`, 로컬 SIMULATOR만 |
| `/payments/:id/confirm` | POST | `{requestKey,providerKey}`, 토스 테스트 승인 |
| `/payments/:id/refund` | POST | `{requestKey}`, 토스 테스트 전액 취소 |
| `/payments/:id/reconcile` | POST | `{requestKey}`, 미확정 상태의 PG 조회 |

토스 공식 [인증 안내](https://docs.tosspayments.com/reference/using-api/authorization)와 [API 안내](https://docs.tosspayments.com/en/api-guide)를 확인했다. 고정 HTTPS URL, 테스트 키 접두사, Basic 인증, POST 멱등 헤더를 사용한다. 승인 금액·주문 ID·paymentKey·공급자 상태가 모두 일치해야 상태를 갱신한다. 클라이언트 amount 입력은 strict DTO에서 거부한다.

네트워크 오류는 즉시 실패/성공으로 가정하지 않고 PROCESSING/REFUND_PENDING에 남긴다. 다시 승인·환불하기 전에 조회한다. 환불 요청 후 조회 결과가 아직 DONE이면 REFUND_NOT_CONFIRMED로 미확정을 유지하며, 전액 CANCELED를 확인해야 환불 상태로 확정한다. 미확정 주문의 수기 취소로 재고를 중복 복원하지 못하게 막았다.

예약 주문의 전액 시험 환불은 주문 CANCELLED와 재고 1회 복원을 같은 트랜잭션으로 처리한다. 인도 완료 상품의 환불은 실물 반품이 아니므로 재고는 자동 증가하지 않는다. 제품 단가는 결제 의도 생성 이후 바뀌어도 기존 주문 금액을 바꾸지 않는다.

**시뮬레이터 승인과 실제 PG 테스트 승인은 다르다.** 이번에 실제 토스 테스트 계정 호출을 수행하지 않았다. 결제창 SDK와 성공/실패 return URL, 구매자 결제 흐름, 서명 검증 웹훅·재처리, 부분 환불, 운영자 조정/정산은 후속 작업이다. 현재 UI는 시험 결제창에서 받은 paymentKey를 입력해 어댑터를 시험할 구조만 제공한다. 계약·테스트 자격 증명·HTTPS·보안/과금 검증 후 실연동을 확인하고, 라이브는 별도 명시 승인과 개발이 필요하다.

## Windows 링크 테스트 해석

이전 2개 실패는 저장소 검사 이전 symlink 생성에서 EPERM이 발생했다. 생산 코드의 검사를 삭제하거나 우회하지 않았다. 파일 링크를 생성할 수 있는 환경에서는 원래 검사를 실행하고, Windows EPERM에서만 실제 NTFS junction을 생성해 파일 슬롯/저장소 루트 재분석 지점을 거부하는지 확인한다. 하드 링크 거부 검사도 유지한다. junction은 파일 심볼릭 링크와 같지 않으므로 Windows 파일 symlink 자체의 동작 검증은 별도 권한 환경에서 수행해야 한다.
