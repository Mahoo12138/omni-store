package db

import (
	"fmt"
	"testing"

	"github.com/omni-store/omnistore/migrations"
)

func TestStaticProtocolMigrationPreservesPublishedIdentity(t *testing.T) {
	for _, enabled := range []int{0, 1} {
		t.Run(fmt.Sprintf("enabled-%d", enabled), func(t *testing.T) {
			conn := newLegacyDB(t)
			if _, err := conn.Exec(`INSERT INTO storage_sources (key, name, root_path, created_at, updated_at)
 VALUES ('src-blog', 'Blog', '/example/blog', datetime('now'), datetime('now'))`); err != nil {
				t.Fatal(err)
			}
			content, err := migrations.FS.ReadFile("v2.0.0.sql")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(`PRAGMA foreign_keys=OFF`); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(string(content)); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(`INSERT INTO schema_migrations VALUES ('v2.0.0', datetime('now'))`); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(`UPDATE site_capability_bindings SET enabled = ?, storage_source_id = 1, revision = 7 WHERE capability = 'static_assets'`, enabled); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(`UPDATE static_asset_settings SET publish_root = 'media', public_asset_id = 'ast-0123456789abcdef0123456789abcdef', public_origin = 'https://assets.example.test', cache_mode = 'no-cache', cors_mode = 'allowlist'`); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(`INSERT INTO static_asset_origins (origin, created_at) VALUES ('https://blog.example.test', datetime('now'))`); err != nil {
				t.Fatal(err)
			}
			if err := Migrate(conn); err != nil {
				t.Fatal(err)
			}
			var sourceID, gotEnabled, revision int
			var root, id, origin, cache, cors string
			if err := conn.QueryRow(`SELECT storage_source_id, enabled, revision, publish_root, public_asset_id, public_origin, cache_mode, cors_mode FROM source_static_access`).Scan(&sourceID, &gotEnabled, &revision, &root, &id, &origin, &cache, &cors); err != nil {
				t.Fatal(err)
			}
			if sourceID != 1 || gotEnabled != enabled || revision != 7 || root != "media" || id != "ast-0123456789abcdef0123456789abcdef" || origin != "https://assets.example.test" || cache != "no-cache" || cors != "allowlist" {
				t.Fatalf("migration changed identity/config: %d %d %d %q %q %q %q %q", sourceID, gotEnabled, revision, root, id, origin, cache, cors)
			}
			var allowed string
			if err := conn.QueryRow(`SELECT origin FROM source_static_origins WHERE storage_source_id = 1`).Scan(&allowed); err != nil || allowed != "https://blog.example.test" {
				t.Fatalf("origins=%q err=%v", allowed, err)
			}
			if err := Migrate(conn); err != nil {
				t.Fatal(err)
			}
			var count int
			if err := conn.QueryRow(`SELECT COUNT(*) FROM site_capability_bindings`).Scan(&count); err != nil || count != 3 {
				t.Fatalf("capabilities count=%d err=%v", count, err)
			}
			if _, err := conn.Exec(`INSERT INTO site_capability_bindings VALUES ('static_assets', 0, NULL, 0, datetime('now'))`); err == nil {
				t.Fatal("static access must no longer be a site capability")
			}
			if _, err := conn.Exec(`DELETE FROM storage_sources WHERE id = 1`); err == nil {
				t.Fatal("migration lost deletion guard")
			}
		})
	}
}
