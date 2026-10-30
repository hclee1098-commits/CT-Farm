# Windows PowerShell 5.1에서 실행하면 해당 버전 문법으로 모든 스크립트를 검사합니다.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$files = @(Get-ChildItem -LiteralPath $root -Filter *.ps1 -File -Recurse |
    Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.starter-backups|\.next)[\\/]' })
foreach ($file in $files) {
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    if ($bytes.Length -lt 3 -or $bytes[0] -ne 239 -or $bytes[1] -ne 187 -or $bytes[2] -ne 191) {
        throw "UTF-8 BOM 누락: $($file.FullName)"
    }
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $file.FullName, [ref]$tokens, [ref]$parseErrors
    ) | Out-Null
    if (@($parseErrors).Count -gt 0) {
        $details = ($parseErrors | ForEach-Object { $_.Message }) -join "; "
        throw "PowerShell 문법 오류: $($file.FullName): $details"
    }
}
Write-Host "PS1 BOM 및 문법 검사 통과: $($files.Count)개 / PowerShell $($PSVersionTable.PSVersion)"
if ($PSVersionTable.PSVersion.Major -ne 5) {
    Write-Warning "PowerShell 5.1 호환성 최종 검사는 Windows PowerShell 5.1에서 실행하세요."
}

