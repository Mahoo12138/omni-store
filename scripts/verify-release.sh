#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CHECK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/omnistore-verify-release.XXXXXX")
trap 'rm -rf "$CHECK_DIR"' EXIT INT TERM

cd "$PROJECT_DIR"

VERSION=${OMNISTORE_RELEASE_VERSION:-1.0.0-dev}
MIN_GO_COVERAGE=${OMNISTORE_MIN_GO_COVERAGE:-52.0}
SEMVER_PATTERN='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
if ! printf '%s\n' "$VERSION" | grep -Eq "$SEMVER_PATTERN"; then
  echo "OMNISTORE_RELEASE_VERSION 不是合法 SemVer: $VERSION" >&2
  exit 1
fi
if ! printf '%s\n' "$MIN_GO_COVERAGE" | grep -Eq '^[0-9]+([.][0-9]+)?$'; then
  echo "OMNISTORE_MIN_GO_COVERAGE 必须是非负数: $MIN_GO_COVERAGE" >&2
  exit 1
fi

if [ "${OMNISTORE_ALLOW_DIRTY:-0}" != "1" ] && [ -n "$(git status --porcelain)" ]; then
  echo "发布候选检查要求干净工作区；开发中可显式设置 OMNISTORE_ALLOW_DIRTY=1。" >&2
  exit 1
fi

if [ "${OMNISTORE_REQUIRE_TAG:-0}" = "1" ]; then
  EXPECTED_TAG="v$VERSION"
  CURRENT_TAG=$(git tag --points-at HEAD | grep -Fx "$EXPECTED_TAG" || true)
  if [ "$CURRENT_TAG" != "$EXPECTED_TAG" ]; then
    echo "当前提交必须精确标记为 $EXPECTED_TAG" >&2
    exit 1
  fi
fi

echo "[1/10] Release metadata and migrations"
test -f LICENSE
grep -Fx "MIT License" LICENSE >/dev/null
test -f migrations/v1.0.0.sql
INVALID_MIGRATIONS=$(find migrations -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | \
  grep -Ev '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.sql$' || true)
if [ -n "$INVALID_MIGRATIONS" ]; then
  echo "发现未按 vMAJOR.MINOR.PATCH.sql 命名的迁移文件" >&2
  echo "$INVALID_MIGRATIONS" >&2
  exit 1
fi
echo "version: $VERSION"

echo "[2/10] Go formatting"
UNFORMATTED=$(gofmt -l cmd internal migrations)
if [ -n "$UNFORMATTED" ]; then
  echo "以下 Go 文件尚未格式化:" >&2
  echo "$UNFORMATTED" >&2
  exit 1
fi

echo "[3/10] Go vet, tests, and coverage"
go vet ./...
GO_COVERAGE_PROFILE="$CHECK_DIR/go-cover.out"
go test -count=1 -coverprofile="$GO_COVERAGE_PROFILE" ./...
GO_COVERAGE=$(go tool cover -func="$GO_COVERAGE_PROFILE" | awk '/^total:/ {gsub("%", "", $3); print $3}')
if [ -z "$GO_COVERAGE" ] || ! awk -v actual="$GO_COVERAGE" -v minimum="$MIN_GO_COVERAGE" 'BEGIN { exit !(actual >= minimum) }'; then
  echo "Go 语句覆盖率 ${GO_COVERAGE:-unknown}% 低于发布门槛 $MIN_GO_COVERAGE%" >&2
  exit 1
fi
echo "Go statement coverage: $GO_COVERAGE% (minimum $MIN_GO_COVERAGE%)"

echo "[4/10] Go race detector"
go test -race -count=1 ./...

echo "[5/10] Frontend tests and production build"
cd "$PROJECT_DIR/web"
if [ "${OMNISTORE_SKIP_PNPM_INSTALL:-0}" != "1" ]; then
  pnpm install --frozen-lockfile
fi
pnpm test
pnpm run build

echo "[6/10] Browser E2E"
pnpm exec playwright test

echo "[7/10] Release binary and embedded frontend"
cd "$PROJECT_DIR"
COMMIT=$(git rev-parse HEAD 2>/dev/null || printf unknown)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS="-s -w -X github.com/omni-store/omnistore/internal/buildinfo.Version=$VERSION -X github.com/omni-store/omnistore/internal/buildinfo.Commit=$COMMIT -X github.com/omni-store/omnistore/internal/buildinfo.BuildTime=$BUILD_TIME"
CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" -o "$CHECK_DIR/omnistore" ./cmd/omnistore
"$CHECK_DIR/omnistore" version | tee "$CHECK_DIR/version.txt"
grep -F "OmniStore $VERSION" "$CHECK_DIR/version.txt" >/dev/null

echo "[8/10] Linux cross-builds"
for ARCH in amd64 arm64; do
  GOOS=linux GOARCH=$ARCH CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" \
    -o "$CHECK_DIR/omnistore-linux-$ARCH" ./cmd/omnistore
done

echo "[9/10] Compose configuration"
if command -v docker >/dev/null 2>&1; then
  docker compose config >/dev/null
else
  echo "docker 不可用，跳过 docker compose config"
fi

echo "[10/10] Repository diff check"
git diff --check
git diff --cached --check

echo "OmniStore $VERSION 统一发布门禁通过"
