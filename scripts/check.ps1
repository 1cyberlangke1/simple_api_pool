[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
chcp 65001 > $null

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = if (Test-Path (Join-Path $repoRoot 'src\backend\go.mod')) { Join-Path $repoRoot 'src\backend' } else { Join-Path $repoRoot 'backend' }
$frontendDir = if (Test-Path (Join-Path $repoRoot 'src\frontend\src\index.template.html')) { Join-Path $repoRoot 'src\frontend' } else { Join-Path $repoRoot 'frontend' }
$logDir = Join-Path $repoRoot 'local-logs'

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$frontendBuildLog = Join-Path $logDir "check-frontend-build-$timestamp.txt"
$frontendJsLog = Join-Path $logDir "check-frontend-js-$timestamp.txt"
$baseLog = Join-Path $logDir "check-go-test-$timestamp.txt"
$raceLog = Join-Path $logDir "check-go-test-race-$timestamp.txt"
$requiredFrontendFiles = @(
    "index.html",
    "assets\\styles.css",
    "assets\\build-manifest.json",
    "assets\\core.js",
    "assets\\state.js",
    "assets\\i18n.js",
    "assets\\app.js",
    "assets\\features\\providers\\provider_form_state.js",
    "assets\\features\\providers\\provider_events.js",
    "assets\\views\\status_view.js",
    "assets\\views\\logs_view.js",
    "assets\\views\\provider_view.js",
    "assets\\api.js",
    "assets\\actions\\polling_actions.js",
    "assets\\boot.js"
)

Push-Location $repoRoot
try {
    Write-Host "重建前端资源"
    go run .\scripts\build_frontend.go -root . *>&1 | Tee-Object -FilePath $frontendBuildLog
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    foreach ($relativePath in $requiredFrontendFiles) {
        if (!(Test-Path (Join-Path $frontendDir $relativePath))) {
            Write-Error "缺少前端构建产物: $relativePath"
        }
    }

    Write-Host "运行前端脚本语法检查"
    if (Test-Path $frontendJsLog) {
        Remove-Item $frontendJsLog -Force
    }
    $frontendJsFiles = Get-ChildItem (Join-Path $frontendDir 'src'), (Join-Path $frontendDir 'assets') -Recurse -Filter *.js | Sort-Object FullName
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
