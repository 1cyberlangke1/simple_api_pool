#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BACKEND_DIR="$REPO_ROOT/backend"
LOG_DIR="$REPO_ROOT/local-logs"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASE_LOG="$LOG_DIR/check-go-test-$TIMESTAMP.txt"
RACE_LOG="$LOG_DIR/check-go-test-race-$TIMESTAMP.txt"

cd "$BACKEND_DIR"

echo "运行 go test ./..."
go test ./... 2>&1 | tee "$BASE_LOG"

echo "运行 go test -race ./tests"
go test -race ./tests 2>&1 | tee "$RACE_LOG"

echo "测试通过"
echo "日志: $BASE_LOG"
echo "日志: $RACE_LOG"
