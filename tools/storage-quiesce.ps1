param([ValidateSet('CHECK','STOP')][string]$Action='CHECK')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root '.starter-state'
$identityFile = Join-Path $stateDir 'identity.json'
$runtimeFile = Join-Path $stateDir 'runtime.json'
$utf8 = New-Object Text.UTF8Encoding($false)
$move = Get-Content -LiteralPath (Join-Path $stateDir 'storage-migration.json') -Raw | ConvertFrom-Json
if ($root -cne $move.source -or $move.backup -notlike 'E:\Backups\CT-Farm\*') { throw '이전 소유 경로가 일치하지 않습니다.' }
# 기존 소유권 함수만 불러옵니다. 런처 본문, Docker 제어, Git 명령은 실행하지 않습니다.
$tokens=$null; $parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'SECURE-LIFECYCLE.ps1'),[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw '기존 런처 구문 오류' }
foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -is [Management.Automation.Language.FunctionDefinitionAst]) { . ([scriptblock]::Create($statement.Extent.Text)) }
}
$identity=Get-Identity
Assert-ManagedListeners $identity
$phoneFile=Join-Path $stateDir 'phone-test\services.json'
$phone=Get-Content -LiteralPath $phoneFile -Raw | ConvertFrom-Json
if ($phone.projectRoot -cne $root -or $phone.appRoot -cne (Join-Path $stateDir 'phone-test\app')) { throw '휴대폰 시험 실행 경로 불일치' }
$checked=@()
foreach ($entry in $phone.processes) {
    $processInfo=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$entry.pid)
    if (!$processInfo) { continue }
    $expected=if ($entry.name -ceq 'phone-api') { Join-Path $root 'tools\test-mobile-api.mts' } elseif ($entry.name -ceq 'phone-metro') { Join-Path $phone.appRoot 'node_modules\expo\bin\cli' } else { throw '예상하지 못한 시험 프로세스' }
    $difference=[math]::Abs(($processInfo.CreationDate.ToUniversalTime()-([datetime]$entry.startedAt).ToUniversalTime()).TotalSeconds)
    if ($processInfo.ExecutablePath -ine $entry.executable -or $difference -gt 5 -or !$processInfo.CommandLine.Contains($expected)) { throw '시험 프로세스 경로·생성 시각 소유권 불일치' }
    $checked+=@{pid=[int]$entry.pid;name=$entry.name;creationDate=$processInfo.CreationDate.ToUniversalTime().ToString('o');expected=$expected;executable=$entry.executable}
}
$private=Join-Path $move.backup 'private'
Copy-Item -LiteralPath $runtimeFile -Destination (Join-Path $private ('runtime-before-quiesce-'+$Action+'.json'))
Copy-Item -LiteralPath $identityFile -Destination (Join-Path $private 'identity-before-quiesce.json')
$report=@{action=$Action;startedAt=[datetime]::UtcNow.ToString('o');phoneProcessCount=$checked.Count;dockerControlled=$false;gitExecuted=$false}
if ($Action -ceq 'STOP') {
    Write-Host 'CT-Farm 소유 API·웹·수집기·휴대폰 개발 서버만 중지합니다. Docker 컨테이너는 유지합니다.'
    foreach ($entry in @($checked | Sort-Object name -Descending)) {
        $current=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$entry.pid)
        if (!$current) { continue }
        if ($current.CreationDate.ToUniversalTime().ToString('o') -cne $entry.creationDate -or $current.ExecutablePath -ine $entry.executable -or !$current.CommandLine.Contains($entry.expected)) { throw '중지 직전 소유권 재검사 실패' }
        & taskkill.exe /PID $entry.pid /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw '검증된 시험 서버 중지 실패' }
    }
    # 시험 호스트의 자동 정리는 실행하지 않아 기존 임시 컨테이너·업로드를 보존합니다.
    Stop-OwnedProcesses
    $report.status='ctfarm_writers_stopped_docker_preserved'
} else { $report.status='ownership_checks_passed' }
$report.endedAt=[datetime]::UtcNow.ToString('o')
[IO.File]::WriteAllText((Join-Path $root ('verification\storage-migration\quiesce-'+$Action+'.json')),($report | ConvertTo-Json -Depth 6),$utf8)
Write-Host ('검사 완료: '+$report.status)
