package files

import (
	"regexp"
)

var uploadTempName = regexp.MustCompile(`^\.omnistore-upload-[0-9a-f]{16}\.tmp$`)
var uploadBackupName = regexp.MustCompile(`^\.omnistore-upload-[0-9a-f]{24}\.backup$`)
var copyStagingName = regexp.MustCompile(`^\.omnistore-copy-[0-9a-f]{24}\.staging$`)

func isInternalName(name string) bool {
	return uploadTempName.MatchString(name) || uploadBackupName.MatchString(name) || copyStagingName.MatchString(name)
}
