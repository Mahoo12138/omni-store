package users

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
)

func TestServiceUserLifecycleAndValidation(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	service := NewService(conn)

	if count, err := service.Count(); err != nil || count != 0 {
		t.Fatalf("initial Count()=%d, %v", count, err)
	}
	for _, tt := range []struct {
		username string
		password string
		role     string
		wantErr  error
	}{
		{username: "ab", password: "valid-password", role: models.RoleUser, wantErr: ErrInvalidUsername},
		{username: "valid-user", password: "short", role: models.RoleUser, wantErr: ErrWeakPassword},
	} {
		if _, err := service.Create(tt.username, "", tt.password, tt.role); !errors.Is(err, tt.wantErr) {
			t.Fatalf("Create(%q) error=%v want=%v", tt.username, err, tt.wantErr)
		}
	}
	if _, err := service.Create("valid-user", "", "valid-password", "owner"); err == nil {
		t.Fatal("Create() accepted an invalid role")
	}

	admin, err := service.Create("admin-user", "   ", "initial-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	if admin.DisplayName != "admin-user" || !admin.IsAdmin() || admin.IsDisabled {
		t.Fatalf("unexpected created admin: %+v", admin)
	}
	if _, err := service.Create("admin-user", "Duplicate", "another-password", models.RoleUser); !errors.Is(err, ErrUsernameTaken) {
		t.Fatalf("duplicate username error=%v", err)
	}
	hash, err := service.PasswordHashByUsername(admin.Username)
	if err != nil || !auth.VerifyPassword(hash, "initial-password") {
		t.Fatalf("stored password hash invalid: %v", err)
	}
	if count, err := service.CountAdmins(); err != nil || count != 1 {
		t.Fatalf("CountAdmins()=%d, %v", count, err)
	}

	if err := service.SetDisabled(admin.ID, true); err != nil {
		t.Fatal(err)
	}
	if count, err := service.CountAdmins(); err != nil || count != 0 {
		t.Fatalf("disabled CountAdmins()=%d, %v", count, err)
	}
	if err := service.SetDisabled(admin.ID, false); err != nil {
		t.Fatal(err)
	}
	if err := service.SetQuota(admin.ID, -1); !errors.Is(err, ErrQuotaInvalid) {
		t.Fatalf("negative quota error=%v", err)
	}
	if err := service.SetQuota(admin.ID, 4096); err != nil {
		t.Fatal(err)
	}
	if err := service.UpdateDisplayName(admin.ID, "  Release Admin  "); err != nil {
		t.Fatal(err)
	}
	if err := service.UpdateDisplayName(admin.ID, "   "); err == nil {
		t.Fatal("empty display name unexpectedly succeeded")
	}
	if err := service.UpdatePassword(admin.ID, "short"); !errors.Is(err, ErrWeakPassword) {
		t.Fatalf("weak password update error=%v", err)
	}
	if err := service.UpdatePassword(admin.ID, "updated-password"); err != nil {
		t.Fatal(err)
	}
	updatedHash, err := service.PasswordHashByID(admin.ID)
	if err != nil || !auth.VerifyPassword(updatedHash, "updated-password") || auth.VerifyPassword(updatedHash, "initial-password") {
		t.Fatalf("updated password hash invalid: %v", err)
	}

	updated, err := service.GetByUsername("admin-user")
	if err != nil {
		t.Fatal(err)
	}
	if updated.DisplayName != "Release Admin" || updated.QuotaBytes != 4096 || updated.IsDisabled {
		t.Fatalf("unexpected updated user: %+v", updated)
	}
	listed, err := service.List()
	if err != nil || len(listed) != 1 || listed[0].ID != admin.ID {
		t.Fatalf("List()=%+v, %v", listed, err)
	}

	if err := service.Delete(admin.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetByID(admin.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted GetByID() error=%v", err)
	}
	for name, err := range map[string]error{
		"disable":  service.SetDisabled(admin.ID, true),
		"quota":    service.SetQuota(admin.ID, 1),
		"display":  service.UpdateDisplayName(admin.ID, "Missing"),
		"password": service.UpdatePassword(admin.ID, "missing-password"),
		"delete":   service.Delete(admin.ID),
	} {
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("%s missing user error=%v", name, err)
		}
	}
}
