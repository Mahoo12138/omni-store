package security

import (
	"errors"
	"testing"
)

func TestValidateUserRelPathRejectsManagedNamespaceSegments(t *testing.T) {
	cases := []struct {
		input string
		want  error
	}{
		{".omnistore", ErrManagedNamespace},
		{".omnistore/transfer/x", ErrManagedNamespace},
		{"normal/.omnistore/x", ErrManagedNamespace},
		{"a/b/.omnistore", ErrManagedNamespace},
		{".OMNISTORE", ErrManagedNamespace},
		{".OmniStore/inner.txt", ErrManagedNamespace},
		{"blog/.omnistore.txt", nil},
		{".omnistore-backup/config.json", nil},
		{".omnistore2/readme.md", nil},
		{"文件/%20空格/_keep.txt", nil},
		{".omnistore-upload-abc.tmp", ErrReservedName},
		{"docs/.omnistore-copy-x", ErrReservedName},
	}
	for _, tc := range cases {
		err := ValidateUserRelPath(tc.input)
		if tc.want == nil {
			if err != nil {
				t.Errorf("ValidateUserRelPath(%q) = %v, want nil", tc.input, err)
			}
			continue
		}
		if !errors.Is(err, tc.want) {
			t.Errorf("ValidateUserRelPath(%q) = %v, want %v", tc.input, err, tc.want)
		}
	}
}

func TestValidateFileNameRejectsManagedNamespaceName(t *testing.T) {
	for _, name := range []string{".omnistore", ".OMNISTORE"} {
		if err := ValidateFileName(name); !errors.Is(err, ErrManagedNamespace) {
			t.Errorf("ValidateFileName(%q) = %v, want ErrManagedNamespace", name, err)
		}
	}
	if err := ValidateFileName(".omnistore.txt"); err != nil {
		t.Errorf("ValidateFileName(.omnistore.txt) = %v, want nil", err)
	}
}

func TestContainsManagedNamespace(t *testing.T) {
	if !ContainsManagedNamespace("x/.omnistore/y") || !ContainsManagedNamespace(".omnistore") {
		t.Fatal("managed segments must be detected")
	}
	if ContainsManagedNamespace(".omnistore.txt") || ContainsManagedNamespace("plain/path.txt") {
		t.Fatal("similar names must not be flagged")
	}
}

func TestForcedExcludePatternsHideManagedNamespace(t *testing.T) {
	m := NewExcludeMatcher([]string{"private/**"})
	hidden := []string{
		".omnistore",
		".omnistore/image-bed/2026/a.png",
		"blog/.omnistore",
		"blog/.omnistore/x",
	}
	for _, rel := range hidden {
		if !m.Match(rel) {
			t.Errorf("Match(%q) = false, want true", rel)
		}
		if !m.MatchPrefix(rel) {
			t.Errorf("MatchPrefix(%q) = false, want true", rel)
		}
	}
	visible := []string{".omnistore.txt", "blog/.omnistore.txt", "plain/a.txt"}
	for _, rel := range visible {
		if m.Match(rel) {
			t.Errorf("Match(%q) = true, want false", rel)
		}
	}
	if !m.Match("private/secret.txt") {
		t.Fatal("user patterns must still match")
	}
	if !m.MatchPrefix("private/secret.txt") {
		t.Fatal("user patterns must still match prefixes")
	}
}

func TestManagedNamespaceSegmentIsExactMatch(t *testing.T) {
	// 前缀式误伤检查：不能用 strings.HasPrefix(name, ".omnistore") 判断。
	if IsManagedNamespaceName(".omnistore.txt") || IsManagedNamespaceName(".omnistore2") {
		t.Fatal("prefix matches must not be treated as the managed namespace")
	}
	if IsManagedNamespaceName(".omnistore ") || IsManagedNamespaceName(" .omnistore") {
		t.Fatal("segment match must be exact, not trimmed")
	}
}
