# 多阶段构建：前端 -> 后端 -> 运行镜像
FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o /out/omnistore ./cmd/omnistore

FROM alpine:3.21
RUN adduser -D -u 1000 omnistore
COPY --from=build /out/omnistore /usr/local/bin/omnistore
USER omnistore
EXPOSE 8080
ENTRYPOINT ["omnistore"]
CMD ["server"]
