package users

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

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

func TestCreateFirstAdminConcurrentOnlyOneSucceeds(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	service := NewService(conn)

	const attempts = 20
	results := make(chan error, attempts)
	for i := range attempts {
		go func(index int) {
			_, err := service.CreateFirstAdmin(
				fmt.Sprintf("bootstrap-%02d", index),
				fmt.Sprintf("Bootstrap %02d", index),
				"bootstrap-password",
			)
			results <- err
		}(i)
	}

	succeeded := 0
	alreadyInitialized := 0
	for range attempts {
		err := <-results
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrAlreadyInitialized):
			alreadyInitialized++
		default:
			t.Fatalf("unexpected concurrent setup error: %v", err)
		}
	}
	if succeeded != 1 || alreadyInitialized != attempts-1 {
		t.Fatalf("succeeded=%d already_initialized=%d", succeeded, alreadyInitialized)
	}
	if count, err := service.Count(); err != nil || count != 1 {
		t.Fatalf("Count()=%d, %v", count, err)
	}
	if count, err := service.CountAdmins(); err != nil || count != 1 {
		t.Fatalf("CountAdmins()=%d, %v", count, err)
	}
}

func TestPasswordChangeAndCredentialRevocationLifecycle(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	service := NewService(conn)
	user, err := service.Create("recovery-user", "Recovery User", "initial-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	sessions := auth.NewSessions(conn, time.Hour)
	currentSession, _, err := sessions.Create(user.ID, "current", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	otherSession, _, err := sessions.Create(user.ID, "other", "127.0.0.2")
	if err != nil {
		t.Fatal(err)
	}

	if err := service.UpdatePasswordKeepingSession(user.ID, "changed-password", currentSession); err != nil {
		t.Fatalf("UpdatePasswordKeepingSession(): %v", err)
	}
	if _, _, err := sessions.Validate(currentSession); err != nil {
		t.Fatalf("current session was revoked: %v", err)
	}
	if _, _, err := sessions.Validate(otherSession); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("other session remained valid: %v", err)
	}
	hash, err := service.PasswordHashByID(user.ID)
	if err != nil || !auth.VerifyPassword(hash, "changed-password") || auth.VerifyPassword(hash, "initial-password") {
		t.Fatalf("password was not replaced: %v", err)
	}

	secondSession, _, err := sessions.Create(user.ID, "second", "127.0.0.3")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO user_tokens (user_id, token_type, token_hash, created_at) VALUES (?, 'webdav', 'webdav-hash', ?)`, []any{user.ID, now}},
		{`INSERT INTO image_bed_tokens (token_id, user_id, label, token_hash, created_at) VALUES ('ibt_one', ?, 'One', 'image-hash-one', ?)`, []any{user.ID, now}},
		{`INSERT INTO image_bed_tokens (token_id, user_id, label, token_hash, created_at) VALUES ('ibt_two', ?, 'Two', 'image-hash-two', ?)`, []any{user.ID, now}},
		{`INSERT INTO s3_credentials (access_key_id, secret_access_key_encrypted, secret_key_nonce, owner_user_id, name, created_at) VALUES ('OSAKONE', X'01', X'02', ?, 'One', ?)`, []any{user.ID, now}},
		{`INSERT INTO s3_credentials (access_key_id, secret_access_key_encrypted, secret_key_nonce, owner_user_id, name, created_at) VALUES ('OSAKTWO', X'03', X'04', ?, 'Two', ?)`, []any{user.ID, now}},
	} {
		if _, err := conn.Exec(statement.query, statement.args...); err != nil {
			t.Fatalf("seed credential: %v", err)
		}
	}

	revoked, err := service.RevokeCredentials(user.ID)
	if err != nil {
		t.Fatalf("RevokeCredentials(): %v", err)
	}
	if *revoked != (RevokedCredentials{Sessions: 2, WebDAVTokens: 1, ImageBedTokens: 2, S3Credentials: 2}) {
		t.Fatalf("unexpected revoked counts: %+v", revoked)
	}
	for _, sessionID := range []string{currentSession, secondSession} {
		if _, _, err := sessions.Validate(sessionID); !errors.Is(err, auth.ErrSessionInvalid) {
			t.Fatalf("revoked session %q remained valid: %v", sessionID, err)
		}
	}
	for _, table := range []string{"sessions", "user_tokens", "image_bed_tokens", "s3_credentials"} {
		var count int
		if err := conn.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE `+credentialOwnerColumn(table)+` = ?`, user.ID).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if count != 0 {
			t.Fatalf("%s still has %d rows", table, count)
		}
	}
	if _, err := service.GetByID(user.ID); err != nil {
		t.Fatalf("credential revocation removed user: %v", err)
	}
	cliResetSession, _, err := sessions.Create(user.ID, "cli-reset", "127.0.0.4")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.UpdatePassword(user.ID, "cli-reset-password"); err != nil {
		t.Fatalf("UpdatePassword(): %v", err)
	}
	if _, _, err := sessions.Validate(cliResetSession); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("plain password reset kept a session valid: %v", err)
	}
	if _, err := service.RevokeCredentials(user.ID + 999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing user revocation error=%v", err)
	}
}

func credentialOwnerColumn(table string) string {
	switch table {
	case "s3_credentials":
		return "owner_user_id"
	default:
		return "user_id"
	}
}

func TestDeletePreservesImagesAndAuditWithoutDanglingUserReferences(t *testing.T) {
	base := t.TempDir()
	conn, err := db.Open(filepath.Join(base, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	service := NewService(conn)
	user, err := service.Create("delete-linked-user", "Linked User", "valid-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC()
	result, err := conn.Exec(`INSERT INTO storage_sources
  (key, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		"src-linked-user", "Linked source", filepath.Join(base, "source"), now, now)
	if err != nil {
		t.Fatal(err)
	}
	sourceID, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"img-linked-user", models.ImageOwnerUser, user.ID, sourceID, "images/photo.png", "photo.png",
		"http://example.test/i/img-linked-user.png", 10, "image/png", 1, 1, "png", now); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO audit_logs
  (actor_type, actor_user_id, entry_type, action, status, created_at)
  VALUES ('user', ?, 'web', 'login', 'success', ?)`, user.ID, now); err != nil {
		t.Fatal(err)
	}

	if err := service.Delete(user.ID); err != nil {
		t.Fatalf("Delete() with linked image and audit: %v", err)
	}

	var imageOwnerType string
	var imageOwnerID sql.NullInt64
	if err := conn.QueryRow(`SELECT owner_type, owner_user_id FROM images WHERE image_id = ?`, "img-linked-user").
		Scan(&imageOwnerType, &imageOwnerID); err != nil {
		t.Fatalf("preserved image: %v", err)
	}
	if imageOwnerType != models.ImageOwnerAnonymous || imageOwnerID.Valid {
		t.Fatalf("image owner_type=%q owner_user_id=%v", imageOwnerType, imageOwnerID)
	}
	var auditActorID sql.NullInt64
	if err := conn.QueryRow(`SELECT actor_user_id FROM audit_logs WHERE action = 'login'`).Scan(&auditActorID); err != nil {
		t.Fatalf("preserved audit log: %v", err)
	}
	if auditActorID.Valid {
		t.Fatalf("audit actor_user_id=%v", auditActorID)
	}
	if _, err := service.GetByID(user.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted GetByID() error=%v", err)
	}
	rows, err := conn.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("foreign key check: %v", err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("foreign key integrity check returned a violation")
	}
}
