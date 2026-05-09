#!/usr/bin/env sh
set -eu

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
assets/styles.css
assets/build-manifest.json
assets/core.js
assets/state.js
assets/i18n.js
assets/app.js
assets/features/providers/provider_form_state.js
assets/features/providers/provider_events.js
assets/views/status_view.js
assets/views/logs_view.js
assets/views/provider_view.js
assets/api.js
assets/actions/polling_actions.js
assets/boot.js
"

cd "$REPO_ROOT"

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
find "$FRONTEND_DIR/src" "$FRONTEND_DIR/assets" -type f -name '*.js' | sort > "$FRONTEND_JS_LIST"
while IFS= read -r js_file; do
    echo "检查 $js_file" | tee -a "$FRONTEND_JS_LOG"
    if ! node --check "$js_file" >>"$FRONTEND_JS_LOG" 2>&1; then
        cat "$FRONTEND_JS_LOG"
        exit 1
    fi
done < "$FRONTEND_JS_LIST"

cd "$BACKEND_DIR"

echo "运行 go test ./..."
if ! go test ./... >"$BASE_LOG" 2>&1; then
    cat "$BASE_LOG"
    exit 1
fi
cat "$BASE_LOG"

echo "运行 go test -race ./tests"
if ! go test -race ./tests >"$RACE_LOG" 2>&1; then
    cat "$RACE_LOG"
    exit 1
fi
cat "$RACE_LOG"

echo "测试通过"
echo "日志: $FRONTEND_BUILD_LOG"
echo "日志: $FRONTEND_JS_LOG"
echo "日志: $BASE_LOG"
echo "日志: $RACE_LOG"
