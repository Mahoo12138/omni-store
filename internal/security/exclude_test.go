package security

import "testing"

func TestInternalUploadAndCopyNamesAreAlwaysReserved(t *testing.T) {
	matcher := NewExcludeMatcher(nil)
	for _, relPath := range []string{
		".omnistore-upload-0123456789abcdef.tmp",
		"nested/.omnistore-upload-anything",
		".omnistore-copy-0123456789abcdef01234567.staging",
		"nested/.omnistore-copy-anything",
	} {
		if !matcher.MatchPrefix(relPath) {
			t.Fatalf("internal path %q is not reserved", relPath)
		}
	}
}
