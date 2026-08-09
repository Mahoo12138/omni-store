# 多阶段构建：前端 -> 后端 -> 运行镜像
FROM node:24-alpine AS web
WORKDIR /src/web
RUN corepack enable && corepack install --global pnpm@11.9.0
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm run build

FROM golang:1.25-alpine AS build
WORKDIR /src
ARG VERSION=1.0.0-dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags="-s -w -X github.com/omni-store/omnistore/internal/buildinfo.Version=${VERSION} -X github.com/omni-store/omnistore/internal/buildinfo.Commit=${COMMIT} -X github.com/omni-store/omnistore/internal/buildinfo.BuildTime=${BUILD_DATE}" \
    -o /out/omnistore ./cmd/omnistore

FROM alpine:3.21
RUN adduser -D -u 1000 omnistore
COPY --from=build /out/omnistore /usr/local/bin/omnistore
RUN mkdir -p /data && chown omnistore:omnistore /data
USER omnistore
EXPOSE 8080 8081
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["omnistore"]
CMD ["server"]
