#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_DIR"

# 可选 "clean" 前缀：./scripts/test-env.sh clean [seed|run]
# 清除并重建 .testdata，保证 E2E 从干净种子状态开始，不受历史运行残留影响。
if [ "${1:-}" = "clean" ]; then
  shift
  rm -rf "$PROJECT_DIR/.testdata"
  echo "已清除隔离测试环境 .testdata/"
fi

ACTION=${1:-run}

case "$ACTION" in
  seed)
    exec go run ./cmd/testenv seed --config "$PROJECT_DIR/config.test.yaml" --fixtures "$PROJECT_DIR/.testdata/sources"
    ;;
  run)
    go run ./cmd/testenv seed --config "$PROJECT_DIR/config.test.yaml" --fixtures "$PROJECT_DIR/.testdata/sources"
    exec go run ./cmd/omnistore server --config "$PROJECT_DIR/config.test.yaml"
    ;;
  *)
    echo "用法: ./scripts/test-env.sh [clean] [seed|run]" >&2
    exit 2
    ;;
esac
