#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/omnistore-crashcheck-build.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM

cd "$PROJECT_DIR"
go build -o "$BUILD_DIR/omnistore" ./cmd/omnistore
go build -o "$BUILD_DIR/testenv" ./cmd/testenv
go build -o "$BUILD_DIR/crashcheck" ./cmd/crashcheck

"$BUILD_DIR/crashcheck" \
  --server "$BUILD_DIR/omnistore" \
  --seed "$BUILD_DIR/testenv" \
  --rounds "${OMNISTORE_CRASH_ROUNDS:-3}"
