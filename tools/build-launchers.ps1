# PowerShell 5.1 / .NET Framework C# 컴파일러로 실행 파일을 생성합니다.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (!(Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (!(Test-Path -LiteralPath $compiler)) { throw "C# 컴파일러가 없습니다." }
$source = Join-Path $PSScriptRoot "SecureStarterLauncher.cs"
$backup = Join-Path $root (".starter-backups\launchers-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $backup | Out-Null
$stage = Join-Path $backup "compiled"
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($name in @("SETUP", "STARTER", "STOP")) {
    $existing = Join-Path $root ($name + ".exe")
    if (Test-Path -LiteralPath $existing) {
        Copy-Item -LiteralPath $existing -Destination $backup
    }
    $output = Join-Path $stage ($name + ".exe")
    & $compiler /nologo /target:exe ("/out:" + $output) $source
    if ($LASTEXITCODE -ne 0) { throw "실행 파일 컴파일 실패: $name" }
}
foreach ($name in @("SETUP", "STARTER", "STOP")) {
    Copy-Item -LiteralPath (Join-Path $stage ($name + ".exe")) -Destination $root -Force
}
Write-Host "실행 파일 3개 생성 완료. 변경 전 실행 파일 백업: $backup"

