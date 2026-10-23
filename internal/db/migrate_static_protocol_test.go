package db

import (
	"testing"
)

// 合并后的 2.0.0 迁移把静态 HTTP 改为按源独立配置，且不自动发布任何源：
// 旧 public_read_enabled/public_mount_path 只用于收敛公开网盘绑定。
func TestStaticAccessMigrationKeepsSourcesUnpublished(t *testing.T) {
	conn := newLegacyDB(t)
	for _, statement := range []string{
		`INSERT INTO storage_sources (key, name, root_path, public_read_enabled, public_mount_path, created_at, updated_at)
  VALUES ('src-blog', 'Blog', '/example/blog', 1, 'media', datetime('now'), datetime('now'))`,
		`INSERT INTO storage_sources (key, name, root_path, created_at, updated_at)
  VALUES ('src-plain', 'Plain', '/example/plain', datetime('now'), datetime('now'))`,
	} {
		if _, err := conn.Exec(statement); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if err := Migrate(conn); err != nil {
		t.Fatal(err)
	}

	var count int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM source_static_access`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("upgrade must not publish a source: count=%d err=%v", count, err)
	}
	if err := conn.QueryRow(`SELECT COUNT(*) FROM site_capability_bindings`).Scan(&count); err != nil || count != 3 {
		t.Fatalf("capabilities count=%d err=%v", count, err)
	}
	if _, err := conn.Exec(`INSERT INTO site_capability_bindings VALUES ('static_assets', 0, NULL, 0, datetime('now'))`); err == nil {
		t.Fatal("static access must no longer be a site capability")
	}
	// 公开网盘绑定仍从旧挂载收敛，但不等于发布静态资源。
	var sourceID int64
	if err := conn.QueryRow(`SELECT storage_source_id FROM site_capability_bindings WHERE capability = 'public_drive'`).Scan(&sourceID); err != nil || sourceID != 1 {
		t.Fatalf("public_drive source=%d err=%v", sourceID, err)
	}

	// 先解除绑定，后续删除保护只由静态发布配置决定。
	if _, err := conn.Exec(`UPDATE site_capability_bindings SET enabled = 0, storage_source_id = NULL WHERE capability = 'public_drive'`); err != nil {
		t.Fatal(err)
	}

	// 显式发布后才有一行配置；缓存/CORS 取值受 CHECK 约束。
	if _, err := conn.Exec(`INSERT INTO source_static_access
  (storage_source_id, enabled, publish_root, public_asset_id, public_origin, cache_mode, cors_mode, revision, updated_at)
  VALUES (1, 1, 'media', 'ast-0123456789abcdef0123456789abcdef', 'https://assets.example.test', 'no-cache', 'allowlist', 7, datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO source_static_origins (storage_source_id, origin, created_at) VALUES (1, 'https://blog.example.test', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE source_static_access SET cache_mode = 'forever' WHERE storage_source_id = 1`); err == nil {
		t.Fatal("invalid cache mode accepted")
	}
	if _, err := conn.Exec(`UPDATE source_static_access SET cors_mode = 'open' WHERE storage_source_id = 1`); err == nil {
		t.Fatal("invalid cors mode accepted")
	}
	// 有发布配置的源不能删除；撤销配置后允许删除，白名单随配置级联清理。
	if _, err := conn.Exec(`DELETE FROM storage_sources WHERE id = 1`); err == nil {
		t.Fatal("migration lost static access deletion guard")
	}
	if _, err := conn.Exec(`DELETE FROM source_static_access WHERE storage_source_id = 1`); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`SELECT COUNT(*) FROM source_static_origins`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("origins survived access removal: count=%d err=%v", count, err)
	}
	if _, err := conn.Exec(`DELETE FROM storage_sources WHERE id = 1`); err != nil {
		t.Fatalf("deleting an unpublished source must succeed: %v", err)
	}
}
