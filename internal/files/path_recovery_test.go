package files

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/managedroot"
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

func TestRecoverCommittedDeletePreservesReplacementAndMetadata(t *testing.T) {
	for _, directory := range []bool{false, true} {
		name, payload := "reused.txt", "reused.txt"
		if directory {
			name, payload = "reused", "reused/child.txt"
		}
		t.Run(name, func(t *testing.T) {
			service, source, _, sourceRoot, _, userID := newTransferRecoveryFixture(t)
			seedLinkedPath(t, service, source, userID, payload)
			op := service.newPathOperation(pathOperationDelete, source, name, "", directory, &userID)
			if err := service.writePathOperation(op); err != nil {
				t.Fatal(err)
			}
			if err := os.RemoveAll(filepath.Join(sourceRoot, name)); err != nil {
				t.Fatal(err)
			}
			if err := service.markPathFilesystemReady(op.OperationID); err != nil {
				t.Fatal(err)
			}
			if err := service.deletePathMetadata(source.ID, name, directory); err != nil {
				t.Fatal(err)
			}
			if err := service.markPathDatabaseReady(op.OperationID); err != nil {
				t.Fatal(err)
			}
			// A completed delete whose journal cleanup failed must not own a
			// subsequently recreated object, even when its path is identical.
			seedLinkedPath(t, service, source, userID, payload)
			result, err := service.RecoverPathOperations()
			if err != nil || result.CompletedDeletes != 1 {
				t.Fatalf("recover completed delete: %+v, %v", result, err)
			}
			if data, err := os.ReadFile(filepath.Join(sourceRoot, payload)); err != nil || string(data) != "linked" {
				t.Fatalf("replacement was deleted: %q, %v", data, err)
			}
			assertLinkedPath(t, service, source.ID, payload)
			assertNoPathOperation(t, service)
		})
	}
}

func TestRecoverManagedDeleteRejectsUnownedAndNestedRoots(t *testing.T) {
	for _, name := range []string{"unknown", "foreign-marker", "nested"} {
		t.Run(name, func(t *testing.T) {
			service, source, otherSource, _ := newManagedNamespaceService(t)
			rel := ".omnistore/transfer/send/package"
			if name == "nested" {
				rel = "ordinary/" + rel
			}
			if name == "foreign-marker" {
				owner := managedroot.NewService(service.db)
				for _, src := range []*models.StorageSource{source, otherSource} {
					if err := owner.Ensure(src); err != nil {
						t.Fatal(err)
					}
				}
				marker, err := os.ReadFile(filepath.Join(otherSource.RootPath, ".omnistore", "managed-root.json"))
				if err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(source.RootPath, ".omnistore", "managed-root.json"), marker, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			payload := filepath.Join(source.RootPath, filepath.FromSlash(rel), "preserve.txt")
			if err := os.MkdirAll(filepath.Dir(payload), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(payload, []byte("foreign-owned"), 0o600); err != nil {
				t.Fatal(err)
			}
			op := service.newPathOperation(pathOperationDelete, source, rel, "", true, nil)
			if err := service.writePathOperation(op); err != nil {
				t.Fatal(err)
			}
			if _, err := service.RecoverPathOperations(); err == nil {
				t.Fatal("recovery accepted an unowned or nested managed root")
			} else if name == "unknown" && !errors.Is(err, managedroot.ErrUnknownRoot) {
				t.Fatalf("unknown-root error = %v", err)
			} else if name == "foreign-marker" && !errors.Is(err, managedroot.ErrOwnershipMismatch) {
				t.Fatalf("foreign-marker error = %v", err)
			}
			if data, err := os.ReadFile(payload); err != nil || string(data) != "foreign-owned" {
				t.Fatalf("unowned payload changed: %q, %v", data, err)
			}
			if _, err := os.Stat(service.pathOperationPath(op.OperationID)); err != nil {
				t.Fatalf("failed recovery removed evidence: %v", err)
			}
		})
	}
}

func TestPendingManagedPathWriteGuardsRecoveryScopes(t *testing.T) {
	service, source, otherSource, _ := newManagedNamespaceService(t)
	from := ".omnistore/transfer/send/package"
	to := ".omnistore/transfer/send/moved"
	for _, tc := range []struct {
		name      string
		kind      string
		targets   []string
		committed bool
		other     bool
		blocked   bool
	}{
		{"delete exact", pathOperationDelete, []string{from}, false, false, true},
		{"delete descendant", pathOperationDelete, []string{from + "/file.txt"}, false, false, true},
		{"delete ancestor", pathOperationDelete, []string{".omnistore/transfer/send"}, false, false, true},
		{"delete prefix sibling", pathOperationDelete, []string{from + "-other/file.txt"}, false, false, false},
		{"delete other scope", pathOperationDelete, []string{".omnistore/image-bed/image.png"}, false, false, false},
		{"delete other source", pathOperationDelete, []string{from + "/file.txt"}, false, true, false},
		{"delete committed reusable", pathOperationDelete, []string{from + "/file.txt"}, true, false, false},
		{"move source", pathOperationMove, []string{from + "/file.txt"}, false, false, true},
		{"move destination", pathOperationMove, []string{to + "/file.txt"}, false, false, true},
		{"move ancestor", pathOperationMove, []string{".omnistore/transfer"}, false, false, true},
		{"move unrelated", pathOperationMove, []string{to + "-other/file.txt"}, false, false, false},
		{"move committed still guarded", pathOperationMove, []string{to + "/file.txt"}, true, false, true},
		{"temporary path also guarded", pathOperationDelete, []string{".omnistore/transfer/other/file.txt", from + "/.omnistore-upload-0123456789abcdef.tmp"}, false, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			destination := ""
			if tc.kind == pathOperationMove {
				destination = to
			}
			op := service.newPathOperation(tc.kind, source, from, destination, true, nil)
			if err := service.writePathOperation(op); err != nil {
				t.Fatal(err)
			}
			if tc.committed {
				if err := service.markPathDatabaseReady(op.OperationID); err != nil {
					t.Fatal(err)
				}
			}
			sourceID := source.ID
			if tc.other {
				sourceID = otherSource.ID
			}
			err := service.guardPendingManagedPathWrite(sourceID, tc.targets...)
			if (err != nil) != tc.blocked {
				t.Fatalf("guard blocked=%v, want %v: %v", err != nil, tc.blocked, err)
			}
			if _, err := os.Stat(service.pathOperationPath(op.OperationID)); err != nil {
				t.Fatalf("guard mutated pending operation: %v", err)
			}
			if _, err := os.Stat(filepath.Join(source.RootPath, ".omnistore")); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("guard created managed path: %v", err)
			}
			if err := service.removePathOperation(op.OperationID); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestPendingManagedPathWriteRejectsInvalidRecoveryEvidence(t *testing.T) {
	for _, state := range []string{"malformed-journal", "journal-symlink", "marker-symlink"} {
		t.Run(state, func(t *testing.T) {
			service, source, _, _ := newManagedNamespaceService(t)
			rel := ".omnistore/transfer/send/package/file.txt"
			op := service.newPathOperation(pathOperationDelete, source, rel, "", false, nil)
			if err := service.writePathOperation(op); err != nil {
				t.Fatal(err)
			}
			switch state {
			case "malformed-journal":
				if err := os.WriteFile(service.pathOperationPath(op.OperationID), []byte("{truncated"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "journal-symlink":
				if err := os.Remove(service.pathOperationPath(op.OperationID)); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink("missing-target", service.pathOperationPath(op.OperationID)); err != nil {
					t.Fatal(err)
				}
			case "marker-symlink":
				if err := os.Symlink("missing-target", service.pathDatabaseReadyPath(op.OperationID)); err != nil {
					t.Fatal(err)
				}
			}
			if err := service.guardPendingManagedPathWrite(source.ID, rel); err == nil {
				t.Fatal("invalid recovery evidence allowed path reuse")
			}
		})
	}
}

func TestManagedWriteCannotReusePendingDeleteBeforeMkdir(t *testing.T) {
	final := ".omnistore/transfer/send/package/file.txt"
	temp := ".omnistore/transfer/send/package/.omnistore-upload-0123456789abcdef.tmp"
	for _, pending := range []string{final, ".omnistore/transfer/send/package"} {
		t.Run(pending, func(t *testing.T) {
			service, source, _, _ := newManagedNamespaceService(t)
			op := service.newPathOperation(pathOperationDelete, source, pending, "", pending != final, nil)
			if err := service.writePathOperation(op); err != nil {
				t.Fatal(err)
			}
			if _, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", strings.NewReader("replacement"), 0, false); err == nil {
				t.Fatal("managed write reused an unresolved delete path")
			}
			if _, err := os.Stat(filepath.Join(source.RootPath, ".omnistore")); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("blocked write created a directory: %v", err)
			}
			if _, err := os.Stat(service.pathOperationPath(op.OperationID)); err != nil {
				t.Fatalf("blocked write changed recovery evidence: %v", err)
			}
		})
	}
}

func TestManagedWriteReusesCommittedDeleteAndSurvivesRecovery(t *testing.T) {
	service, source, _, _ := newManagedNamespaceService(t)
	if err := managedroot.NewService(service.db).Ensure(source); err != nil {
		t.Fatal(err)
	}
	final := ".omnistore/transfer/send/package/file.txt"
	temp := ".omnistore/transfer/send/package/.omnistore-upload-0123456789abcdef.tmp"
	op := service.newPathOperation(pathOperationDelete, source, ".omnistore/transfer/send/package", "", true, nil)
	if err := service.writePathOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := service.markPathDatabaseReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", strings.NewReader("replacement"), 0, false); err != nil {
		t.Fatalf("committed delete blocked a new write: %v", err)
	}
	if result, err := service.RecoverPathOperations(); err != nil || result.CompletedDeletes != 1 {
		t.Fatalf("recover committed managed delete: %+v, %v", result, err)
	}
	if data, err := os.ReadFile(filepath.Join(source.RootPath, filepath.FromSlash(final))); err != nil || string(data) != "replacement" {
		t.Fatalf("recovery deleted replacement managed payload: %q, %v", data, err)
	}
	assertNoPathOperation(t, service)
}

func TestRecoverPendingManagedDeleteChecksOwnershipThenCompletes(t *testing.T) {
	service, source, _, _ := newManagedNamespaceService(t)
	if err := managedroot.NewService(service.db).Ensure(source); err != nil {
		t.Fatal(err)
	}
	from := ".omnistore/transfer/send/package"
	for _, rel := range []string{from + "/file.txt", from + "-other/preserve.txt"} {
		if _, err := service.WriteManagedFile(source, rel, "transfer", strings.NewReader("payload"), 0, false); err != nil {
			t.Fatal(err)
		}
	}
	op := service.newPathOperation(pathOperationDelete, source, from, "", true, nil)
	if err := service.writePathOperation(op); err != nil {
		t.Fatal(err)
	}
	if result, err := service.RecoverPathOperations(); err != nil || result.CompletedDeletes != 1 {
		t.Fatalf("recover trusted managed delete: %+v, %v", result, err)
	}
	if _, err := os.Stat(filepath.Join(source.RootPath, filepath.FromSlash(from))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("trusted managed delete did not complete: %v", err)
	}
	if data, err := os.ReadFile(filepath.Join(source.RootPath, filepath.FromSlash(from+"-other/preserve.txt"))); err != nil || string(data) != "payload" {
		t.Fatalf("recovery changed unrelated managed payload: %q, %v", data, err)
	}
	if err := managedroot.NewService(service.db).Ensure(source); err != nil {
		t.Fatalf("recovery changed managed ownership: %v", err)
	}
	assertNoPathOperation(t, service)
	if result, err := service.RecoverPathOperations(); err != nil || result.CompletedDeletes != 0 {
		t.Fatalf("second recovery is not a no-op: %+v, %v", result, err)
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
		"images":       "storage_source_id = ? AND relative_path = ? AND trash_key IS NULL",
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
