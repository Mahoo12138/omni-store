package db

import (
	"testing"
	"time"

	"github.com/omni-store/omnistore/migrations"
)

func TestTransferAccessMigrationPreservesCodeProtectedTasks(t *testing.T) {
	conn := newLegacyDB(t)
	if _, err := conn.Exec(`PRAGMA foreign_keys=OFF`); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"v2.0.0.sql", "v2.0.1.sql"} {
		content, err := migrations.FS.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(string(content)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
		if _, err := conn.Exec(`INSERT INTO schema_migrations VALUES (?, ?)`, name[:len(name)-4], time.Now().UTC()); err != nil {
			t.Fatal(err)
		}
	}
	for _, statement := range []string{
		`INSERT INTO users (id, user_public_id, username, display_name, password_hash, role, created_at, updated_at)
  VALUES (1, 'legacy-owner', 'legacy-owner', 'Legacy Owner', 'password-digest', 'user', datetime('now'), datetime('now'))`,
		`INSERT INTO storage_sources (id, key, name, root_path, created_at, updated_at)
  VALUES (1, 'src-carrier', 'Carrier', '/example/carrier', datetime('now'), datetime('now'))`,
		`INSERT INTO transfers (id, public_key, owner_user_id, storage_source_id, title, pickup_code_hash, password_hash, status, total_files, total_size, created_at, updated_at)
  VALUES (1, 'legacy-send', 1, 1, 'Legacy Send', 'pickup-digest', 'send-password-digest', 'active', 1, 4, datetime('now'), datetime('now'))`,
		`INSERT INTO transfer_files (transfer_id, relative_path, size, created_at) VALUES (1, 'send.txt', 4, datetime('now'))`,
		`INSERT INTO transfer_collections (id, public_key, owner_user_id, storage_source_id, title, code_hash, password_hash, status, total_files, total_size, created_at, updated_at)
  VALUES (1, 'legacy-collection', 1, 1, 'Legacy Collection', 'collection-digest', 'collection-password-digest', 'closed', 1, 7, datetime('now'), datetime('now'))`,
		`INSERT INTO transfer_submissions (id, collection_id, file_count, total_size, created_at) VALUES (1, 1, 1, 7, datetime('now'))`,
		`INSERT INTO transfer_submission_files (submission_id, relative_path, size, created_at) VALUES (1, 'private.txt', 7, datetime('now'))`,
		`INSERT INTO transfer_access_sessions (token_hash, collection_id, created_at, expires_at) VALUES ('token-digest', 1, datetime('now'), datetime('now', '+1 hour'))`,
		`INSERT INTO transfers (id, public_key, owner_user_id, storage_source_id, pickup_code_hash, created_at, updated_at)
  VALUES (300, 'deleted-send', 1, 1, 'old-code', datetime('now'), datetime('now'))`,
		`DELETE FROM transfers WHERE id = 300`,
		`INSERT INTO transfer_collections (id, public_key, owner_user_id, storage_source_id, code_hash, created_at, updated_at)
  VALUES (400, 'deleted-collection', 1, 1, 'old-code', datetime('now'), datetime('now'))`,
		`DELETE FROM transfer_collections WHERE id = 400`,
	} {
		if _, err := conn.Exec(statement); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if err := Migrate(conn); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		table      string
		codeColumn string
		codeDigest string
		status     string
		size       int64
	}{
		{table: "transfers", codeColumn: "pickup_code_hash", codeDigest: "pickup-digest", status: "active", size: 4},
		{table: "transfer_collections", codeColumn: "code_hash", codeDigest: "collection-digest", status: "closed", size: 7},
	} {
		var requireCode bool
		var digest, password, status string
		var owner, sourceID, size int64
		if err := conn.QueryRow(`SELECT require_code, `+tc.codeColumn+`, password_hash, status, owner_user_id, storage_source_id, total_size FROM `+tc.table+` WHERE id = 1`).Scan(
			&requireCode, &digest, &password, &status, &owner, &sourceID, &size); err != nil {
			t.Fatal(err)
		}
		if !requireCode || digest != tc.codeDigest || password == "" || status != tc.status || owner != 1 || sourceID != 1 || size != tc.size {
			t.Fatalf("%s migration changed task: %v %q %q %q %d %d %d", tc.table, requireCode, digest, password, status, owner, sourceID, size)
		}
		if _, err := conn.Exec(`UPDATE ` + tc.table + ` SET require_code = 2 WHERE id = 1`); err == nil {
			t.Fatalf("%s accepts invalid access requirement", tc.table)
		}
		if _, err := conn.Exec(`UPDATE ` + tc.table + ` SET require_code = 0 WHERE id = 1`); err != nil {
			t.Fatal(err)
		}
	}
	if err := Migrate(conn); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
	for _, table := range []string{"transfer_files", "transfer_submissions", "transfer_submission_files", "transfer_access_sessions"} {
		var count int
		if err := conn.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil || count != 1 {
			t.Fatalf("%s rows=%d err=%v", table, count, err)
		}
	}
	var requireCode bool
	if err := conn.QueryRow(`SELECT require_code FROM transfer_collections WHERE id = 1`).Scan(&requireCode); err != nil || requireCode {
		t.Fatalf("repeat migration reset access mode=%v err=%v", requireCode, err)
	}
	if _, err := conn.Exec(`INSERT INTO transfer_submissions (collection_id, created_at) VALUES (999, datetime('now'))`); err == nil {
		t.Fatal("migration lost foreign key enforcement")
	}
	if _, err := conn.Exec(`INSERT INTO transfer_guest_identities (id, token_hash, created_at, expires_at) VALUES (1, 'guest-cookie-hash', datetime('now'), datetime('now', '+1 hour'))`); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		table      string
		codeColumn string
		highWater  int64
	}{
		{table: "transfers", codeColumn: "pickup_code_hash", highWater: 300},
		{table: "transfer_collections", codeColumn: "code_hash", highWater: 400},
	} {
		for _, invalidOwner := range []string{
			`owner_user_id = NULL, owner_guest_id = NULL`,
			`owner_user_id = 1, owner_guest_id = 1`,
			`owner_user_id = NULL, owner_guest_id = 999`,
		} {
			if _, err := conn.Exec(`UPDATE ` + tc.table + ` SET ` + invalidOwner + ` WHERE id = 1`); err == nil {
				t.Fatalf("%s accepts invalid owner: %s", tc.table, invalidOwner)
			}
		}
		result, err := conn.Exec(`INSERT INTO `+tc.table+` (public_key, owner_guest_id, storage_source_id, `+tc.codeColumn+`, require_code, created_at, updated_at)
  VALUES (?, 1, 1, '', 0, datetime('now'), datetime('now'))`, "guest-"+tc.table)
		if err != nil {
			t.Fatalf("guest with same numeric ID as user cannot own %s: %v", tc.table, err)
		}
		id, err := result.LastInsertId()
		if err != nil || id <= tc.highWater {
			t.Fatalf("%s reused deleted historical ID: %d err=%v", tc.table, id, err)
		}
		var userOwner, guestOwner any
		if err := conn.QueryRow(`SELECT owner_user_id, owner_guest_id FROM `+tc.table+` WHERE id = ?`, id).Scan(&userOwner, &guestOwner); err != nil || userOwner != nil || guestOwner != int64(1) {
			t.Fatalf("guest owner mis-migrated: user=%v guest=%v err=%v", userOwner, guestOwner, err)
		}
	}
	if _, err := conn.Exec(`DELETE FROM transfer_guest_identities WHERE id = 1`); err == nil {
		t.Fatal("guest identity deletion bypasses historical task ownership")
	}
	if err := Migrate(conn); err != nil {
		t.Fatalf("repeat migration with guest records: %v", err)
	}
}
