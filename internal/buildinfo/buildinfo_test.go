package buildinfo

import "testing"

func TestCurrentIncludesBuildMetadata(t *testing.T) {
	info := Current()
	if info.Version == "" || info.Commit == "" || info.BuildTime == "" || info.GoVersion == "" {
		t.Fatalf("incomplete build info: %+v", info)
	}
}
