<!-- CT-Farm 문서 진입점 -->
[CT-Farm 통합 문서센터](docs/README.md) · 앱 도움말: /docs-center/index.html

# SECURE STARTER V6

인증·게시글·파일 관리를 갖춘 풀스택 스타터입니다. 검증 후보판이며 남은 구현·검증 범위는 문서에서 확인하세요.

- **[통합 문서센터 열기](docs/README.md)**
- [처음 설치하고 실행하기](docs/01-시작하기/설치와-실행.md)
- [전체 기능과 구현 근거](docs/02-전체기능/전체-기능과-구현근거.md)
- [이번 변경과 검증 결과](docs/07-기술참고/문서정리-검증결과.md)

Windows 신규 설치는 프로젝트 루트에서 실행합니다.

```powershell
.\SECURE-LIFECYCLE.ps1 -Action SETUP
.\SECURE-LIFECYCLE.ps1 -Action STARTER
```

기존 설치는 먼저 설치 안내의 업데이트 절차를 확인하세요. 환경파일·사용자 데이터·Docker 볼륨을 보존합니다.
