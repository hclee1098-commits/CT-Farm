param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("SETUP","STARTER","START","STOP","STATUS","RESTART","DIAGNOSE")]
    [string]$Action
)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot

Set-Location -LiteralPath $root

$stateDir = Join-Path $root ".starter-state"
$identityFile = Join-Path $stateDir "identity.json"
$runtimeFile = Join-Path $stateDir "runtime.json"

$utf8 = New-Object System.Text.UTF8Encoding($false)

# 이 관리 스크립트는 LOCAL 전용입니다. 원격 배포 권한을 사용하지 않습니다.
if ($Action -in @("STARTER","START","RESTART")) {
    if ($env:APP_ENV -and $env:APP_ENV -ne "LOCAL") {
        throw "STARTER는 LOCAL 전용입니다. 원격 배포는 CI/CD를 사용하세요."
    }
    $env:APP_ENV = "LOCAL"
    $env:MONITOR_DIR = Join-Path $stateDir "monitoring"
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " $Message" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Run([string]$Command,[string[]]$Arguments) {
    $old = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & $Command @Arguments
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $old
    }

    if ($code -ne 0) {
        throw "$Command 실행 실패 (종료 코드 $code)"
    }
}

function New-Secret([int]$Length) {
    $bytes = New-Object byte[] $Length
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    return [BitConverter]::ToString($bytes).Replace("-","").ToLowerInvariant()
}

function Save-New([string]$Path,[string]$Content) {
    $stream = [IO.File]::Open(
        $Path,
        [IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write,
        [IO.FileShare]::None
    )

    try {
        $bytes = $utf8.GetBytes($Content)
        $stream.Write($bytes,0,$bytes.Length)
    }
    finally {
        $stream.Dispose()
    }
}

function Read-Env([string]$Path) {
    if (!(Test-Path -LiteralPath $Path)) {
        throw "환경설정 파일이 없습니다: $Path"
    }

    $result = @{}

    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2].Trim()

            if ($result.ContainsKey($key)) {
                throw "중복 환경변수: $key"
            }

            if ($value.Length -ge 2) {
                if (
                    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                    ($value.StartsWith("'") -and $value.EndsWith("'"))
                ) {
                    $value = $value.Substring(1,$value.Length-2)
                }
            }

            $result[$key] = $value
        }
    }

    return $result
}

function Require-Env($Values,[string[]]$Keys) {
    foreach ($key in $Keys) {
        if (
            !$Values.ContainsKey($key) -or
            [string]::IsNullOrWhiteSpace($Values[$key])
        ) {
            throw "필수 환경변수 누락: $key"
        }
    }
}

function Docker-Ready {
    $old = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        & cmd.exe /d /c "docker info >nul 2>&1"
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $old
    }
}

function Ensure-Docker {
    if (!(Get-Command docker.exe -ErrorAction SilentlyContinue)) {
        throw "Docker Desktop이 필요합니다."
    }

    if (!(Docker-Ready)) {
        $desktop = Join-Path $env:ProgramFiles `
            "Docker\Docker\Docker Desktop.exe"

        if (Test-Path -LiteralPath $desktop) {
            Write-Host "Docker Desktop 실행 중..."
            Start-Process -FilePath $desktop
        }

        for ($i=0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 3
            if (Docker-Ready) { break }
        }
    }

    if (!(Docker-Ready)) {
        throw "Docker 엔진이 준비되지 않았습니다."
    }

    Run "docker.exe" @("compose","version")
}

function Ensure-Node {
    if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Node.js 22 이상이 필요합니다."
    }

    if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm을 찾을 수 없습니다."
    }

    $version = (& node.exe --version).Trim()
    $major = [int](($version.TrimStart("v")).Split(".")[0])

    if ($major -lt 22) {
        throw "Node.js 22 이상이 필요합니다. 현재: $version"
    }

    Write-Host "Node.js $version 정상" -ForegroundColor Green
}

function Get-Containers {

    $ids = @(
        & docker.exe ps -aq
    )

    if ($LASTEXITCODE -ne 0) {
        throw "Docker 컨테이너 목록 조회 실패"
    }

    foreach ($id in $ids) {

        if ([string]::IsNullOrWhiteSpace($id)) {
            continue
        }

        $lines = @(
            & docker.exe inspect $id
        )

        if ($LASTEXITCODE -ne 0) {
            throw "Docker 컨테이너 상세 조회 실패"
        }

        $raw = $lines -join "`n"

        $parsed = ConvertFrom-Json -InputObject $raw

        if ($parsed -is [array]) {

            if ($parsed.Count -ne 1) {
                throw "Docker 객체 개수 오류"
            }

            $container = $parsed[0]

        }
        else {

            $container = $parsed
        }

        Write-Output $container
    }
}
function Get-Volumes {
    $names = @(docker.exe volume ls --format '{{.Name}}')

    if ($LASTEXITCODE -ne 0) {
        throw "Docker 볼륨 조회 실패"
    }

    return $names
}

function Test-LegacyResources {

    # 과거 Docker 프로젝트가 동일한 폴더를 사용했더라도
    # 신규 프로젝트 ID가 다르면 자동으로 차단하지 않습니다.
    #
    # 단, 기존 환경설정이 있는데 설치 식별자가 없다면
    # 기존 DB에 잘못 연결될 위험이 있으므로 중단합니다.

    foreach ($file in @(
        ".env",
        "apps\api\.env",
        "apps\web\.env.local"
    )) {

        $path = Join-Path $root $file

        if (Test-Path -LiteralPath $path -PathType Leaf) {

            throw (
                "설치 식별자가 없지만 기존 환경설정이 존재합니다: " +
                $file +
                ". 기존 설정을 덮어쓰지 않습니다. " +
                "새 프로젝트는 깨끗한 복사본에서 설치하세요."
            )
        }
    }
}

function Get-ReservedPorts {
    $reserved = @{}

    foreach ($container in @(Get-Containers)) {
        $bindings = $container.HostConfig.PortBindings

        if (!$bindings) { continue }

        foreach ($property in $bindings.PSObject.Properties) {
            foreach ($binding in @($property.Value)) {
                if ($binding -and $binding.HostPort) {
                    $reserved[[string]$binding.HostPort] = $true
                }
            }
        }
    }

    return $reserved
}

function New-Port([int]$Start,[int]$End,$Reserved) {
    for ($port=$Start; $port -le $End; $port++) {
        if ($Reserved.ContainsKey([string]$port)) {
            continue
        }

        $listeners = @(
            Get-NetTCPConnection `
                -LocalPort $port `
                -State Listen `
                -ErrorAction SilentlyContinue
        )

        if ($listeners.Count -eq 0) {
            $Reserved[[string]$port] = $true
            return $port
        }
    }

    throw "사용 가능한 포트를 찾지 못했습니다."
}

function Save-Identity($Identity) {
    $json = $Identity | ConvertTo-Json -Depth 5

    if (!(Test-Path -LiteralPath $identityFile)) {
        Save-New $identityFile $json
        return
    }

    $temp = Join-Path $stateDir (
        "identity-" + [guid]::NewGuid().ToString("N") + ".tmp"
    )

    [IO.File]::WriteAllText($temp,$json,$utf8)

    try {
        $identityBackup = Join-Path $stateDir (
            "identity-backup-" +
            [guid]::NewGuid().ToString("N") +
            ".json"
        )

        [IO.File]::Replace(
            $temp,
            $identityFile,
            $identityBackup
        )
    }
    finally {
        if (Test-Path -LiteralPath $temp) {
            Remove-Item -LiteralPath $temp -Force
        }
    }
}

function Get-Identity {

    if (!(Test-Path -LiteralPath $identityFile)) {
        return $null
    }

    $identity = Get-Content `
        -LiteralPath $identityFile `
        -Raw | ConvertFrom-Json

    if (
        $identity.Version -notin @(4,5) -or
        $identity.Project -notmatch '^ss[a-f0-9]{12}$'
    ) {
        throw "프로젝트 설치 식별자가 올바르지 않습니다."
    }

    if (![string]::Equals(
        [string]$identity.Root,
        $root,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        # 원래 폴더가 남아 있으면 복사본일 수 있으므로 연결하지 않습니다.
        # 이동한 설치는 원본 경로를 보존하고 Docker 소유권을 계속 검사합니다.
        if (
            ![IO.Path]::IsPathRooted([string]$identity.Root) -or
            (Test-Path -LiteralPath $identity.Root)
        ) {
            throw "기존 설치 폴더가 남아 있어 복사본의 자동 연결을 차단합니다: $($identity.Root)"
        }
        Write-Host "설치 폴더 이동 감지: 기존 Docker 소유권 검증 후 연결합니다." -ForegroundColor Yellow
    }

    foreach ($name in @(
        "PgPort",
        "RedisPort",
        "ApiPort",
        "WebPort"
    )) {

        $port = [int]$identity.$name

        if ($port -lt 1 -or $port -gt 65535) {
            throw "설치 포트 정보가 올바르지 않습니다: $name"
        }
    }

    $ports = @(
        [int]$identity.PgPort,
        [int]$identity.RedisPort,
        [int]$identity.ApiPort,
        [int]$identity.WebPort
    )

    if (@($ports | Select-Object -Unique).Count -ne 4) {
        throw "프로젝트 내부 포트가 중복되었습니다."
    }

    return $identity
}

function Ensure-Identity {

    $identity = Get-Identity

    if ($identity) {

        Write-Host "기존 프로젝트 식별자 확인" -ForegroundColor Green

        return $identity
    }

    Test-LegacyResources

    $containers = @(Get-Containers)
    $volumes = @(Get-Volumes)

    $networks = @(
        docker.exe network ls --format '{{.Name}}'
    )

    if ($LASTEXITCODE -ne 0) {
        throw "Docker 네트워크 조회 실패"
    }

    $project = $null

    # 기존 컨테이너, 볼륨, 네트워크와 충돌하지 않는
    # 신규 Docker 프로젝트 식별자를 생성합니다.

    for ($attempt=0; $attempt -lt 30; $attempt++) {

        $candidate = (
            "ss" +
            ([guid]::NewGuid().ToString("N")).Substring(0,12)
        )

        $collision = $false

        foreach ($container in $containers) {

            $existingProject = [string](
                $container.Config.Labels.'com.docker.compose.project'
            )

            if ($existingProject -eq $candidate) {
                $collision = $true
                break
            }

            if (
                [string]$container.Name -like "/$candidate-*"
            ) {
                $collision = $true
                break
            }
        }

        foreach ($volume in $volumes) {

            if ($volume -like "${candidate}_*") {
                $collision = $true
                break
            }
        }

        foreach ($network in $networks) {

            if ($network -like "${candidate}_*") {
                $collision = $true
                break
            }
        }

        if (!$collision) {

            $project = $candidate
            break
        }
    }

    if (!$project) {
        throw "충돌하지 않는 Docker 프로젝트 ID 생성 실패"
    }

    # 실행 중이거나 종료된 Docker 컨테이너가
    # 예약한 포트를 모두 제외합니다.

    $reserved = Get-ReservedPorts

    $identity = [pscustomobject]@{

        Version = 5

        Project = $project

        Root = $root

        PgPort = New-Port 15432 15999 $reserved

        RedisPort = New-Port 16379 16999 $reserved

        ApiPort = New-Port 4000 4999 $reserved

        WebPort = New-Port 3000 3999 $reserved

        MigrationCompleted = $false

        CreatedAt = (
            Get-Date
        ).ToUniversalTime().ToString("o")
    }

    New-Item `
        -ItemType Directory `
        -Path $stateDir `
        -Force | Out-Null

    Save-Identity $identity

    Write-Host ""
    Write-Host "신규 Docker 프로젝트 생성" -ForegroundColor Green

    Write-Host "프로젝트 ID: $($identity.Project)"
    Write-Host "PostgreSQL: $($identity.PgPort)"
    Write-Host "Redis: $($identity.RedisPort)"
    Write-Host "API: $($identity.ApiPort)"
    Write-Host "WEB: $($identity.WebPort)"

    return $identity
}

function Compose($Identity,[string[]]$Arguments) {
    $args = @(
        "compose",
        "-p",$Identity.Project,
        "--project-directory",$root,
        "-f",(Join-Path $root "compose.yaml")
    ) + $Arguments

    Run "docker.exe" $args
}

function Get-OwnedContainers($Identity) {
    $result = @()

    foreach ($container in @(Get-Containers)) {
        $project = [string]$container.Config.Labels.'com.docker.compose.project'

        if ($project -eq $Identity.Project) {
            $result += $container
        }
    }

    return $result
}

function Verify-Ownership(
    $Identity,
    $Db,
    [bool]$AllowIncomplete = $false
) {

    $owned = @(Get-OwnedContainers $Identity)
    $volumes = @(Get-Volumes)

    $pgVolume = $Identity.Project + "_postgres_data"
    $redisVolume = $Identity.Project + "_redis_data"

    $expectedVolumes = @(
        $pgVolume,
        $redisVolume
    )

    $hasPg = $volumes -contains $pgVolume
    $hasRedis = $volumes -contains $redisVolume

    # 예상하지 못한 동일 프로젝트 볼륨이 있으면 중단합니다.

    foreach ($volume in $volumes) {

        if (
            $volume -like "$($Identity.Project)_*" -and
            $volume -notin $expectedVolumes
        ) {
            throw "예상하지 못한 프로젝트 볼륨이 있습니다."
        }
    }

    # 볼륨 이름뿐 아니라 Docker Compose 소유권 라벨도 확인합니다.

    foreach ($volumeName in $expectedVolumes) {

        if ($volumes -notcontains $volumeName) {
            continue
        }

        $raw = (
            & docker.exe volume inspect $volumeName | Out-String
        )

        if ($LASTEXITCODE -ne 0) {
            throw "Docker 볼륨 상세 조회 실패"
        }

        $volumeInfo = @($raw | ConvertFrom-Json)[0]

        $labels = $volumeInfo.Labels

        if (!$labels) {
            throw "Docker 볼륨 소유권 라벨이 없습니다."
        }

        $labelProject = [string](
            $labels.'com.docker.compose.project'
        )

        $labelVolume = [string](
            $labels.'com.docker.compose.volume'
        )

        $expectedLabel = if ($volumeName -eq $pgVolume) {
            "postgres_data"
        }
        else {
            "redis_data"
        }

        if (
            $labelProject -cne $Identity.Project -or
            $labelVolume -cne $expectedLabel
        ) {
            throw "Docker 볼륨 소유권이 일치하지 않습니다."
        }
    }

    if ($owned.Count -gt 2) {
        throw "프로젝트 컨테이너가 예상보다 많습니다."
    }

    $services = @{}

    foreach ($container in $owned) {

        $labels = $container.Config.Labels

        $service = [string](
            $labels.'com.docker.compose.service'
        )

        $workdir = [string](
            $labels.'com.docker.compose.project.working_dir'
        )

        if ($service -notin @("postgres","redis")) {
            throw "알 수 없는 Docker 서비스가 발견되었습니다."
        }

        if ($services.ContainsKey($service)) {
            throw "Docker 서비스가 중복되었습니다."
        }

        if (![string]::Equals(
            $workdir.TrimEnd('\'),
            $root.TrimEnd('\'),
            [StringComparison]::OrdinalIgnoreCase
        ) -and !(
            !(Test-Path -LiteralPath $Identity.Root) -and
            [string]::Equals(
                $workdir.TrimEnd('\'),
                ([string]$Identity.Root).TrimEnd('\'),
                [StringComparison]::OrdinalIgnoreCase
            )
        )) {
            throw "다른 폴더에서 생성된 Docker 컨테이너입니다."
        }

        $services[$service] = $container

        if ($service -eq "postgres") {

            $expectedVolume = $pgVolume
            $containerPort = "5432/tcp"
            $expectedPort = [int]$Identity.PgPort
            $expectedImage = "postgres:16-alpine"

        }
        else {

            $expectedVolume = $redisVolume
            $containerPort = "6379/tcp"
            $expectedPort = [int]$Identity.RedisPort
            $expectedImage = "redis:7-alpine"
        }

        if (
            [string]$container.Config.Image -cne $expectedImage
        ) {
            throw "Docker 서비스 이미지가 예상과 다릅니다."
        }

        $mountNames = @(
            $container.Mounts |
                Where-Object {
                    $_.Type -eq "volume"
                } |
                ForEach-Object {
                    $_.Name
                }
        )

        if ($mountNames -notcontains $expectedVolume) {
            throw "Docker 데이터 볼륨 연결이 일치하지 않습니다."
        }

        $portBindings = $container.HostConfig.PortBindings

        if (!$portBindings) {
            throw "Docker 포트 연결 정보가 없습니다."
        }

        $property = @(
            $portBindings.PSObject.Properties |
                Where-Object {
                    $_.Name -eq $containerPort
                }
        )

        if ($property.Count -ne 1) {
            throw "Docker 컨테이너 포트가 일치하지 않습니다."
        }

        $bindings = @($property[0].Value)

        if ($bindings.Count -ne 1) {
            throw "Docker 호스트 포트 연결이 올바르지 않습니다."
        }

        $binding = $bindings[0]

        if (
            [int]$binding.HostPort -ne $expectedPort -or
            $binding.HostIp -ne "127.0.0.1"
        ) {
            throw "Docker 포트 또는 외부 공개 설정이 일치하지 않습니다."
        }

        if ($service -eq "postgres") {

            $actualEnv = @{}

            foreach ($line in @($container.Config.Env)) {

                if ($line -match '^([^=]+)=(.*)$') {

                    $actualEnv[$Matches[1]] = $Matches[2]
                }
            }

            foreach ($key in @(
                "POSTGRES_USER",
                "POSTGRES_PASSWORD",
                "POSTGRES_DB"
            )) {

                if (
                    !$actualEnv.ContainsKey($key) -or
                    !$Db.ContainsKey($key) -or
                    $actualEnv[$key] -cne $Db[$key]
                ) {
                    throw "PostgreSQL 인증정보가 일치하지 않습니다."
                }
            }
        }
    }

    # 정상적으로 구성된 기존 프로젝트

    if (
        $owned.Count -eq 2 -and
        $hasPg -and
        $hasRedis -and
        $services.ContainsKey("postgres") -and
        $services.ContainsKey("redis")
    ) {
        return $true
    }

    # 아직 Docker 리소스가 생성되지 않은 신규 프로젝트

    if (
        $owned.Count -eq 0 -and
        !$hasPg -and
        !$hasRedis
    ) {
        return $false
    }

    # V5 신규 설치가 중단된 경우에만
    # 검증된 일부 리소스의 생성 재시도를 허용합니다.
    #
    # 볼륨 삭제 및 데이터베이스 초기화는 수행하지 않습니다.

    if (
        $AllowIncomplete -and
        $Identity.Version -eq 5 -and
        !$Identity.MigrationCompleted
    ) {

        Write-Host (
            "미완료 설치 리소스 확인. " +
            "기존 데이터를 유지하며 설치를 재시도합니다."
        ) -ForegroundColor Yellow

        return $false
    }

    throw "Docker 프로젝트 리소스가 불완전합니다. 자동 변경을 차단합니다."
}

function Ensure-Environment($Identity) {
    $rootEnv = Join-Path $root ".env"
    $apiEnv = Join-Path $root "apps\api\.env"
    $webEnv = Join-Path $root "apps\web\.env.local"

    $owned = @(Get-OwnedContainers $Identity)
    $volumes = @(Get-Volumes)

    $existingDb = (
        $volumes -contains "$($Identity.Project)_postgres_data"
    )

    if (!(Test-Path -LiteralPath $rootEnv)) {
        if ($existingDb -or $owned.Count -gt 0 -or (Test-Path $apiEnv)) {
            throw "기존 리소스가 있어 DB 환경설정을 새로 생성할 수 없습니다."
        }

        $password = New-Secret 32

        $content = @(
            "COMPOSE_PROJECT_NAME=$($Identity.Project)",
            "POSTGRES_USER=starter_user",
            "POSTGRES_PASSWORD=$password",
            "POSTGRES_DB=starter_db",
            "POSTGRES_PORT=$($Identity.PgPort)",
            "REDIS_PORT=$($Identity.RedisPort)"
        ) -join "`r`n"

        Save-New $rootEnv ($content + "`r`n")
        Write-Host "루트 환경설정 생성 완료" -ForegroundColor Green
    }

    $db = Read-Env $rootEnv

    Require-Env $db @(
        "COMPOSE_PROJECT_NAME",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_DB",
        "POSTGRES_PORT",
        "REDIS_PORT"
    )

    if (
        $db["COMPOSE_PROJECT_NAME"] -cne $Identity.Project -or
        [int]$db["POSTGRES_PORT"] -ne [int]$Identity.PgPort -or
        [int]$db["REDIS_PORT"] -ne [int]$Identity.RedisPort
    ) {
        throw "프로젝트 식별자 또는 Docker 포트 설정이 일치하지 않습니다."
    }

    if (!(Test-Path -LiteralPath $apiEnv)) {
        if ($existingDb -or $owned.Count -gt 0) {
            throw "기존 DB가 있으나 API 환경설정이 없습니다. 자동 재생성을 차단합니다."
        }

        $user = [Uri]::EscapeDataString($db["POSTGRES_USER"])
        $pass = [Uri]::EscapeDataString($db["POSTGRES_PASSWORD"])
        $name = [Uri]::EscapeDataString($db["POSTGRES_DB"])

        $url = "postgresql://$($user):$($pass)@127.0.0.1:$($Identity.PgPort)/$($name)?schema=public"

        $jwt = New-Secret 48

        $content = @(
            "NODE_ENV=development",
            "PORT=$($Identity.ApiPort)",
            "DATABASE_URL=$url",
            "REDIS_URL=redis://127.0.0.1:$($Identity.RedisPort)",
            "JWT_ACCESS_SECRET=$jwt",
            "MFA_ENCRYPTION_KEY=$(New-Secret 32)",
            "CORS_ORIGINS=http://localhost:$($Identity.WebPort)",
            "TRUST_PROXY_HOPS=0",
            "UPLOAD_DIR=./uploads",
            "LOG_LEVEL=info",
            "JSON_BODY_LIMIT=1mb",
            "SHUTDOWN_TIMEOUT_MS=10000"
        ) -join "`r`n"

        Save-New $apiEnv ($content + "`r`n")
        Write-Host "API 환경설정 생성 완료" -ForegroundColor Green
    }

    $api = Read-Env $apiEnv

    Require-Env $api @(
        "DATABASE_URL",
        "REDIS_URL",
        "JWT_ACCESS_SECRET",
        "CORS_ORIGINS",
        "PORT"
    )

    if ($api["JWT_ACCESS_SECRET"].Length -lt 32) {
        throw "JWT 보안키 길이가 부족합니다."
    }

    $uri = [Uri]$api["DATABASE_URL"]
    $redis = [Uri]$api["REDIS_URL"]

    $credentials = $uri.UserInfo.Split(":",2)

    if ($credentials.Count -ne 2) {
        throw "DB 인증정보 형식이 올바르지 않습니다."
    }

    if (
        $uri.Scheme -ne "postgresql" -or
        $uri.Host -notin @("localhost","127.0.0.1") -or
        $uri.Port -ne [int]$Identity.PgPort -or
        [Uri]::UnescapeDataString($credentials[0]) -cne $db["POSTGRES_USER"] -or
        [Uri]::UnescapeDataString($credentials[1]) -cne $db["POSTGRES_PASSWORD"] -or
        [Uri]::UnescapeDataString($uri.AbsolutePath.Trim("/")) -cne $db["POSTGRES_DB"]
    ) {
        throw "API와 PostgreSQL 연결정보가 일치하지 않습니다."
    }

    if (
        $redis.Scheme -ne "redis" -or
        $redis.Host -notin @("localhost","127.0.0.1") -or
        $redis.Port -ne [int]$Identity.RedisPort
    ) {
        throw "Redis 연결정보가 일치하지 않습니다."
    }

    if (
        [int]$api["PORT"] -ne [int]$Identity.ApiPort -or
        $api["CORS_ORIGINS"] -cne "http://localhost:$($Identity.WebPort)"
    ) {
        throw "API 포트 또는 CORS 설정이 일치하지 않습니다."
    }

    if (!(Test-Path -LiteralPath $webEnv)) {
        Save-New $webEnv (
            "NEXT_PUBLIC_API_URL=http://localhost:$($Identity.ApiPort)/api/v1`r`n"
        )

        Write-Host "WEB 환경설정 생성 완료" -ForegroundColor Green
    }

    $web = Read-Env $webEnv

    Require-Env $web @("NEXT_PUBLIC_API_URL")

    if (
        $web["NEXT_PUBLIC_API_URL"] -cne
        "http://localhost:$($Identity.ApiPort)/api/v1"
    ) {
        throw "WEB API 연결정보가 일치하지 않습니다."
    }

    return $db
}

function Check-ComposeTemplate {

    $composeFile = Join-Path $root "compose.yaml"

    if (!(Test-Path -LiteralPath $composeFile)) {
        throw "compose.yaml 파일이 없습니다."
    }

    $content = [IO.File]::ReadAllText($composeFile)

    if (
        !$content.Contains('127.0.0.1:${POSTGRES_PORT') -or
        !$content.Contains('127.0.0.1:${REDIS_PORT')
    ) {
        throw "Docker 서비스가 로컬 주소에만 연결되도록 설정되어 있지 않습니다."
    }

    if (
        !$content.Contains('postgres:16-alpine') -or
        !$content.Contains('redis:7-alpine')
    ) {
        throw "Docker 서비스 이미지 설정이 예상과 다릅니다."
    }

    if (
        $content -match '(?m)^\s*container_name\s*:' -or
        $content -match '(?m)^\s*network_mode\s*:\s*host\s*$' -or
        $content -match '(?m)^\s*external\s*:\s*true\s*$'
    ) {
        throw "프로젝트 격리를 방해하는 Docker 설정이 있습니다."
    }
}

function Check-GitSecurity {
    $ignore = Join-Path $root ".gitignore"

    if (!(Test-Path -LiteralPath $ignore)) {
        throw ".gitignore 파일이 없습니다."
    }

    $content = [IO.File]::ReadAllText($ignore)

    if ($content -notmatch '(?m)^# SECURE STARTER V4 LOCAL FILES\s*$') {
        $addition = @(
            "",
            "# SECURE STARTER V4 LOCAL FILES",
            "/.env",
            "/apps/api/.env",
            "/apps/web/.env.local",
            "/.starter-state/",
            "/.starter-backups/"
        ) -join "`r`n"

        $backup = Join-Path $stateDir "gitignore-before-v4.bak"

        New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

        if (!(Test-Path -LiteralPath $backup)) {
            Copy-Item -LiteralPath $ignore -Destination $backup
        }

        [IO.File]::AppendAllText($ignore,$addition + "`r`n",$utf8)
    }

    if (
        (Test-Path -LiteralPath (Join-Path $root ".git")) -and
        (Get-Command git.exe -ErrorAction SilentlyContinue)
    ) {
        $tracked = @(
            git.exe -C $root ls-files -- `
                ".env" `
                "apps/api/.env" `
                "apps/web/.env.local"
        )

        if ($LASTEXITCODE -ne 0) {
            throw "Git 보안 검사 실패"
        }

        if ($tracked.Count -gt 0) {
            throw "민감한 환경설정 파일이 Git에 추적되고 있습니다."
        }
    }
}

function Wait-Services($Identity) {

    foreach ($service in @("postgres","redis")) {

        Write-Host (
            "$service 상태 확인"
        ) -ForegroundColor Yellow

        $ids = @(
            & docker.exe ps -aq `
                --filter "label=com.docker.compose.project=$($Identity.Project)" `
                --filter "label=com.docker.compose.service=$service"
        )

        if ($LASTEXITCODE -ne 0) {
            throw "$service 컨테이너 조회 실패"
        }

        $ids = @(
            $ids | Where-Object {
                $_ -match '^[0-9a-f]{12,64}$'
            }
        )

        if ($ids.Count -ne 1) {
            throw "$service 컨테이너 개수 오류"
        }

        $id = [string]$ids[0]

        $healthy = $false

        for ($attempt = 0; $attempt -lt 90; $attempt++) {

            $lines = @(
                & docker.exe inspect $id
            )

            if ($LASTEXITCODE -ne 0) {
                throw "$service 상태 조회 실패"
            }

            $raw = $lines -join "`n"

            $parsed = ConvertFrom-Json -InputObject $raw

            if ($parsed -is [array]) {

                if ($parsed.Count -ne 1) {
                    throw "$service Docker 응답 오류"
                }

                $container = $parsed[0]

            }
            else {

                $container = $parsed
            }

            $labels = $container.Config.Labels

            if (
                [string]$labels.'com.docker.compose.project' -cne
                    [string]$Identity.Project
            ) {
                throw "$service 프로젝트 소유권 불일치"
            }

            if (
                [string]$labels.'com.docker.compose.service' -cne
                    $service
            ) {
                throw "$service 서비스 소유권 불일치"
            }

            $status = [string]$container.State.Status

            if ($status -in @("exited","dead")) {
                throw "$service 컨테이너 종료됨"
            }

            if (!$container.State.Health) {
                throw "$service HEALTHCHECK 설정 없음"
            }

            $health = [string]$container.State.Health.Status

            if (
                $status -eq "running" -and
                $health -eq "healthy"
            ) {

                $healthy = $true
                break
            }

            Start-Sleep -Seconds 2
        }

        if (!$healthy) {
            throw "$service HEALTHCHECK 시간 초과"
        }

        Write-Host (
            "$service HEALTHY"
        ) -ForegroundColor Green
    }
}

function Test-Http([string]$Url) {
    try {
        $response = Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -TimeoutSec 3

        return ($response.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

function Get-ProcessStamp([int]$ProcessId) {
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return $process.StartTime.ToUniversalTime().ToString("o")
    }
    catch {
        return $null
    }
}

function Test-OwnedProcess($Entry) {

    if (!$Entry) {
        return $false
    }

    $name = [string]$Entry.name

    if ($name -notin @("api","web","collector")) {
        return $false
    }

    $idText = [string]$Entry.pid

    if ($idText -notmatch '^[1-9][0-9]{0,9}$') {
        return $false
    }

    $processId = [int]$idText

    $stamp = Get-ProcessStamp $processId

    if (!$stamp) {
        return $false
    }

    $recordedStamp = if ($Entry.started -is [DateTime]) { $Entry.started.ToUniversalTime().ToString('o') } else { [string]$Entry.started }
    if ($stamp -cne $recordedStamp) {
        return $false
    }

    $process = Get-CimInstance Win32_Process `
        -Filter "ProcessId=$processId" `
        -ErrorAction SilentlyContinue

    if (!$process) {
        return $false
    }

    # 신규 V5 직접 실행 방식

    if ([string]$Entry.mode -eq "node-v2") {

        $node = Get-Command node.exe `
            -ErrorAction SilentlyContinue

        if (!$node) {
            return $false
        }

        if (![string]::Equals(
            [string]$process.ExecutablePath,
            [string]$node.Source,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            return $false
        }

        $script = [string]$Entry.script
        if ($name -eq "collector") {
            $expectedCollector = Join-Path $root "tools\monitoring\collector.mjs"
            $expectedCommand = '"' + $expectedCollector + '" --local --api-port ' + [string]$Entry.apiPort + ' --web-port ' + [string]$Entry.webPort
            return (
                [string]::Equals($script, $expectedCollector, [StringComparison]::OrdinalIgnoreCase) -and
                ([string]$process.CommandLine).TrimEnd().EndsWith($expectedCommand, [StringComparison]::OrdinalIgnoreCase)
            )
        }

        $allowed = if ($name -eq "api") {

            @(
                (Join-Path $root "node_modules\tsx\dist\cli.mjs"),
                (Join-Path $root "apps\api\node_modules\tsx\dist\cli.mjs")
            )

        }
        else {

            @(
                (Join-Path $root "node_modules\next\dist\bin\next"),
                (Join-Path $root "apps\web\node_modules\next\dist\bin\next")
            )
        }

        $validScript = $false

        foreach ($candidate in $allowed) {

            if ([string]::Equals(
                $script,
                $candidate,
                [StringComparison]::OrdinalIgnoreCase
            )) {

                $validScript = $true
                break
            }
        }

        if (!$validScript) {
            return $false
        }

        $commandLine = [string]$process.CommandLine

        $quotedScript = '"' + $script + '"'

        if (
            $commandLine.IndexOf(
                $quotedScript,
                [StringComparison]::OrdinalIgnoreCase
            ) -lt 0
        ) {
            return $false
        }

        if ($name -eq "api") {

            return (
                $commandLine -match
                'watch\s+src/bootstrap/server\.ts(?:\s|$)'
            )
        }

        $expectedPort = [string]$Entry.port

        $pattern = (
            'dev\s+-p\s+' +
            [regex]::Escape($expectedPort) +
            '\s+-H\s+127\.0\.0\.1(?:\s|$)'
        )

        return ($commandLine -match $pattern)
    }

    # 구형 cmd/npm 명령 문자열은 다른 프로젝트와 같을 수 있습니다.
    # 절대 실행 경로를 증명할 수 없는 구형/알 수 없는 모드는 자동 종료하지 않습니다.
    return $false
}

# ============================================================
# 지정 포트가 해당 서버 프로세스 또는 자식 프로세스에
# 연결되어 있는지 확인합니다.
# ============================================================

function Test-OwnedListener(
    [int]$Port,
    $Entry
) {

    if (!(Test-OwnedProcess $Entry)) {
        return $false
    }

    $listeners = @(
        Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.LocalAddress -eq "127.0.0.1"
            }
    )

    # 일부 Windows 루프백 환경은 LISTEN 행을 누락합니다. 직접 연 연결의
    # 정확한 양쪽 포트에 해당하는 서버 PID만 후보로 사용합니다.
    $probe = $null
    if ($listeners.Count -eq 0) {
        try {
            $probe = New-Object Net.Sockets.TcpClient
            $connect = $probe.ConnectAsync("127.0.0.1", $Port)
            if (!$connect.Wait(1000) -or !$probe.Connected) { $probe.Dispose(); return $false }
            $clientPort = $probe.Client.LocalEndPoint.Port
            $listeners = @(Get-NetTCPConnection -LocalPort $Port -RemotePort $clientPort -State Established -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.RemoteAddress -eq '127.0.0.1' })
        }
        catch { if ($probe) { $probe.Dispose() }; return $false }
    }

    try {

    foreach ($listener in $listeners) {

        $currentId = [int]$listener.OwningProcess

        for ($depth=0; $depth -lt 20; $depth++) {

            if ($currentId -eq [int]$Entry.pid) {
                return $true
            }

            $process = Get-CimInstance Win32_Process `
                -Filter "ProcessId=$currentId" `
                -ErrorAction SilentlyContinue

            if (!$process) {
                break
            }

            $parentId = [int]$process.ParentProcessId
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$parentId" -ErrorAction SilentlyContinue
            # 부모 PID 재사용으로 무관한 프로세스에 이어지는 계보를 거부합니다.
            if (!$parent -or $parent.CreationDate -gt $process.CreationDate) { break }

            if (
                $parentId -le 0 -or
                $parentId -eq $currentId
            ) {
                break
            }

            $currentId = $parentId
        }
    }

    return $false
    }
    finally { if ($probe) { $probe.Dispose() } }
}

function Save-Runtime($State) {
    $temp = $runtimeFile + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($temp, ($State | ConvertTo-Json -Depth 6), $utf8)
    try {
        if ([IO.File]::Exists($runtimeFile)) { [IO.File]::Replace($temp,$runtimeFile,($runtimeFile+'.previous')) }
        else { [IO.File]::Move($temp,$runtimeFile) }
    }
    finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
}

function Test-TcpOpen([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $task = $client.ConnectAsync('127.0.0.1',$Port); return ($task.Wait(1000) -and $client.Connected) }
    catch { return $false }
    finally { $client.Dispose() }
}

function Enter-LifecycleLock {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-','') }
    finally { $hash.Dispose() }
    $mutex = New-Object Threading.Mutex($false,('Local\CTFarmLifecycle_'+$key))
    try { $acquired = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (!$acquired) { $mutex.Dispose(); throw '다른 실행·종료 작업이 진행 중입니다. 완료 후 STATUS를 확인하세요.' }
    return $mutex
}

# ============================================================
# 검증된 서버 프로세스만 종료합니다.
# ============================================================

function Stop-VerifiedEntry($Entry) {

    if (!$Entry) {
        return
    }

    $processId = [int]$Entry.pid

    if (!(Get-ProcessStamp $processId)) {
        return
    }

    if (!(Test-OwnedProcess $Entry)) {
        throw "프로세스 소유권 검증 실패: $processId"
    }

    & taskkill.exe `
        /PID $processId `
        /T `
        /F | Out-Null

    $exitCode = $LASTEXITCODE

    Start-Sleep -Milliseconds 500

    if (
        $exitCode -ne 0 -and
        (Get-ProcessStamp $processId)
    ) {
        throw "프로세스 종료 실패: $processId"
    }

    if (Get-ProcessStamp $processId) {
        throw "프로세스가 종료되지 않았습니다: $processId"
    }
}

function Stop-OwnedProcesses {

    if (!(Test-Path -LiteralPath $runtimeFile)) {
        return
    }

    $state = Get-Content `
        -LiteralPath $runtimeFile `
        -Raw |
        ConvertFrom-Json

    $entries = @(
        $state.api,
        $state.web,
        $state.collector
    )

    # 모든 살아 있는 프로세스의 소유권을
    # 먼저 검증합니다.

    foreach ($entry in $entries) {

        if (!$entry) {
            continue
        }

        $processId = [int]$entry.pid

        if (!(Get-ProcessStamp $processId)) {
            continue
        }

        if (!(Test-OwnedProcess $entry)) {
            throw "다른 프로세스일 가능성이 있어 종료하지 않습니다."
        }
    }

    # WEB부터 종료합니다.

    Stop-VerifiedEntry $state.collector
    Stop-VerifiedEntry $state.web

    # API를 종료합니다.

    Stop-VerifiedEntry $state.api

    Start-Sleep -Seconds 1

    # 기존 서버 포트가 실제로 해제되었는지 확인합니다.

    $identity = Get-Identity

    foreach ($port in @(
        [int]$identity.ApiPort,
        [int]$identity.WebPort
    )) {

        $listeners = @(
            Get-NetTCPConnection `
                -LocalPort $port `
                -State Listen `
                -ErrorAction SilentlyContinue
        )

        if ($listeners.Count -gt 0) {

            throw (
                "서버 종료 후에도 포트가 사용 중입니다: " +
                $port +
                ". 실행 기록을 보존합니다."
            )
        }
    }

    Remove-Item `
        -LiteralPath $runtimeFile `
        -Force `
        -ErrorAction Stop

    Write-Host "서버 프로세스 종료 확인" -ForegroundColor Green
}

function Do-Setup {

    Step "SECURE STARTER V6 - 안전한 설치"

    Ensure-Node
    Ensure-Docker

    Check-ComposeTemplate
    Check-GitSecurity

    $identity = Ensure-Identity

    $db = Ensure-Environment $identity

    # V5의 최초 설치가 완료되지 않았을 때만
    # 일부 생성된 Docker 리소스의 재사용을 허용합니다.

    $allowResume = (
        $identity.Version -eq 5 -and
        !$identity.MigrationCompleted
    )

    $complete = Verify-Ownership `
        $identity `
        $db `
        $allowResume

    $ownedBefore = @(Get-OwnedContainers $identity)
    $volumesBefore = @(Get-Volumes)

    $pgVolume = $identity.Project + "_postgres_data"
    $redisVolume = $identity.Project + "_redis_data"

    $hadResources = (
        $ownedBefore.Count -gt 0 -or
        $volumesBefore -contains $pgVolume -or
        $volumesBefore -contains $redisVolume
    )

    # 기존에 설치가 완료된 DB가 사라진 경우
    # 새로운 DB를 자동 생성하지 않습니다.

    if (
        $identity.MigrationCompleted -and
        !$complete
    ) {
        throw (
            "설치 완료 기록은 있지만 기존 DB가 없습니다. " +
            "자동 재초기화를 차단합니다."
        )
    }

    # V4 설치 기록은 중간 단계 복구를 지원하지 않습니다.

    if (
        $identity.Version -eq 4 -and
        !$identity.MigrationCompleted -and
        $hadResources
    ) {
        throw (
            "V4 설치가 완료되지 않은 기존 DB가 있습니다. " +
            "자동 마이그레이션을 차단합니다."
        )
    }

    Step "Docker Compose 설정 검증"

    Compose $identity @(
        "config",
        "--quiet"
    )

    Step "Node.js 패키지 설치"

    Run "npm.cmd" @(
        "ci"
    )

    Step "Prisma Client 생성"

    Run "npm.cmd" @(
        "run",
        "db:generate"
    )

    Step "PostgreSQL 및 Redis 실행"

    # --no-recreate:
    # 기존 컨테이너를 임의로 재생성하지 않습니다.

    Compose $identity @(
        "up",
        "-d",
        "--no-recreate",
        "postgres",
        "redis"
    )

    Wait-Services $identity

    if (!(Verify-Ownership $identity $db $false)) {
        throw "Docker 서비스 생성 후 소유권 검증 실패"
    }

    if (!$identity.MigrationCompleted) {

        Step "신규 데이터베이스 마이그레이션"

        # Prisma migrate deploy는 적용된 마이그레이션을
        # 다시 실행하지 않습니다.
        #
        # 실패한 마이그레이션이 존재하면 Prisma가
        # 오류를 반환하므로 임의 초기화하지 않습니다.

        Run "npm.cmd" @(
            "run",
            "db:deploy"
        )

        Step "마이그레이션 결과 확인"

        Run "npm.cmd" @(
            "exec",
            "-w",
            "@starter/api",
            "--",
            "prisma",
            "migrate",
            "status"
        )

        # 마이그레이션과 상태 검증이 모두 성공한 후에만
        # 완료 기록을 저장합니다.

        $identity.MigrationCompleted = $true

        Save-Identity $identity

        Write-Host (
            "데이터베이스 최초 설치 완료"
        ) -ForegroundColor Green

    }
    else {

        Step "기존 데이터베이스 보호"

        Write-Host (
            "기존 DB 자동 마이그레이션 생략"
        ) -ForegroundColor Green

        Run "npm.cmd" @(
            "exec",
            "-w",
            "@starter/api",
            "--",
            "prisma",
            "migrate",
            "status"
        )
    }

    Step "프로젝트 빌드"

    Run "npm.cmd" @(
        "run",
        "build"
    )

    Step "SECURE STARTER 설치 완료"

    Write-Host ""
    Write-Host "프로젝트: $($identity.Project)" -ForegroundColor Green

    Write-Host (
        "WEB: http://localhost:$($identity.WebPort)/starter"
    )

    Write-Host (
        "API: http://localhost:$($identity.ApiPort)/health"
    )

    Write-Host ""
    Write-Host "SECURE-LIFECYCLE.ps1 -Action STARTER를 실행하세요." -ForegroundColor Green
}

function Get-LocalWebUrl($Identity) {
    # 쿠키는 포트가 아니라 호스트에 묶입니다. API와 다른 localhost/127 호스트로 열지 않습니다.
    $webConfig = Read-Env (Join-Path $root "apps\web\.env.local")
    $publicApi = $webConfig["NEXT_PUBLIC_API_BASE_URL"]
    if (!$publicApi) { $publicApi = $webConfig["NEXT_PUBLIC_API_URL"] }
    $webHost = "127.0.0.1"
    if ($publicApi -and $publicApi -ne "same-origin") {
        $apiAddress = $null
        if (![Uri]::TryCreate($publicApi,[UriKind]::Absolute,[ref]$apiAddress) -or
            $apiAddress.Host -notin @("localhost","127.0.0.1") -or
            $apiAddress.Port -ne [int]$Identity.ApiPort) {
            throw "로컬 공개 API 주소와 프로젝트 포트를 확인하세요."
        }
        $webHost = $apiAddress.Host
    }
    return "http://$($webHost):$($Identity.WebPort)/starter"
}

function Do-Start {

    Step "SECURE STARTER V6 - 서버 시작"
    # 이 명령은 LOCAL 개발 서버입니다. 부모 테스트/배포 모드를 자식에 전파하지 않습니다.
    $env:NODE_ENV = 'development'

    Ensure-Node
    Ensure-Docker

    $identity = Get-Identity

    if (!$identity -or !$identity.MigrationCompleted) {
        throw "설치가 완료되지 않았습니다. SECURE-LIFECYCLE.ps1 -Action SETUP를 먼저 실행하세요."
    }

    $db = Ensure-Environment $identity

    if (!(Verify-Ownership $identity $db)) {
        throw "Docker 리소스 소유권 검증 실패"
    }

    $apiUrl = "http://127.0.0.1:$($identity.ApiPort)/health/ready"

    $webUrl = Get-LocalWebUrl $identity

    # --------------------------------------------------------
    # 기존 서버 확인
    # --------------------------------------------------------

    if (Test-Path -LiteralPath $runtimeFile) {

        $state = Get-Content `
            -LiteralPath $runtimeFile `
            -Raw |
            ConvertFrom-Json

        if ($state.project -cne $identity.Project -or ![string]::Equals([string]$state.root,$root,[StringComparison]::OrdinalIgnoreCase)) {
            throw '실행 기록의 프로젝트 또는 경로가 달라 중단합니다.'
        }

        if (
            (Test-OwnedProcess $state.api) -and
            (Test-OwnedProcess $state.web) -and
            (Test-OwnedListener ([int]$identity.ApiPort) $state.api) -and
            (Test-OwnedListener ([int]$identity.WebPort) $state.web) -and
            (Test-Http $apiUrl) -and
            (Test-Http $webUrl)
        ) {

            Write-Host "이미 정상 실행 중입니다." -ForegroundColor Green
            if (!(Test-OwnedProcess $state.collector)) {
                Write-Host "수집기 미실행: STOP 후 STARTER로 다시 시작하면 자동 연결됩니다." -ForegroundColor Yellow
            }

            if ($env:SECURE_STARTER_NO_BROWSER -ne "1") {
                Start-Process $webUrl
            }

            return
        }

        $liveEntries = @(@($state.api,$state.web,$state.collector) | Where-Object { $_ -and (Get-ProcessStamp ([int]$_.pid)) })
        if ($liveEntries.Count -eq 0 -and !(Test-TcpOpen ([int]$identity.ApiPort)) -and !(Test-TcpOpen ([int]$identity.WebPort))) {
            Move-Item -LiteralPath $runtimeFile -Destination ($runtimeFile+'.stale.'+[Guid]::NewGuid().ToString('N'))
            Write-Host '종료된 실행 기록은 보관하고 새 실행을 시작합니다.' -ForegroundColor Yellow
        } else {
            throw '부분 실행 또는 소유권을 확인할 수 없는 실행 기록입니다. STATUS/DIAGNOSE를 확인하세요. 다른 프로세스를 자동 종료하지 않습니다.'
        }
    }

    # --------------------------------------------------------
    # 포트 충돌 확인
    # --------------------------------------------------------

    foreach ($port in @(
        [int]$identity.ApiPort,
        [int]$identity.WebPort
    )) {

        $listeners = @(
            Get-NetTCPConnection `
                -LocalPort $port `
                -State Listen `
                -ErrorAction SilentlyContinue
        )

        if ($listeners.Count -gt 0 -or (Test-TcpOpen $port)) {
            throw "서버 포트가 이미 사용 중입니다: $port"
        }
    }

    # --------------------------------------------------------
    # Node.js 실행 파일 확인
    # --------------------------------------------------------

    $node = Get-Command node.exe `
        -ErrorAction Stop

    $nodePath = [string]$node.Source

    # --------------------------------------------------------
    # API 개발 서버 실행 파일
    # --------------------------------------------------------

    $apiCandidates = @(
        (Join-Path $root "node_modules\tsx\dist\cli.mjs"),
        (Join-Path $root "apps\api\node_modules\tsx\dist\cli.mjs")
    )

    $apiCli = $null

    foreach ($candidate in $apiCandidates) {

        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $apiCli = $candidate
            break
        }
    }

    if (!$apiCli) {
        throw "tsx 실행 파일이 없습니다. SECURE-LIFECYCLE.ps1 -Action SETUP를 실행하세요."
    }

    # --------------------------------------------------------
    # WEB 개발 서버 실행 파일
    # --------------------------------------------------------

    $webCandidates = @(
        (Join-Path $root "node_modules\next\dist\bin\next"),
        (Join-Path $root "apps\web\node_modules\next\dist\bin\next")
    )

    $webCli = $null

    foreach ($candidate in $webCandidates) {

        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $webCli = $candidate
            break
        }
    }

    if (!$webCli) {
        throw "Next.js 실행 파일이 없습니다. SECURE-LIFECYCLE.ps1 -Action SETUP를 실행하세요."
    }

    # --------------------------------------------------------
    # Docker 서비스 실행
    # --------------------------------------------------------

    Compose $identity @(
        "up",
        "-d",
        "--no-recreate",
        "postgres",
        "redis"
    )

    Wait-Services $identity

    # --------------------------------------------------------
    # 서버 실행
    # --------------------------------------------------------

    New-Item `
        -ItemType Directory `
        -Path $stateDir `
        -Force | Out-Null

    $apiEntry = $null
    $webEntry = $null
    $collectorEntry = $null

    # 이전 실패 로그를 새 시작의 리다이렉트로 덮어쓰지 않습니다.
    $history = Join-Path $stateDir ('log-history\' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff'))
    New-Item -ItemType Directory -Path $history -Force | Out-Null
    foreach ($logName in @('api.log','api-error.log','web.log','web-error.log','collector.log','collector-error.log')) {
        $logPath = Join-Path $stateDir $logName
        if (Test-Path -LiteralPath $logPath -PathType Leaf) { Copy-Item -LiteralPath $logPath -Destination (Join-Path $history $logName) }
    }

    try {

        Write-Host "API 서버 시작" -ForegroundColor Yellow

        $apiArguments = (
            '"' + $apiCli + '"' +
            " watch src/bootstrap/server.ts"
        )

        $apiProcess = Start-Process `
            -FilePath $nodePath `
            -ArgumentList $apiArguments `
            -WorkingDirectory (Join-Path $root "apps\api") `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $stateDir "api.log") `
            -RedirectStandardError (Join-Path $stateDir "api-error.log") `
            -PassThru

        $apiEntry = [pscustomobject]@{
            name = "api"
            mode = "node-v2"
            pid = $apiProcess.Id
            started = Get-ProcessStamp $apiProcess.Id
            script = $apiCli
            port = [int]$identity.ApiPort
        }

        if (!$apiEntry.started) {
            throw "API 프로세스 시작 확인 실패"
        }

        # API만 시작된 상태도 기록합니다.

        $state = [pscustomobject]@{
            version = 2
            project = $identity.Project
            root = $root
            api = $apiEntry
            web = $null
            collector = $null
        }

        Save-Runtime $state

        Write-Host "WEB 서버 시작" -ForegroundColor Yellow

        # 숨김 실행은 사용자 입력을 받지 않습니다. Windows 콘솔 입력 핸들 상속을
        # 피하도록 명시적 EOF를 제공합니다(Next CLI의 stdin/TTY 확인 포함).
        $webInput = Join-Path $stateDir 'web-stdin.empty'
        if (!(Test-Path -LiteralPath $webInput)) { Save-New $webInput '' }
        $inputItem = Get-Item -LiteralPath $webInput -Force
        if ($inputItem.Length -ne 0 -or ($inputItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw '웹 표준 입력 파일은 비어 있는 일반 파일이어야 합니다.'
        }

        $webArguments = (
            '--require "' + (Join-Path $root 'tools\monitoring\web-http.cjs') + '" "' + $webCli + '"' +
            " dev -p $($identity.WebPort) -H 127.0.0.1"
        )

        $webProcess = Start-Process `
            -FilePath $nodePath `
            -ArgumentList $webArguments `
            -WorkingDirectory (Join-Path $root "apps\web") `
            -WindowStyle Hidden `
            -RedirectStandardInput $webInput `
            -RedirectStandardOutput (Join-Path $stateDir "web.log") `
            -RedirectStandardError (Join-Path $stateDir "web-error.log") `
            -PassThru

        $webEntry = [pscustomobject]@{
            name = "web"
            mode = "node-v2"
            pid = $webProcess.Id
            started = Get-ProcessStamp $webProcess.Id
            script = $webCli
            port = [int]$identity.WebPort
        }

        if (!$webEntry.started) {
            throw "WEB 프로세스 시작 확인 실패"
        }

        $state.web = $webEntry

        Save-Runtime $state

        # 독립 수집기: API/WEB와 별도 프로세스로 실행합니다.
        $collectorScript = Join-Path $root "tools\monitoring\collector.mjs"
        $collectorArguments = '"' + $collectorScript + '" --local --api-port ' + $identity.ApiPort + ' --web-port ' + $identity.WebPort
        $collectorProcess = Start-Process -FilePath $nodePath -ArgumentList $collectorArguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir "collector.log") -RedirectStandardError (Join-Path $stateDir "collector-error.log") -PassThru
        $collectorEntry = [pscustomobject]@{
            name = "collector"; mode = "node-v2"; pid = $collectorProcess.Id
            started = Get-ProcessStamp $collectorProcess.Id; script = $collectorScript
            apiPort = [int]$identity.ApiPort; webPort = [int]$identity.WebPort
        }
        if (!$collectorEntry.started) { throw "수집기 시작 확인 실패" }
        $state.collector = $collectorEntry
        Save-Runtime $state

        # ----------------------------------------------------
        # 서버 준비 확인
        # ----------------------------------------------------

        $ready = $false

        $deadline = [DateTime]::UtcNow.AddSeconds(180)
        for ($attempt=0; [DateTime]::UtcNow -lt $deadline; $attempt++) {

            Start-Sleep -Seconds 2

            if (
                !(Test-OwnedProcess $apiEntry) -or
                !(Test-OwnedProcess $webEntry)
            ) {
                throw "API/WEB 프로세스 소유권 또는 실행 상태 확인 실패. 로그: .starter-state/api-error.log, web-error.log"
            }

            if (
                (Test-OwnedListener ([int]$identity.ApiPort) $apiEntry) -and
                (Test-OwnedListener ([int]$identity.WebPort) $webEntry) -and
                (Test-Http $apiUrl) -and
                (Test-Http $webUrl)
            ) {

                $ready = $true
                break
            }
        }

        if (!$ready) {
            throw "서버 준비 시간 초과: API=$(Test-Http $apiUrl), WEB=$(Test-Http $webUrl). 소유권/포트는 STATUS로 확인하세요. 로그: .starter-state/api.log, api-error.log, web.log, web-error.log"
        }

        Step "서버 실행 완료"

        if (Test-Http "http://127.0.0.1:4310/") {
            Write-Host "개발자 포털 응답 있음: http://127.0.0.1:4310 (접근키 인증은 별도)" -ForegroundColor Green
        } else {
            Write-Host "개발자 포털 미실행: 별도 터미널에서 문서의 포털 실행 절차를 따르세요. 로그는 계속 보관됩니다." -ForegroundColor Yellow
        }
        Write-Host "API: $apiUrl" -ForegroundColor Green
        Write-Host "WEB: $webUrl" -ForegroundColor Green

        if ($env:SECURE_STARTER_NO_BROWSER -ne "1") {
            Start-Process $webUrl
        }

    }
    catch {

        $failure = $_.Exception.Message

        Write-Host "서버 시작 실패: $failure" -ForegroundColor Red

        $cleanupErrors = @()

        foreach ($entry in @($collectorEntry,$webEntry,$apiEntry)) {

            if (!$entry) {
                continue
            }

            try {
                Stop-VerifiedEntry $entry
            }
            catch {
                $cleanupErrors += $_.Exception.Message
            }
        }

        if ($cleanupErrors.Count -eq 0) {

            foreach ($port in @(
                [int]$identity.ApiPort,
                [int]$identity.WebPort
            )) {

                $listeners = @(
                    Get-NetTCPConnection `
                        -LocalPort $port `
                        -State Listen `
                        -ErrorAction SilentlyContinue
                )

                if ($listeners.Count -gt 0) {
                    $cleanupErrors += "포트 $port 점유가 남아 있습니다."
                }
            }
        }

        if ($cleanupErrors.Count -eq 0) {

            if (Test-Path -LiteralPath $runtimeFile) {

                Remove-Item `
                    -LiteralPath $runtimeFile `
                    -Force
            }

            throw $failure
        }

        throw (
            $failure +
            " / 자동 정리 미완료: " +
            ($cleanupErrors -join "; ")
        )
    }
}

function Show-Status {
    Step "CT-Farm 서비스 상태 (조회 전용)"
    $identity = Get-Identity
    if (!$identity) { throw "프로젝트 설치 식별자가 없습니다." }
    Write-Host "프로젝트: $($identity.Project)"
    $state = $null
    if (Test-Path -LiteralPath $runtimeFile) {
        $state = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
    }
    foreach ($name in @("api","web","collector")) {
        $entry = if ($state) { $state.$name } else { $null }
        $owned = Test-OwnedProcess $entry
        Write-Host "$name 실행 기록 소유권 확인: $owned"
    }
    foreach ($item in @(
        @{Name="PostgreSQL";Port=[int]$identity.PgPort},
        @{Name="Redis";Port=[int]$identity.RedisPort},
        @{Name="API";Port=[int]$identity.ApiPort},
        @{Name="WEB";Port=[int]$identity.WebPort}
    )) {
        $listeners = @(Get-NetTCPConnection -LocalPort $item.Port -State Listen -ErrorAction SilentlyContinue)
        Write-Host "$($item.Name) 포트 $($item.Port): TCP연결=$((Test-TcpOpen $item.Port)), LISTEN조회=$($listeners.Count -gt 0)"
    }
    Write-Host "API readiness: $(Test-Http ('http://127.0.0.1:' + $identity.ApiPort + '/health/ready'))"
    Write-Host "WEB 응답: $(Test-Http ('http://127.0.0.1:' + $identity.WebPort + '/starter'))"
    if ((Get-Command docker.exe -ErrorAction SilentlyContinue) -and (Docker-Ready)) {
        foreach ($container in @(Get-OwnedContainers $identity)) {
            $service = [string]$container.Config.Labels.'com.docker.compose.service'
            if ($service -in @("postgres","redis")) {
                Write-Host "Docker $service : $($container.State.Status)"
            }
        }
    } else { Write-Host "Docker 엔진 연결 불가" -ForegroundColor Yellow }
    if (!$state) { Write-Host "런처 실행 기록 없음: 수동 서버는 자동 종료하거나 인수하지 않습니다." -ForegroundColor Yellow }
}

function Show-Diagnosis {
    Show-Status
    Step "진단: 비밀정보를 제외한 로그 요약"
    foreach ($name in @("api.log","api-error.log","web.log","web-error.log","collector.log","collector-error.log")) {
        $file = Join-Path $stateDir $name
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) { continue }
        Write-Host "로그 위치: $file"
        # 자유 텍스트·예외·환경값은 출력하지 않고 허용된 숫자 필드만 표시합니다.
        foreach ($line in @(Get-Content -LiteralPath $file -Tail 10)) {
            try {
                $event = $line | ConvertFrom-Json -ErrorAction Stop
                $safe = [ordered]@{}
                foreach ($field in @("time","level","statusCode","port")) {
                    $number = 0.0
                    if ([double]::TryParse([string]$event.$field,[ref]$number)) { $safe[$field] = $number }
                }
                if ($safe.Count -gt 0) { Write-Host ($safe | ConvertTo-Json -Compress) }
            } catch { Write-Host "비구조화 로그: 비밀정보 보호를 위해 원문 생략" }
        }
    }
    Write-Host "readiness=false이면 Docker 서비스와 설정 대상 포트를 확인하세요."
    Write-Host "수신=true인데 소유권=false이면 수동 실행 또는 다른 프로세스입니다. 강제 종료하지 않습니다."
    Write-Host "DB reset, volume 삭제 또는 환경파일 재생성으로 복구하지 마세요."
}

function Assert-ManagedListeners($Identity) {
    $state = $null
    if (Test-Path -LiteralPath $runtimeFile) {
        $state = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
        if ($state.project -cne $Identity.Project -or
            ![string]::Equals([string]$state.root,$root,[StringComparison]::OrdinalIgnoreCase)) {
            throw "실행 기록의 프로젝트 또는 경로가 달라 중단합니다."
        }
    }
    foreach ($name in @("api","web")) {
        $port = if ($name -eq "api") { [int]$Identity.ApiPort } else { [int]$Identity.WebPort }
        $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -eq 0 -and !(Test-TcpOpen $port)) { continue }
        $entry = if ($state) { $state.$name } else { $null }
        if (!(Test-OwnedProcess $entry) -or !(Test-OwnedListener $port $entry)) {
            throw "포트 $port 프로세스 소유권 확인 불가: DB와 다른 프로세스를 종료하지 않습니다."
        }
    }
}

function Do-Stop {
    Step "SECURE STARTER V6 - 서버 종료"

    $identity = Get-Identity

    if (!$identity) {
        throw "프로젝트 설치 식별자가 없습니다."
    }

    Assert-ManagedListeners $identity
    Stop-OwnedProcesses

    if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
        if (Docker-Ready) {
            $db = Ensure-Environment $identity

            if (Verify-Ownership $identity $db) {
                Compose $identity @(
                    "stop",
                    "-t","30",
                    "postgres",
                    "redis"
                )
            }
        }
    }

    Step "종료 완료"

    Write-Host "해당 프로젝트의 서버만 종료했습니다." -ForegroundColor Green
    Write-Host "데이터베이스와 Docker 볼륨은 유지됩니다."
}

$controlLock = $null
try {
    if ($Action -notin @('STATUS','DIAGNOSE')) { $controlLock = Enter-LifecycleLock }
    switch ($Action) {
        "SETUP"   { Do-Setup }
        "STARTER" { Do-Start }
        "START"   { Do-Start }
        "STOP"    { Do-Stop }
        "STATUS"  { Show-Status }
        "DIAGNOSE" { Show-Diagnosis }
        "RESTART" { Do-Stop; Do-Start }
    }

    exit 0
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host " $Action 실행 실패" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red

    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "기존 Docker 볼륨 삭제 명령은 실행하지 않았습니다."

    exit 1
}
finally {
    if ($controlLock) { $controlLock.ReleaseMutex(); $controlLock.Dispose() }
}

