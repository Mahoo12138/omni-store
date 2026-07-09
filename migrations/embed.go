// Package migrations 通过 go:embed 打包 SQL 迁移文件。
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
