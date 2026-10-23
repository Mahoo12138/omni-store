package db

import "testing"

// 合并后的 2.0.0 迁移直接建出最终形态的中转台账：任务默认要求取件码/收件码，
// 所有者二选一，访客身份受历史任务引用保护。
func TestTransferAccessMigrationDefaultsToCodeProtected(t *testing.T) {
	conn := newLegacyDB(t)
	for _, statement := range []string{
		`INSERT INTO users (id, user_public_id, username, display_name, password_hash, role, created_at, updated_at)
  VALUES (1, 'legacy-owner', 'legacy-owner', 'Legacy Owner', 'password-digest', 'user', datetime('now'), datetime('now'))`,
		`INSERT INTO storage_sources (id, key, name, root_path, created_at, updated_at)
  VALUES (1, 'src-carrier', 'Carrier', '/example/carrier', datetime('now'), datetime('now'))`,
	} {
		if _, err := conn.Exec(statement); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if err := Migrate(conn); err != nil {
		t.Fatal(err)
	}

	// 默认 require_code=1，可显式关闭；非法取值被 CHECK 拒绝。
	result, err := conn.Exec(`INSERT INTO transfers (public_key, owner_user_id, storage_source_id, title, pickup_code_hash, password_hash, status, total_files, total_size, created_at, updated_at)
  VALUES ('legacy-send', 1, 1, 'Legacy Send', 'pickup-digest', 'send-password-digest', 'active', 1, 4, datetime('now'), datetime('now'))`)
	if err != nil {
		t.Fatalf("insert send: %v", err)
	}
	sendID, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO transfer_collections (public_key, owner_user_id, storage_source_id, title, code_hash, password_hash, status, total_files, total_size, created_at, updated_at)
  VALUES ('legacy-collection', 1, 1, 'Legacy Collection', 'collection-digest', 'collection-password-digest', 'closed', 1, 7, datetime('now'), datetime('now'))`); err != nil {
		t.Fatalf("insert collection: %v", err)
	}
	for _, table := range []string{"transfers", "transfer_collections"} {
		var requireCode bool
		if err := conn.QueryRow(`SELECT require_code FROM ` + table + ` WHERE id = 1`).Scan(&requireCode); err != nil || !requireCode {
			t.Fatalf("%s default require_code=%v err=%v, want true", table, requireCode, err)
		}
		if _, err := conn.Exec(`UPDATE ` + table + ` SET require_code = 2 WHERE id = 1`); err == nil {
			t.Fatalf("%s accepts invalid access requirement", table)
		}
		if _, err := conn.Exec(`UPDATE ` + table + ` SET require_code = 0 WHERE id = 1`); err != nil {
			t.Fatal(err)
		}
	}

	// 所有者二选一：无主或双重所有都被拒绝。
	for _, table := range []string{"transfers", "transfer_collections"} {
		codeColumn := "pickup_code_hash"
		if table == "transfer_collections" {
			codeColumn = "code_hash"
		}
		for _, invalidOwner := range []string{
			`owner_user_id = NULL, owner_guest_id = NULL`,
			`owner_user_id = 1, owner_guest_id = 1`,
			`owner_user_id = NULL, owner_guest_id = 999`,
		} {
			if _, err := conn.Exec(`UPDATE ` + table + ` SET ` + invalidOwner + ` WHERE id = 1`); err == nil {
				t.Fatalf("%s accepts invalid owner: %s", table, invalidOwner)
			}
		}
		if _, err := conn.Exec(`INSERT INTO `+table+` (public_key, owner_guest_id, storage_source_id, `+codeColumn+`, require_code, created_at, updated_at)
  VALUES (?, 1, 1, '', 0, datetime('now'), datetime('now'))`, "guest-"+table); err == nil {
			t.Fatalf("%s must reject a guest identity that does not exist", table)
		}
	}

	// 访客身份：先登记，再被任务引用；被引用时删除受限。
	if _, err := conn.Exec(`INSERT INTO transfer_guest_identities (id, token_hash, created_at, expires_at) VALUES (1, 'guest-cookie-hash', datetime('now'), datetime('now', '+1 hour'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO transfers (public_key, owner_guest_id, storage_source_id, pickup_code_hash, require_code, created_at, updated_at)
  VALUES ('guest-send', 1, 1, '', 0, datetime('now'), datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`DELETE FROM transfer_guest_identities WHERE id = 1`); err == nil {
		t.Fatal("guest identity deletion bypasses historical task ownership")
	}

	// 子表外键仍受强制；重复 public_key 被唯一约束拒绝。
	if _, err := conn.Exec(`INSERT INTO transfer_submissions (collection_id, created_at) VALUES (999, datetime('now'))`); err == nil {
		t.Fatal("migration lost foreign key enforcement")
	}
	if _, err := conn.Exec(`INSERT INTO transfer_files (transfer_id, relative_path, size, created_at) VALUES (?, 'send.txt', 4, datetime('now'))`, sendID); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO transfers (public_key, owner_user_id, storage_source_id, pickup_code_hash, created_at, updated_at)
  VALUES ('legacy-send', 1, 1, '', datetime('now'), datetime('now'))`); err == nil {
		t.Fatal("duplicate public key accepted")
	}
}
