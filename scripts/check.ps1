[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
chcp 65001 > $null

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$logDir = Join-Path $repoRoot 'local-logs'

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseLog = Join-Path $logDir "check-go-test-$timestamp.txt"
$raceLog = Join-Path $logDir "check-go-test-race-$timestamp.txt"

Push-Location $backendDir
try {
    Write-Host "运行 go test ./..."
    go test ./... *>&1 | Tee-Object -FilePath $baseLog
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "运行 go test -race ./tests"
    go test -race ./tests *>&1 | Tee-Object -FilePath $raceLog
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "测试通过"
    Write-Host "日志: $baseLog"
    Write-Host "日志: $raceLog"
}
finally {
    Pop-Location
}
