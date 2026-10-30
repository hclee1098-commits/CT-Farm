param([Parameter(Mandatory=$true)][string]$TestRoot,[Parameter(Mandatory=$true)][int]$ApiPort,[Parameter(Mandatory=$true)][int]$WebPort)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$workspace=Split-Path -Parent $PSScriptRoot
$resolved=[IO.Path]::GetFullPath($TestRoot)
if (!$resolved.StartsWith(($workspace+'\verification\runtime\round6-lifecycle-'),[StringComparison]::OrdinalIgnoreCase)) { throw '격리 경로만 허용합니다.' }
if ($ApiPort -in @(3000,4000) -or $WebPort -in @(3000,4000)) { throw '원본 포트 사용 금지' }
$root=$resolved;$stateDir=Join-Path $root '.starter-state';$runtimeFile=Join-Path $stateDir 'runtime.json';$identityFile=Join-Path $stateDir 'identity.json';$utf8=New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $stateDir -Force|Out-Null
$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $workspace 'SECURE-LIFECYCLE.ps1'),[ref]$tokens,[ref]$errors)
if (@($errors).Count) { throw '런처 구문 오류' }
foreach($definition in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $definition.Extent.Text}
$identity=[pscustomobject]@{Project='round6-isolated';Root=$root;ApiPort=$ApiPort;WebPort=$WebPort;MigrationCompleted=$true}
function Get-Identity { return $script:identity }
function Ensure-Node {}
function Ensure-Docker {}
function Ensure-Environment {param($Identity) return @{} }
function Verify-Ownership {param($Identity,$Db) return $true }
function Compose {param($Identity,$Arguments) }
function Wait-Services {param($Identity) }
function Docker-Ready {return $false}
$env:SECURE_STARTER_NO_BROWSER='1';$env:PORT=[string]$ApiPort;$checks=0
try {
 Do-Start;$checks++
 Do-Start;$checks++
 Do-Stop;$checks++
 Do-Stop;$checks++
 # 포트만 같은 외부 시험 리스너를 소유한 것으로 인정하지 않습니다.
 $foreign=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$ApiPort);$foreign.Start()
 try {$blocked=$false;try{Do-Start}catch{$blocked=$true};if(!$blocked){throw '외부 리스너 차단 실패'};if(!(Test-TcpOpen $ApiPort)){throw '외부 리스너가 중지됨'};$checks++}finally{$foreign.Stop()}
 $stale=[pscustomobject]@{project=$identity.Project;root=$root;api=@{name='api';pid=2147483000;mode='unknown';started='2000-01-01T00:00:00Z'};web=$null;collector=$null}
 Save-Runtime $stale;Do-Start;$checks++;Do-Stop
 Write-Host ('통과: 격리 런처 실제 시작·중복·종료·외부 포트 보존·오래된 상태 '+$checks+'건')
}finally{if(Test-Path -LiteralPath $runtimeFile){Assert-ManagedListeners $identity;Stop-OwnedProcesses}}
