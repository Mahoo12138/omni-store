#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CHECK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/omnistore-release-check.XXXXXX")
trap 'rm -rf "$CHECK_DIR"' EXIT INT TERM

cd "$PROJECT_DIR"

echo "[1/7] Go formatting"
UNFORMATTED=$(gofmt -l cmd internal migrations)
if [ -n "$UNFORMATTED" ]; then
  echo "以下 Go 文件尚未格式化:" >&2
  echo "$UNFORMATTED" >&2
  exit 1
fi

echo "[2/7] Go vet and tests"
go vet ./...
go test ./...

echo "[3/7] Frontend tests and production build"
cd "$PROJECT_DIR/web"
pnpm test
pnpm run build

echo "[4/7] Browser E2E"
pnpm exec playwright test

echo "[5/7] Release binary and embedded frontend"
cd "$PROJECT_DIR"
VERSION=${OMNISTORE_RELEASE_VERSION:-1.0.0-dev}
COMMIT=$(git rev-parse HEAD 2>/dev/null || printf unknown)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS="-s -w -X github.com/omni-store/omnistore/internal/buildinfo.Version=$VERSION -X github.com/omni-store/omnistore/internal/buildinfo.Commit=$COMMIT -X github.com/omni-store/omnistore/internal/buildinfo.BuildTime=$BUILD_TIME"
CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" -o "$CHECK_DIR/omnistore" ./cmd/omnistore
"$CHECK_DIR/omnistore" version | tee "$CHECK_DIR/version.txt"
grep -F "OmniStore $VERSION" "$CHECK_DIR/version.txt" >/dev/null

echo "[6/7] Linux cross-builds"
for ARCH in amd64 arm64; do
  GOOS=linux GOARCH=$ARCH CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" \
    -o "$CHECK_DIR/omnistore-linux-$ARCH" ./cmd/omnistore
done

echo "[7/7] Compose configuration"
if command -v docker >/dev/null 2>&1; then
  docker compose config >/dev/null
else
  echo "docker 不可用，跳过 docker compose config"
fi

echo "OmniStore $VERSION 发布候选检查通过"
