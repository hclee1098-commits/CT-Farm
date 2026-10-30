# 공통 API 사용 설명서

> **알 수 있는 것:** 설정·동작·제한과 실제 사용 절차
>
> **읽을 때:** 해당 기능의 상세 설정을 확인할 때
>
> **관련 기능:** 공통 API 사용 설명서
>
> **관련 소스:** [app.ts](../../apps/api/src/bootstrap/app.ts)
>
> **관련 문서:** [문서센터](../README.md)


## 이 문서의 목차

- [1. 개요](#1-개요)
- [2. 공통 API 클라이언트](#2-공통-api-클라이언트)
- [3. 인증 방식](#3-인증-방식)
- [4. 기존 인증 코드와 연결](#4-기존-인증-코드와-연결)
- [5. API 요청 경로](#5-api-요청-경로)
- [6. 모바일 앱 연동](#6-모바일-앱-연동)
- [7. 보안 주의사항](#7-보안-주의사항)
- [8. API 서버 주소](#8-api-서버-주소)

## 1. 개요

이 모듈은 웹 프론트엔드에서 백엔드 REST API를 호출하기 위한 공통 기능입니다.

기존 백엔드 API를 수정하지 않고 사용할 수 있도록 구성했습니다.

## 2. 공통 API 클라이언트

파일: client.ts

지원 기능:

- HTTP GET
- HTTP POST
- HTTP PUT
- HTTP PATCH
- HTTP DELETE
- JWT Access Token 전달
- 웹 Refresh Token 갱신
- 동시 토큰 갱신 요청 중복 방지
- 요청 타임아웃
- 요청 취소
- 공통 오류 처리
- 쿼리 문자열 생성

## 3. 인증 방식

웹에서는 Access Token을 JavaScript 메모리에 보관합니다.

Refresh Token은 기존 백엔드에서 발급한 HttpOnly Cookie를 사용합니다.

Access Token을 localStorage에 저장하지 않습니다.

새로고침 후 인증이 필요한 API에서 401 응답을 받으면
Refresh Token 갱신을 시도합니다.

다만 이 방식만으로 전체 로그인 상태 관리가 완성되는 것은 아닙니다.

실제 화면에서는 사용자 정보 상태, 인증 확인 중 화면,
로그아웃 후 이동 처리 등을 별도로 연결해야 합니다.

## 4. 기존 인증 코드와 연결

새로운 web-auth.ts는 기존 인증 API를 사용하는 독립적인 서비스입니다.

기존 로그인 화면을 자동으로 교체하지 않습니다.

기존 로그인 화면에서 받은 Access Token을
tokenMemory.set()으로 전달하면 공통 API에서 사용할 수 있습니다.

로그아웃할 때는 tokenMemory.clear()를 호출합니다.

기존 인증 Context와 새 공통 인증 모듈을 함께 사용할 경우
토큰 상태가 중복되지 않도록 한쪽을 기준으로 통합해야 합니다.

## 5. API 요청 경로

일반 API 요청은 /api/v1을 기준으로 합니다.

예를 들어 path에 /notes를 전달하면
/api/v1/notes로 요청합니다.

헬스체크처럼 루트 API를 호출할 때는
scope를 root로 지정합니다.

## 6. 모바일 앱 연동

모바일 앱은 같은 백엔드 API를 사용할 수 있습니다.

다만 모바일 앱에서는 웹의 HttpOnly Cookie 방식 대신
모바일 전용 Refresh Token API를 사용합니다.

모바일 앱에서는 Refresh Token을
Expo SecureStore 또는 운영체제 보안 저장소에 보관해야 합니다.

createApiClient()의 다음 옵션을 사용하여 연결할 수 있습니다.

- getAccessToken
- refreshAccessToken
- onAccessToken
- onUnauthorized
- credentials

모바일 앱에서는 credentials를 omit으로 설정하는 등
웹과 다른 인증 전송 방식을 구성할 수 있습니다.

모바일 앱의 로그인과 토큰 저장 기능 자체는
향후 모바일 프로젝트에서 별도로 구현해야 합니다.

## 7. 보안 주의사항

Access Token을 URL에 포함하지 마세요.

Refresh Token을 브라우저 localStorage에 저장하지 마세요.

운영 환경에서는 HTTPS를 사용하세요.

사용자에게 보여줄 수 있는 오류 메시지와
내부 서버 오류 정보를 구분하세요.

자동 토큰 갱신은 인증을 대체하지 않습니다.

백엔드에서 모든 요청의 인증과 권한을 다시 검사해야 합니다.

## 8. API 서버 주소

환경 변수 NEXT_PUBLIC_API_BASE_URL 또는
NEXT_PUBLIC_API_URL을 사용할 수 있습니다.

값은 API 서버의 주소로 설정합니다.

예시:

NEXT_PUBLIC_API_BASE_URL=http://localhost:4000

환경 변수를 설정하지 않으면 로컬 개발 주소를 사용합니다.

운영 환경에서는 반드시 실제 API 서버 주소를 설정하세요.
