#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BACKEND_DIR="$REPO_ROOT/backend"
if [ -f "$REPO_ROOT/src/backend/go.mod" ]; then
    BACKEND_DIR="$REPO_ROOT/src/backend"
fi
FRONTEND_DIR="$REPO_ROOT/frontend"
if [ -f "$REPO_ROOT/src/frontend/src/index.template.html" ]; then
    FRONTEND_DIR="$REPO_ROOT/src/frontend"
fi
LOG_DIR="$REPO_ROOT/local-logs"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FRONTEND_BUILD_LOG="$LOG_DIR/check-frontend-build-$TIMESTAMP.txt"
FRONTEND_TYPECHECK_LOG="$LOG_DIR/check-frontend-typecheck-$TIMESTAMP.txt"
FRONTEND_TEST_LOG="$LOG_DIR/check-frontend-test-$TIMESTAMP.txt"
BASE_LOG="$LOG_DIR/check-go-test-$TIMESTAMP.txt"
RACE_LOG="$LOG_DIR/check-go-test-race-$TIMESTAMP.txt"
GO_TEST_TIMEOUT="${CHECK_GO_TEST_TIMEOUT:-30m}"
GO_RACE_TIMEOUT="${CHECK_GO_RACE_TIMEOUT:-45m}"
SLOW_FRONTEND_BUILD_PATTERN='^(TestFrontendBuildFailsWhenTemplateReferencesMissingGeneratedAsset|TestFrontendBuildFailsWhenGeneratedOutputRetainsBuildPlaceholder|TestFrontendBuildWritesManifestWithDetectedLayoutAndAssets|TestFrontendBuildRemovesStaleGeneratedAssets|TestFrontendBuildChangesAssetVersionWhenBuildTimeChanges)$'
REQUIRED_FRONTEND_FILES="
index.html
favicon.svg
build.mjs
package.json
package-lock.json
assets/app.js
assets/styles.css
assets/build-manifest.json
"

cd "$REPO_ROOT"

run_logged_command() {
    local log_path="$1"
    shift
    "$@" 2>&1 | tee -a "$log_path"
}

append_stage_line() {
    local log_path="$1"
    local message="$2"
    echo "$message"
    printf '%s\n' "$message" >>"$log_path"
}

wait_for_logged_jobs() {
    local failed=0
    local spec pid log_path
    for spec in "$@"; do
        pid="${spec%%:*}"
        log_path="${spec#*:}"
        if ! wait "$pid"; then
            failed=1
            cat "$log_path"
        fi
    done
    return "$failed"
}

echo "重建前端资源"
if ! go run ./scripts/build_frontend.go -root . >"$FRONTEND_BUILD_LOG" 2>&1; then
    cat "$FRONTEND_BUILD_LOG"
    exit 1
fi
cat "$FRONTEND_BUILD_LOG"

printf '%s' "$REQUIRED_FRONTEND_FILES" | while IFS= read -r relative_path; do
    [ -n "$relative_path" ] || continue
    if [ ! -f "$FRONTEND_DIR/$relative_path" ]; then
        echo "缺少前端构建产物: $relative_path"
        exit 1
    fi
done

echo "运行前端类型检查"
cd "$FRONTEND_DIR"
: > "$FRONTEND_TYPECHECK_LOG"
run_logged_command "$FRONTEND_TYPECHECK_LOG" npm run typecheck

echo "运行前端测试"
: > "$FRONTEND_TEST_LOG"
run_logged_command "$FRONTEND_TEST_LOG" npm test

cd "$BACKEND_DIR"

: > "$BASE_LOG"
: > "$RACE_LOG"

append_stage_line "$BASE_LOG" "阶段: 后端包测试（非 tests 包）"
mapfile -t BACKEND_PACKAGES < <(go list ./...)
NON_TEST_PACKAGES=()
for package_name in "${BACKEND_PACKAGES[@]}"; do
    if [ "$package_name" != "simple-api-pool/tests" ]; then
        NON_TEST_PACKAGES+=("$package_name")
    fi
done
if [ "${#NON_TEST_PACKAGES[@]}" -gt 0 ]; then
    append_stage_line "$BASE_LOG" "运行包测试: ${NON_TEST_PACKAGES[*]}"
    run_logged_command "$BASE_LOG" go test -count=1 "${NON_TEST_PACKAGES[@]}"
fi

append_stage_line "$BASE_LOG" "阶段: 集成测试包 ./tests"
FAST_TEST_LOG="$LOG_DIR/check-go-test-fast-$TIMESTAMP.txt"
SLOW_FRONTEND_TEST_LOG="$LOG_DIR/check-go-test-slow-frontend-build-$TIMESTAMP.txt"
append_stage_line "$BASE_LOG" "并行测试日志: $FAST_TEST_LOG"
go test -timeout "$GO_TEST_TIMEOUT" -v -count=1 -skip "$SLOW_FRONTEND_BUILD_PATTERN" ./tests >"$FAST_TEST_LOG" 2>&1 &
BASE_JOB_SPECS=("$!:$FAST_TEST_LOG")
append_stage_line "$BASE_LOG" "并行测试日志: $SLOW_FRONTEND_TEST_LOG"
append_stage_line "$BASE_LOG" "阶段: 慢前端构建集成测试（合并批次）"
go test -timeout "$GO_TEST_TIMEOUT" -v -count=1 -run "$SLOW_FRONTEND_BUILD_PATTERN" ./tests >"$SLOW_FRONTEND_TEST_LOG" 2>&1 &
BASE_JOB_SPECS+=("$!:$SLOW_FRONTEND_TEST_LOG")
# 进度片段保留: go test -v -count=1 ./tests
wait_for_logged_jobs "${BASE_JOB_SPECS[@]}"

append_stage_line "$RACE_LOG" "阶段: race 集成测试包 ./tests"
FAST_RACE_LOG="$LOG_DIR/check-go-test-race-fast-$TIMESTAMP.txt"
append_stage_line "$RACE_LOG" "并行测试日志: $FAST_RACE_LOG"
# 前端构建测试已在普通阶段完整覆盖；race 阶段只保留其余并发敏感逻辑，避免重复跑慢构建用例。
go test -timeout "$GO_RACE_TIMEOUT" -race -v -count=1 -skip "$SLOW_FRONTEND_BUILD_PATTERN" ./tests >"$FAST_RACE_LOG" 2>&1 &
RACE_JOB_SPECS=("$!:$FAST_RACE_LOG")
# 进度片段保留: go test -race -v -count=1 ./tests
wait_for_logged_jobs "${RACE_JOB_SPECS[@]}"

echo "测试通过"
echo "日志: $FRONTEND_BUILD_LOG"
echo "日志: $FRONTEND_TYPECHECK_LOG"
echo "日志: $FRONTEND_TEST_LOG"
echo "日志: $BASE_LOG"
echo "日志: $RACE_LOG"
