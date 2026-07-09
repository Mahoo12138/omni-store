// Package web 通过 go:embed 将前端构建产物嵌入二进制。
// 构建顺序：先 `npm run build` 生成 web/dist，再 `go build`。
package web

import "embed"

//go:embed all:dist
var DistFS embed.FS
