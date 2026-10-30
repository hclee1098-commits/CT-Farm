# Windows PowerShell 5.1 실기 검증 필요 항목

> **알 수 있는 것:** 설정·동작·제한과 실제 사용 절차
>
> **읽을 때:** 해당 기능의 상세 설정을 확인할 때
>
> **관련 기능:** Windows PowerShell 5.1 실기 검증 필요 항목
>
> **관련 소스:** [app.ts](../../apps/api/src/bootstrap/app.ts)
>
> **관련 문서:** [문서센터](../README.md)


현재 환경은 Linux이며 PowerShell 5.1 및 Docker 엔진이 없습니다. PS1 UTF-8 BOM은 자동 검사하지만 PowerShell 문법 분석기와 Windows 실제 동작은 검증하지 않았습니다.

## 순서

1. CT-Farm과 무관한 새 테스트 폴더 2개를 준비합니다. 하나는 한글·공백이 포함된 경로를 사용합니다. 기존 `.env`나 `.starter-state`를 복제하지 않습니다.
2. PowerShell 5.1 파서로 SECURE-LIFECYCLE.ps1 문법을 검사하고 `-Action SETUP|STARTER|STOP` 명령 구문을 확인합니다. EXE를 생성하지 않습니다.
3. 첫 폴더 SETUP 후 Node/Docker 도구 버전, 키 생성, 포트 자동 선택, DB/Redis 준비, 마이그레이션, API/WEB 빌드를 확인합니다.
4. 같은 폴더에서 재설치·설치 중단 후 재시도·네트워크 실패·Docker 엔진 중지를 각각 확인합니다. 기존 회원·게시글·업로드가 유지되는지 비교합니다.
5. 두 번째 폴더를 설치해 Compose ID·네트워크·볼륨·포트가 서로 다른지 확인합니다. 각 프로젝트의 데이터와 컨테이너 라벨을 따로 기록합니다.
6. STARTER를 두 번 실행해 중복 실행·포트 충돌을 확인합니다. STARTER 명령 종료 후 API/WEB/collector 프로세스가 유지되는지 확인합니다.
7. STOP이 현재 프로젝트 프로세스만 종료하고 볼륨을 보존하는지 확인합니다. PID 재사용·실행 시각 불일치·잘못된 소유권 기록을 조작한 테스트에서는 강제 종료하지 않아야 합니다.
8. DB/Redis/API/WEB 각각 실행 실패·종료 실패 시 안내와 종료 코드, 다음 재시도 가능 여부를 확인합니다. 한 프로젝트 종료 후 다른 프로젝트가 계속 작동해야 합니다.
9. LOCAL 수집기 heartbeat·포털 상태·정상/오류 요청을 확인하고 STOP 후 수집기까지 종료되는지 확인합니다.
10. 별도 테스트 PostgreSQL에 백업·격리 복원을 실행하고 파일 해시와 사용자 데이터를 비교합니다. 운영 DB는 복원 대상으로 사용하지 않습니다.

기존 `tools/verify-powershell.ps1`, `tools/verify-starter.ps1`, `SECURE-TEST.ps1`도 내용을 먼저 검토하고 해당 테스트 폴더에서 실행합니다. 초기화·볼륨 삭제·전역 프로세스 종료로 오류를 해결하지 않습니다. 기존 사용자의 실제 환경파일은 배포 ZIP에 포함하지 않습니다.
