# SECURE STARTER 기본 검증
# PowerShell 5.1 호환

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot

$Original = Get-Location

$PreviousTelemetry = $env:NEXT_TELEMETRY_DISABLED

try {

    Set-Location $Root
    & npm.cmd run check:source
    if ($LASTEXITCODE -ne 0) { throw "소스 무결성 검사 실패" }

    Write-Host ""
    Write-Host "[0] PowerShell 스크립트 문법과 BOM 확인"
    & (Join-Path $PSScriptRoot "verify-powershell.ps1")
    Write-Host "[0] Prisma Client 생성"
    & npm.cmd run db:generate
    if ($LASTEXITCODE -ne 0) { throw "Prisma Client 생성 실패" }

    Write-Host "[1] API 및 웹 회귀 테스트"

    & npm.cmd test

    if ($LASTEXITCODE -ne 0) {
        throw "API 단위 테스트 실패"
    }

    Write-Host ""
    Write-Host "[2] 전체 프로젝트 빌드"

    # 실제 배포용 API 주소를 유지한 채 빌드합니다.
    $env:NEXT_TELEMETRY_DISABLED = "1"

    & npm.cmd run build

    if ($LASTEXITCODE -ne 0) {
        throw "전체 프로젝트 빌드 실패"
    }

    Write-Host ""
    Write-Host "[3] 의존성 보안 검사"

    & npm.cmd audit

    if ($LASTEXITCODE -ne 0) {
        throw "의존성 보안 검사 실패"
    }

    Write-Host ""
    Write-Host "============================================"
    Write-Host " 기본 프로젝트 검증 성공"
    Write-Host "============================================"

}
finally {

    $env:NEXT_TELEMETRY_DISABLED = $PreviousTelemetry

    Set-Location $Original
}

