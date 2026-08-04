#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_DIR"

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
    echo "用法: ./scripts/test-env.sh [seed|run]" >&2
    exit 2
    ;;
esac
