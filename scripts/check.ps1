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
$frontendBuildLog = Join-Path $logDir "check-frontend-build-$timestamp.txt"
$frontendJsLog = Join-Path $logDir "check-frontend-js-$timestamp.txt"
$baseLog = Join-Path $logDir "check-go-test-$timestamp.txt"
$raceLog = Join-Path $logDir "check-go-test-race-$timestamp.txt"

Push-Location $repoRoot
try {
    Write-Host "重建前端资源"
    go run .\scripts\build_frontend.go -root . *>&1 | Tee-Object -FilePath $frontendBuildLog
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "运行前端脚本语法检查"
    if (Test-Path $frontendJsLog) {
        Remove-Item $frontendJsLog -Force
    }
    $frontendJsFiles = Get-ChildItem frontend\src, frontend\assets -Recurse -Filter *.js | Sort-Object FullName
    foreach ($file in $frontendJsFiles) {
        "检查 $($file.FullName)" | Tee-Object -FilePath $frontendJsLog -Append
        node --check $file.FullName *>&1 | Tee-Object -FilePath $frontendJsLog -Append
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

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
    Write-Host "日志: $frontendBuildLog"
    Write-Host "日志: $frontendJsLog"
    Write-Host "日志: $baseLog"
    Write-Host "日志: $raceLog"
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
