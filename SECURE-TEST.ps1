$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
Set-Location -LiteralPath $root

# V5가 예약한 포트를 사용합니다. 다른 설치의 데이터베이스를 정리하지 않습니다.
$identityPath = Join-Path $root ".starter-state\identity.json"
if (!(Test-Path -LiteralPath $identityPath)) {
    throw "설치 식별자가 없습니다. 먼저 SETUP을 실행하세요."
}
$identity = Get-Content -LiteralPath $identityPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (
    $identity.Version -notin @(4,5) -or
    $identity.Project -cnotmatch '^ss[a-f0-9]{12}$' -or
    ![string]::Equals([string]$identity.Root, $root, [StringComparison]::OrdinalIgnoreCase) -or
    !$identity.MigrationCompleted
) {
    throw "설치 식별자 검증 실패. 테스트와 데이터 정리를 중단합니다."
}
foreach ($portName in @("ApiPort", "WebPort")) {
    $port = [int]$identity.$portName
    if ($port -lt 1 -or $port -gt 65535) { throw "잘못된 설치 포트: $portName" }
}
$baseUrl = "http://localhost:$($identity.ApiPort)"
$origin = "http://localhost:$($identity.WebPort)"

$passed = 0
$exitCode = 0
$cleanupOK = $true

$id = [guid]::NewGuid().ToString("N")

$emailA = "sstest-a-$id@example.com"
$emailB = "sstest-b-$id@example.com"

$password = "Sst!9" + [guid]::NewGuid().ToString("N")

$title = "SSTEST-$id"
$content = "Automated integration test"

$sessionA = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$sessionB = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Call-Api {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Json = $null,
        [string]$Token = "",
        [object]$Session = $null,
        [switch]$WebOrigin
    )

    $headers = @{}

    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    if ($WebOrigin) {
        $headers["Origin"] = $origin
    }

    $params = @{
        Uri = "$baseUrl$Path"
        Method = $Method
        Headers = $headers
        TimeoutSec = 10
        UseBasicParsing = $true
    }

    if ($Session) {
        $params["WebSession"] = $Session
    }

    if ($null -ne $Json) {
        $jsonText = ConvertTo-Json -InputObject $Json -Depth 10 -Compress

        $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($jsonText)
        $params["ContentType"] = "application/json; charset=utf-8"
    }

    try {
        $response = Invoke-WebRequest @params

        $body = $null

        if ($response.Content) {
            $body = $response.Content | ConvertFrom-Json
        }

        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            Body = $body
        }
    }
    catch {
        $errorResponse = $_.Exception.Response

        if ($null -eq $errorResponse) {
            throw
        }

        return [pscustomobject]@{
            Status = [int]$errorResponse.StatusCode
            Body = $null
        }
    }
}

function Get-Data {
    param([object]$Result)

    if (
        $null -ne $Result.Body -and
        $null -ne $Result.Body.PSObject.Properties["data"]
    ) {
        return $Result.Body.data
    }

    return $Result.Body
}

function Assert-Status {
    param(
        [string]$Name,
        [object]$Result,
        [int]$Expected
    )

    if ($Result.Status -ne $Expected) {
        throw "$Name FAILED: HTTP $($Result.Status), expected $Expected"
    }

    $script:passed++

    Write-Host "[PASS] $Name" -ForegroundColor Green
}

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition
    )

    if (!$Condition) {
        throw "$Name FAILED"
    }

    $script:passed++

    Write-Host "[PASS] $Name" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SECURE STARTER INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

try {

    # -------------------------------------
    # 1. WEB
    # -------------------------------------

    $web = Invoke-WebRequest `
        -Uri "$origin/starter" `
        -UseBasicParsing `
        -TimeoutSec 10

    Assert-True "WEB server" ($web.StatusCode -eq 200)

    # -------------------------------------
    # 2. API
    # -------------------------------------

    $r = Call-Api "GET" "/health"

    Assert-Status "API server" $r 200

    # -------------------------------------
    # 3. Unauthorized access
    # -------------------------------------

    $r = Call-Api "GET" "/api/v1/notes"

    Assert-Status "Unauthorized notes blocked" $r 401

    # -------------------------------------
    # 4. Register user A
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/auth/web/register" `
        -Json @{
            email = $emailA
            password = $password
            name = "Test User A"
        } `
        -Session $sessionA `
        -WebOrigin

    Assert-Status "Register user A" $r 201

    $a = Get-Data $r

    if (!$a.accessToken -or !$a.user.id) {
        throw "Registration response missing authentication data."
    }

    $tokenA = $a.accessToken

    # -------------------------------------
    # 5. Current user
    # -------------------------------------

    $r = Call-Api `
        -Method "GET" `
        -Path "/api/v1/auth/me" `
        -Token $tokenA

    Assert-Status "Authenticated user" $r 200

    $me = Get-Data $r

    Assert-True "Correct user identity" (
        $me.id -eq $a.user.id
    )

    # -------------------------------------
    # 6. Refresh token
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/auth/web/refresh" `
        -Session $sessionA `
        -WebOrigin

    Assert-Status "Refresh token rotation" $r 200

    $refreshed = Get-Data $r

    if (!$refreshed.accessToken) {
        throw "Refresh response missing access token."
    }

    $tokenA = $refreshed.accessToken

    # -------------------------------------
    # 7. Create note
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/notes" `
        -Token $tokenA `
        -Json @{
            title = $title
            content = $content
        }

    Assert-Status "Create note" $r 201

    $note = Get-Data $r
    $noteId = $note.id

    if (!$noteId) {
        throw "Created note ID missing."
    }

    # -------------------------------------
    # 8. List notes
    # -------------------------------------

    $r = Call-Api `
        -Method "GET" `
        -Path "/api/v1/notes?search=$title" `
        -Token $tokenA

    Assert-Status "List notes" $r 200

    $listText = ConvertTo-Json -InputObject $r.Body -Depth 20

    Assert-True "Created note appears in list" (
        $listText.Contains($noteId)
    )

    # -------------------------------------
    # 9. Logout
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/auth/web/logout" `
        -Session $sessionA `
        -WebOrigin

    Assert-Status "Logout user A" $r 200

    # -------------------------------------
    # 10. Login again
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/auth/web/login" `
        -Json @{
            email = $emailA
            password = $password
        } `
        -Session $sessionA `
        -WebOrigin

    Assert-Status "Login again" $r 200

    $a = Get-Data $r
    $tokenA = $a.accessToken

    if (!$tokenA) {
        throw "Login response missing access token."
    }

    # -------------------------------------
    # 11. Persistence after login
    # -------------------------------------

    $r = Call-Api `
        -Method "GET" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenA

    Assert-Status "Note persists after login" $r 200

    $savedNote = Get-Data $r

    Assert-True "Note content preserved" (
        $savedNote.title -eq $title -and
        $savedNote.content -eq $content
    )

    # -------------------------------------
    # 12. Register user B
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/auth/web/register" `
        -Json @{
            email = $emailB
            password = $password
            name = "Test User B"
        } `
        -Session $sessionB `
        -WebOrigin

    Assert-Status "Register user B" $r 201

    $b = Get-Data $r
    $tokenB = $b.accessToken

    if (!$tokenB) {
        throw "User B access token missing."
    }

    # -------------------------------------
    # 13. Ownership protection
    # -------------------------------------

    $r = Call-Api `
        -Method "GET" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenB

    Assert-Status "Cross-user read blocked" $r 404

    $r = Call-Api `
        -Method "PATCH" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenB `
        -Json @{
            title = "Unauthorized change"
        }

    Assert-Status "Cross-user update blocked" $r 404

    $r = Call-Api `
        -Method "DELETE" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenB

    Assert-Status "Cross-user delete blocked" $r 404

    # -------------------------------------
    # 14. Update note
    # -------------------------------------

    $r = Call-Api `
        -Method "PATCH" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenA `
        -Json @{
            title = "$title-updated"
        }

    Assert-Status "Update own note" $r 200

    # -------------------------------------
    # 15. Delete note
    # -------------------------------------

    $r = Call-Api `
        -Method "DELETE" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenA

    Assert-Status "Delete own note" $r 200

    $r = Call-Api `
        -Method "GET" `
        -Path "/api/v1/notes/$noteId" `
        -Token $tokenA

    Assert-Status "Deleted note inaccessible" $r 404

    # -------------------------------------
    # 16. Logout all
    # -------------------------------------

    $r = Call-Api `
        -Method "POST" `
        -Path "/api/v1/auth/logout-all" `
        -Token $tokenA

    Assert-Status "Logout all sessions" $r 200

    $r = Call-Api `
        -Method "GET" `
        -Path "/api/v1/auth/me" `
        -Token $tokenA

    Assert-Status "Revoked access token blocked" $r 401

}
catch {

    $exitCode = 1

    Write-Host ""
    Write-Host "[FAILED] $($_.Exception.Message)" -ForegroundColor Red
}
finally {

    Write-Host ""
    Write-Host "========================================"
    Write-Host " CLEANUP TEST ACCOUNTS"
    Write-Host "========================================"

    try {

        $envPath = Join-Path $root ".env"

        $values = @{}

        foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {

            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {

                $values[$Matches[1]] = $Matches[2].Trim().Trim('"', "'")
            }
        }

        $dbUser = $values["POSTGRES_USER"]
        $dbName = $values["POSTGRES_DB"]

        if ($values["COMPOSE_PROJECT_NAME"] -cne [string]$identity.Project) {
            throw "DB 프로젝트 식별자가 일치하지 않아 정리를 중단합니다."
        }

        if (!$dbUser -or !$dbName) {
            throw "Database configuration missing."
        }

        # Delete ONLY the two randomly generated test accounts.
        # Related test sessions and notes are removed by DB cascade.

        $sql = @"
DELETE FROM "User"
WHERE "email" IN ('$emailA', '$emailB');
"@

        $cleanupResult = $sql | & docker.exe compose `
            -p $identity.Project `
            --project-directory $root `
            -f (Join-Path $root "compose.yaml") `
            exec -T postgres `
            psql `
            -U $dbUser `
            -d $dbName `
            -v ON_ERROR_STOP=1 `
            -f - 2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "Test account cleanup failed."
        }

        Write-Host "Temporary test accounts removed." -ForegroundColor Green
        Write-Host "Existing user accounts preserved." -ForegroundColor Green

    }
    catch {

        $cleanupOK = $false
        $exitCode = 1

        Write-Host "WARNING: Automatic cleanup failed." -ForegroundColor Yellow
        Write-Host "Only the generated test accounts require manual review."
        Write-Host "Test account A: $emailA"
        Write-Host "Test account B: $emailB"
        Write-Host $_.Exception.Message
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " FINAL TEST RESULT" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    Write-Host "Passed checks: $passed"

    if ($exitCode -eq 0 -and $cleanupOK) {
        Write-Host "ALL TESTS PASSED" -ForegroundColor Green
    }
    else {
        Write-Host "TEST FAILED OR CLEANUP INCOMPLETE" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "JWT secret: unchanged"
    Write-Host "Environment files: unchanged"
    Write-Host "Existing user data: not targeted"
}

exit $exitCode

