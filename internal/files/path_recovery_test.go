package files

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
)

func TestMoveMetadataFailureRollsBackFilesystemAndAllMetadata(t *testing.T) {
	service, source, _, sourceRoot, _, userID := newTransferRecoveryFixture(t)
	seedLinkedPath(t, service, source, userID, "before.txt")
	if _, err := service.db.Exec(`CREATE TRIGGER fail_path_record_move
  BEFORE UPDATE OF relative_path ON file_records BEGIN SELECT RAISE(FAIL, 'injected move failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := service.MoveWithLockTokens(source, "before.txt", "after.txt", nil, &userID); err == nil {
		t.Fatal("move unexpectedly succeeded")
	}
	if _, err := service.db.Exec(`DROP TRIGGER fail_path_record_move`); err != nil {
		t.Fatal(err)
	}
	if content, err := os.ReadFile(filepath.Join(sourceRoot, "before.txt")); err != nil || string(content) != "linked" {
		t.Fatalf("rolled back source=%q err=%v", content, err)
	}
	if _, err := os.Lstat(filepath.Join(sourceRoot, "after.txt")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("failed move left target: %v", err)
	}
	assertLinkedPath(t, service, source.ID, "before.txt")
	assertNoLinkedPath(t, service, source.ID, "after.txt")
	if count, err := service.SourcePathOperationCount(source.ID); err != nil || count != 0 {
		t.Fatalf("path operation count=%d err=%v", count, err)
	}
}

func TestRecoverDeleteCompletesAfterMetadataFailure(t *testing.T) {
	service, source, _, sourceRoot, _, userID := newTransferRecoveryFixture(t)
	seedLinkedPath(t, service, source, userID, "delete.txt")
	if _, err := service.db.Exec(`CREATE TRIGGER fail_path_record_delete
  BEFORE DELETE ON file_records BEGIN SELECT RAISE(FAIL, 'injected delete failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := service.DeleteWithLockTokens(source, "delete.txt", nil, &userID); err == nil {
		t.Fatal("delete unexpectedly succeeded")
	}
	if _, err := os.Lstat(filepath.Join(sourceRoot, "delete.txt")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("physical target remains after delete: %v", err)
	}
	// images、shares 和 file_records 位于同一事务；末尾注入失败后均应保留。
	assertLinkedPath(t, service, source.ID, "delete.txt")
	if count, err := service.SourcePathOperationCount(source.ID); err != nil || count != 1 {
		t.Fatalf("path operation count=%d err=%v", count, err)
	}
	if count, err := service.UserPathOperationCount(userID); err != nil || count != 1 {
		t.Fatalf("user path operation count=%d err=%v", count, err)
	}
	if _, err := service.db.Exec(`DROP TRIGGER fail_path_record_delete`); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverPathOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedDeletes != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	assertNoLinkedPath(t, service, source.ID, "delete.txt")
	assertNoPathOperation(t, service)
}

func TestRecoverMoveUsesDatabaseMarkerAsCommitBoundary(t *testing.T) {
	for _, databaseReady := range []bool{false, true} {
		name := "rollback"
		if databaseReady {
			name = "committed"
		}
		t.Run(name, func(t *testing.T) {
			service, source, _, sourceRoot, _, userID := newTransferRecoveryFixture(t)
			seedLinkedPath(t, service, source, userID, "before.txt")
			op := service.newPathOperation(pathOperationMove, source, "before.txt", "after.txt", false, &userID)
			if err := service.writePathOperation(op); err != nil {
				t.Fatal(err)
			}
			if err := os.Rename(filepath.Join(sourceRoot, "before.txt"), filepath.Join(sourceRoot, "after.txt")); err != nil {
				t.Fatal(err)
			}
			if err := service.markPathFilesystemReady(op.OperationID); err != nil {
				t.Fatal(err)
			}
			if err := service.movePathMetadata(source.ID, "before.txt", "after.txt", false, &userID); err != nil {
				t.Fatal(err)
			}
			if databaseReady {
				if err := service.markPathDatabaseReady(op.OperationID); err != nil {
					t.Fatal(err)
				}
			}

			result, err := service.RecoverPathOperations()
			if err != nil {
				t.Fatal(err)
			}
			expectedPath := "before.txt"
			if databaseReady {
				expectedPath = "after.txt"
				if result.CompletedMoves != 1 {
					t.Fatalf("unexpected committed result: %+v", result)
				}
			} else if result.RolledBackMoves != 1 {
				t.Fatalf("unexpected rollback result: %+v", result)
			}
			if content, err := os.ReadFile(filepath.Join(sourceRoot, expectedPath)); err != nil || string(content) != "linked" {
				t.Fatalf("recovered target=%q err=%v", content, err)
			}
			assertLinkedPath(t, service, source.ID, expectedPath)
			otherPath := "after.txt"
			if databaseReady {
				otherPath = "before.txt"
			}
			assertNoLinkedPath(t, service, source.ID, otherPath)
			assertNoPathOperation(t, service)
		})
	}
}

func seedLinkedPath(t *testing.T, service *Service, source *models.StorageSource, userID int64, relPath string) {
	t.Helper()
	dir, name := filepath.Split(relPath)
	dir = strings.TrimSuffix(filepath.ToSlash(dir), "/")
	if dir != "" {
		if err := os.MkdirAll(filepath.Join(source.RootPath, filepath.FromSlash(dir)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := service.UploadWithLockTokens(source, dir, name, strings.NewReader("linked"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES ('img-path-linked', 'user', ?, ?, ?, 'linked.txt', '/i/img-path-linked.txt', 6,
   'text/plain', 1, 1, 'txt', CURRENT_TIMESTAMP)`, userID, source.ID, relPath); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO file_shares
  (share_key, storage_source_id, relative_path, entry_type, created_by_user_id,
   max_downloads, download_count, created_at)
  VALUES ('shr-path-linked', ?, ?, 'file', ?, 0, 0, CURRENT_TIMESTAMP)`, source.ID, relPath, userID); err != nil {
		t.Fatal(err)
	}
}

func assertLinkedPath(t *testing.T, service *Service, sourceID int64, relPath string) {
	t.Helper()
	for table, condition := range map[string]string{
		"images":       "storage_source_id = ? AND relative_path = ?",
		"file_shares":  "storage_source_id = ? AND relative_path = ? AND trash_key IS NULL",
		"file_records": "storage_source_id = ? AND relative_path = ? AND record_status = 'active'",
	} {
		var count int
		if err := service.db.QueryRow("SELECT COUNT(*) FROM "+table+" WHERE "+condition, sourceID, relPath).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("%s path %s count=%d", table, relPath, count)
		}
	}
}

func assertNoLinkedPath(t *testing.T, service *Service, sourceID int64, relPath string) {
	t.Helper()
	for _, table := range []string{"images", "file_shares", "file_records"} {
		var count int
		if err := service.db.QueryRow("SELECT COUNT(*) FROM "+table+" WHERE storage_source_id = ? AND relative_path = ?", sourceID, relPath).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("unexpected %s path %s count=%d", table, relPath, count)
		}
	}
}

func assertNoPathOperation(t *testing.T, service *Service) {
	t.Helper()
	entries, err := os.ReadDir(service.pathOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("path recovery artifacts remain: %+v", entries)
	}
}
