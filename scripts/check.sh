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
FRONTEND_JS_LOG="$LOG_DIR/check-frontend-js-$TIMESTAMP.txt"
BASE_LOG="$LOG_DIR/check-go-test-$TIMESTAMP.txt"
RACE_LOG="$LOG_DIR/check-go-test-race-$TIMESTAMP.txt"
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

echo "运行前端脚本语法检查"
: > "$FRONTEND_JS_LOG"
FRONTEND_JS_LIST="$LOG_DIR/check-frontend-js-files-$TIMESTAMP.txt"
{
    printf '%s\n' "$FRONTEND_DIR/build.mjs"
    find "$FRONTEND_DIR/src" -type f -name '*.js'
    printf '%s\n' "$FRONTEND_DIR/assets/app.js"
} | sort > "$FRONTEND_JS_LIST"
while IFS= read -r js_file; do
    echo "检查 $js_file" | tee -a "$FRONTEND_JS_LOG"
    if ! node --check "$js_file" >>"$FRONTEND_JS_LOG" 2>&1; then
        cat "$FRONTEND_JS_LOG"
        exit 1
    fi
done < "$FRONTEND_JS_LIST"

cd "$BACKEND_DIR"

: > "$BASE_LOG"
: > "$RACE_LOG"

append_stage_line "$BASE_LOG" "阶段: 后端包测试（非 tests 包）"
mapfile -t BACKEND_PACKAGES < <(go list ./...)
for package_name in "${BACKEND_PACKAGES[@]}"; do
    if [ "$package_name" = "simple-api-pool/tests" ]; then
        continue
    fi
    append_stage_line "$BASE_LOG" "运行包测试: $package_name"
    run_logged_command "$BASE_LOG" go test -count=1 "$package_name"
done

append_stage_line "$BASE_LOG" "阶段: 集成测试包 ./tests"
run_logged_command "$BASE_LOG" go test -v -count=1 ./tests

append_stage_line "$RACE_LOG" "阶段: race 集成测试包 ./tests"
run_logged_command "$RACE_LOG" go test -race -v -count=1 ./tests

echo "测试通过"
echo "日志: $FRONTEND_BUILD_LOG"
echo "日志: $FRONTEND_JS_LOG"
echo "日志: $BASE_LOG"
echo "日志: $RACE_LOG"
