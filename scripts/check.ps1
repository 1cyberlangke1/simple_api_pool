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
$frontendTypecheckLog = Join-Path $logDir "check-frontend-typecheck-$timestamp.txt"
$frontendTestLog = Join-Path $logDir "check-frontend-test-$timestamp.txt"
$baseLog = Join-Path $logDir "check-go-test-$timestamp.txt"
$raceLog = Join-Path $logDir "check-go-test-race-$timestamp.txt"
$goTestTimeout = if ($env:CHECK_GO_TEST_TIMEOUT) { $env:CHECK_GO_TEST_TIMEOUT } else { '30m' }
$goRaceTimeout = if ($env:CHECK_GO_RACE_TIMEOUT) { $env:CHECK_GO_RACE_TIMEOUT } else { '45m' }
$slowFrontendBuildTests = @(
    "TestFrontendBuildFailsWhenTemplateReferencesMissingGeneratedAsset",
    "TestFrontendBuildFailsWhenGeneratedOutputRetainsBuildPlaceholder",
    "TestFrontendBuildWritesManifestWithDetectedLayoutAndAssets",
    "TestFrontendBuildRemovesStaleGeneratedAssets",
    "TestFrontendBuildChangesAssetVersionWhenBuildTimeChanges"
)
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
function Get-CleanFrontendOutputs {
    param(
        [string]$RepoRoot,
        [string[]]$RelativePaths
    )

    $cleanPaths = @()
    foreach ($relativePath in $RelativePaths) {
        & git -C $RepoRoot diff --quiet -- $relativePath
        if ($LASTEXITCODE -eq 0) {
            $cleanPaths += $relativePath
        }
    }
    return $cleanPaths
}

function Restore-FrontendOutputs {
    param(
        [string]$RepoRoot,
        [string[]]$RelativePaths
    )

    if (!$RelativePaths -or $RelativePaths.Count -eq 0) {
        return
    }

    & git -C $RepoRoot restore --source=HEAD --worktree -- @RelativePaths
    if ($LASTEXITCODE -ne 0) {
        Write-Warning ("还原前端产物失败: " + ($RelativePaths -join ", "))
    }
}

function Start-LoggedProcessJob {
    param(
        [string]$JobName,
        [string]$WorkingDirectory,
        [string]$LogPath,
        [string]$Executable,
        [string[]]$Arguments
    )

    return Start-Job -Name $JobName -ArgumentList $JobName, $WorkingDirectory, $LogPath, $Executable, $Arguments -ScriptBlock {
        param($JobName, $WorkingDirectory, $LogPath, $Executable, $Arguments)

        [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
        [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
        chcp 65001 > $null

        Set-Location $WorkingDirectory
        & $Executable @Arguments *>&1 | Tee-Object -FilePath $LogPath | Out-Null

        [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            JobName  = $JobName
            LogPath  = $LogPath
        }
    }
}

function Wait-LoggedProcessJobs {
    param(
        [System.Object[]]$Jobs
    )

    if (!$Jobs -or $Jobs.Count -eq 0) {
        return @()
    }

    $results = @()
    foreach ($job in $Jobs) {
        Wait-Job $job | Out-Null
        $jobResult = Receive-Job $job
        $results += $jobResult
        Remove-Job $job
    }
    return $results
}

Push-Location $repoRoot
try {
    $frontendRelativeRoot = [System.IO.Path]::GetRelativePath($repoRoot, $frontendDir).Replace('\', '/')
    $trackedFrontendOutputs = @(
        ($frontendRelativeRoot + "/index.html"),
        ($frontendRelativeRoot + "/assets/app.js"),
        ($frontendRelativeRoot + "/assets/styles.css"),
        ($frontendRelativeRoot + "/assets/build-manifest.json")
    )
    $frontendOutputsToRestore = Get-CleanFrontendOutputs -RepoRoot $repoRoot -RelativePaths $trackedFrontendOutputs
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

    Write-Host "运行前端类型检查"
    if (Test-Path $frontendTypecheckLog) {
        Remove-Item $frontendTypecheckLog -Force
    }
    Push-Location $frontendDir
    try {
        npm run typecheck *>&1 | Tee-Object -FilePath $frontendTypecheckLog
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }

        Write-Host "运行前端测试"
        if (Test-Path $frontendTestLog) {
            Remove-Item $frontendTestLog -Force
        }
        npm test *>&1 | Tee-Object -FilePath $frontendTestLog
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }

    Push-Location $backendDir
    try {
    if (Test-Path $baseLog) {
        Remove-Item $baseLog -Force
    }
    if (Test-Path $raceLog) {
        Remove-Item $raceLog -Force
    }

    $backendPackages = @(go list ./... | Where-Object { $_ -ne 'simple-api-pool/tests' })
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $packageStage = "阶段: 后端包测试（非 tests 包）"
    Write-Host $packageStage
    $packageStage | Tee-Object -FilePath $baseLog -Append | Out-Null
    if ($backendPackages.Count -gt 0) {
        $packageLine = "运行包测试: " + ($backendPackages -join ", ")
        Write-Host $packageLine
        $packageLine | Tee-Object -FilePath $baseLog -Append | Out-Null
        go test -count=1 @backendPackages *>&1 | Tee-Object -FilePath $baseLog -Append
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    $testsStage = "阶段: 集成测试包 ./tests"
    Write-Host $testsStage
    $testsStage | Tee-Object -FilePath $baseLog -Append | Out-Null
    $slowFrontendBuildPattern = "^(" + (($slowFrontendBuildTests | ForEach-Object { [regex]::Escape($_) }) -join "|") + ")$"
    $fastTestsLog = Join-Path $logDir "check-go-test-fast-$timestamp.txt"
    $baseJobs = @(
        (Start-LoggedProcessJob -JobName "tests-fast" -WorkingDirectory $backendDir -LogPath $fastTestsLog -Executable "go" -Arguments @("test", "-timeout", $goTestTimeout, "-v", "-count=1", "-skip", $slowFrontendBuildPattern, "./tests"))
    )
    foreach ($testName in $slowFrontendBuildTests) {
        $testLog = Join-Path $logDir ("check-go-test-" + $testName + "-$timestamp.txt")
        $baseJobs += Start-LoggedProcessJob -JobName $testName -WorkingDirectory $backendDir -LogPath $testLog -Executable "go" -Arguments @("test", "-timeout", $goTestTimeout, "-v", "-count=1", "-run", ("^" + [regex]::Escape($testName) + "$"), "./tests")
    }
    # 进度片段保留: go test -v -count=1 ./tests
    $baseResults = Wait-LoggedProcessJobs -Jobs $baseJobs
    foreach ($result in $baseResults) {
        if (!$result) {
            continue
        }
        ("并行测试日志: " + $result.LogPath) | Tee-Object -FilePath $baseLog -Append | Out-Null
        if ($result.ExitCode -ne 0) {
            Get-Content $result.LogPath | Tee-Object -FilePath $baseLog -Append
            exit $result.ExitCode
        }
    }

    $raceStage = "阶段: race 集成测试包 ./tests"
    Write-Host $raceStage
    $raceStage | Tee-Object -FilePath $raceLog -Append | Out-Null
    $fastRaceLog = Join-Path $logDir "check-go-test-race-fast-$timestamp.txt"
    # 前端构建测试已在普通阶段完整覆盖；race 阶段只保留其余并发敏感逻辑，避免重复跑慢构建用例。
    $raceJobs = @(
        (Start-LoggedProcessJob -JobName "tests-race-fast" -WorkingDirectory $backendDir -LogPath $fastRaceLog -Executable "go" -Arguments @("test", "-timeout", $goRaceTimeout, "-race", "-v", "-count=1", "-skip", $slowFrontendBuildPattern, "./tests"))
    )
    # 进度片段保留: go test -race -v -count=1 ./tests
    $raceResults = Wait-LoggedProcessJobs -Jobs $raceJobs
    foreach ($result in $raceResults) {
        if (!$result) {
            continue
        }
        ("并行测试日志: " + $result.LogPath) | Tee-Object -FilePath $raceLog -Append | Out-Null
        if ($result.ExitCode -ne 0) {
            Get-Content $result.LogPath | Tee-Object -FilePath $raceLog -Append
            exit $result.ExitCode
        }
    }

    Write-Host "测试通过"
    Write-Host "日志: $frontendBuildLog"
    Write-Host "日志: $frontendTypecheckLog"
    Write-Host "日志: $frontendTestLog"
    Write-Host "日志: $baseLog"
    Write-Host "日志: $raceLog"
    }
    finally {
        Pop-Location
    }
}
finally {
    Restore-FrontendOutputs -RepoRoot $repoRoot -RelativePaths $frontendOutputsToRestore
    Pop-Location
}
