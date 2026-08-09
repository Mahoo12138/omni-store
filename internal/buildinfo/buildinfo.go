// Package buildinfo 保存由发布构建注入的版本元数据。
package buildinfo

import "runtime"

var (
	// Version 遵循 SemVer；开发构建保留 -dev 标识。
	Version = "1.0.0-dev"
	// Commit 是构建对应的完整 Git commit；本地构建默认为 unknown。
	Commit = "unknown"
	// BuildTime 是 UTC RFC 3339 构建时间；本地构建默认为 unknown。
	BuildTime = "unknown"
)

// Info 是可序列化的构建信息。
type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"build_time"`
	GoVersion string `json:"go_version"`
}

// Current 返回当前二进制的构建信息。
func Current() Info {
	return Info{
		Version:   Version,
		Commit:    Commit,
		BuildTime: BuildTime,
		GoVersion: runtime.Version(),
	}
}
