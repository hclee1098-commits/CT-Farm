# 실제 서버를 종료하지 않고 소유권 거부 경계와 진단 비밀정보 보호를 검사합니다.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$source = Join-Path (Split-Path -Parent $PSScriptRoot) "SECURE-LIFECYCLE.ps1"
$tokens = $null; $errors = $null
$tree = [System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if (@($errors).Count) { throw "런처 구문 오류" }
foreach ($name in @("Assert-ManagedListeners","Do-Stop","Show-Diagnosis","Test-OwnedProcess","Get-LocalWebUrl","Enter-LifecycleLock")) {
    $definition = $tree.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
    Invoke-Expression $definition.Extent.Text
}
$realOwnerCheck = (Get-Item function:Test-OwnedProcess).ScriptBlock
$root = "C:\test-owned-project"
$stateDir = "$root\.starter-state"
$runtimeFile = "$stateDir\runtime.json"
$identity = [pscustomobject]@{Project="test-project";ApiPort=14000;WebPort=13000}
$state = [pscustomobject]@{project="test-project";root=$root;api=@{pid=123};web=@{pid=124}}
$hasState = $false; $listening = $false; $owned = $false; $listenerOwned = $false; $stops = 0; $checks = 0
function Get-ProcessStamp { param($ProcessId) return "verified-start" }
function Get-CimInstance { param($ClassName,$Filter,$ErrorAction) return [pscustomobject]@{ExecutablePath="C:\Windows\System32\cmd.exe";CommandLine="npm run dev -w @starter/api"} }
if (& $realOwnerCheck ([pscustomobject]@{name="api";pid=123;started="verified-start";mode="legacy"})) { throw "다른 프로젝트와 같은 구형 npm 문자열을 소유권 증거로 사용" }
$checks++
function Read-Env {param($Path) return @{NEXT_PUBLIC_API_BASE_URL=$script:publicApi}}
$identity | Add-Member -NotePropertyName WebPort -NotePropertyValue 13000 -Force
$publicApi="http://localhost:14000/api/v1";if((Get-LocalWebUrl $identity) -ne 'http://localhost:13000/starter'){throw 'localhost 호스트 불일치'};$checks++
$publicApi="http://127.0.0.1:14000";if((Get-LocalWebUrl $identity) -ne 'http://127.0.0.1:13000/starter'){throw '127 호스트 불일치'};$checks++
$publicApi="http://outside.invalid:14000";$rejectedHost=$false;try{Get-LocalWebUrl $identity}catch{$rejectedHost=$true};if(!$rejectedHost){throw '외부 공개 API 허용'};$checks++
function Test-Path { param($LiteralPath,$PathType) return $script:hasState }
function Get-Content { param($LiteralPath,[switch]$Raw,$Tail) return ($script:state | ConvertTo-Json -Depth 6) }
function Get-NetTCPConnection { param($LocalPort,$State,$ErrorAction) if ($script:listening) { [pscustomobject]@{OwningProcess=123} } }
function Test-OwnedProcess { param($Entry) return $script:owned }
function Test-OwnedListener { param($Port,$Entry) return $script:listenerOwned }
function Test-TcpOpen { param($Port) return $script:listening }
function Step { param($Message) }
function Get-Identity { return $script:identity }
function Stop-OwnedProcesses { $script:stops++ }
function Must-Reject { param([scriptblock]$Action) $rejected=$false;try { & $Action } catch { $rejected=$true };if (!$rejected) { throw "거부되어야 할 작업 허용" };$script:checks++ }
Assert-ManagedListeners $identity; $checks++
$listening=$true
Must-Reject { Assert-ManagedListeners $identity }
Must-Reject { Do-Stop }
if ($stops -ne 0) { throw "소유권 검사 전 종료 시도" }
$hasState=$true; $owned=$true
Must-Reject { Assert-ManagedListeners $identity }
$listenerOwned=$true
Assert-ManagedListeners $identity; $checks++
$state.project="other-project";Must-Reject { Assert-ManagedListeners $identity };$state.project="test-project"
$state.root="C:\other-project";Must-Reject { Assert-ManagedListeners $identity };$state.root=$root
$script:captured=@()
function Write-Host { param($Object,$ForegroundColor) $script:captured += [string]$Object }
function Show-Status {}
function Get-Content { param($LiteralPath,[switch]$Raw,$Tail) return @('{"time":123,"level":50,"statusCode":503,"message":"TEST_SECRET_DO_NOT_PRINT","password":"TEST_SECRET_DO_NOT_PRINT"}','unstructured TEST_SECRET_DO_NOT_PRINT') }
Show-Diagnosis
if (($captured -join " ") -match "TEST_SECRET_DO_NOT_PRINT") { throw "진단 로그 비밀값 노출" }
if (($captured -join " ") -notmatch '503') { throw "진단 숫자 상태 누락" }
$checks++
[Console]::WriteLine('실제 별도 프로세스의 중복 제어 잠금을 검사합니다.')
$lockDefinition=$tree.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Enter-LifecycleLock'},$true).Extent.Text
$held=Enter-LifecycleLock
try {
    $childCode=$lockDefinition+'; $root="C:\test-owned-project"; try { $handle=Enter-LifecycleLock; $handle.ReleaseMutex(); $handle.Dispose(); exit 2 } catch { if ($_.Exception.Message -like "다른 실행*") { exit 7 }; exit 8 }'
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childCode))
    & powershell.exe -NoProfile -EncodedCommand $encoded
    if ($LASTEXITCODE -ne 7) { throw '동시 제어 잠금 거부 실패' }
} finally { $held.ReleaseMutex();$held.Dispose() }
$checks++
[Console]::WriteLine("런처 경계 검사 {0}건 통과: 외부 PID 거부, 변경 전 실패 중단, 프로젝트·경로 격리, 진단 비밀정보 차단" -f $checks)
