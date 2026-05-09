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
    "favicon.svg",
    "build.mjs",
    "package.json",
    "package-lock.json",
    "assets\\app.js",
    "assets\\styles.css",
    "assets\\build-manifest.json"
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
    $frontendJsFiles = @()
    $frontendJsFiles += Get-Item (Join-Path $frontendDir 'build.mjs')
    $frontendJsFiles += Get-ChildItem (Join-Path $frontendDir 'src') -Recurse -Filter *.js
    $frontendJsFiles += Get-Item (Join-Path $frontendDir 'assets\\app.js')
    $frontendJsFiles = $frontendJsFiles | Sort-Object FullName
    foreach ($file in $frontendJsFiles) {
        "检查 $($file.FullName)" | Tee-Object -FilePath $frontendJsLog -Append
        node --check $file.FullName *>&1 | Tee-Object -FilePath $frontendJsLog -Append
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    Push-Location $backendDir
    try {
    if (Test-Path $baseLog) {
        Remove-Item $baseLog -Force
    }
    if (Test-Path $raceLog) {
        Remove-Item $raceLog -Force
    }

    $backendPackages = @(go list ./...)
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $packageStage = "阶段: 后端包测试（非 tests 包）"
    Write-Host $packageStage
    $packageStage | Tee-Object -FilePath $baseLog -Append | Out-Null
    foreach ($packageName in $backendPackages) {
        if ($packageName -eq 'simple-api-pool/tests') {
            continue
        }
        $packageLine = "运行包测试: $packageName"
        Write-Host $packageLine
        $packageLine | Tee-Object -FilePath $baseLog -Append | Out-Null
        go test -count=1 $packageName *>&1 | Tee-Object -FilePath $baseLog -Append
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    $testsStage = "阶段: 集成测试包 ./tests"
    Write-Host $testsStage
    $testsStage | Tee-Object -FilePath $baseLog -Append | Out-Null
    go test -v -count=1 ./tests *>&1 | Tee-Object -FilePath $baseLog -Append
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $raceStage = "阶段: race 集成测试包 ./tests"
    Write-Host $raceStage
    $raceStage | Tee-Object -FilePath $raceLog -Append | Out-Null
    go test -race -v -count=1 ./tests *>&1 | Tee-Object -FilePath $raceLog -Append
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
