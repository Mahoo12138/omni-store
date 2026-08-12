package files

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
)

type subtreeNameCase struct {
	name      string
	moving    string
	protected string
}

var subtreeNameCases = []subtreeNameCase{
	{name: "percent is literal", moving: "a%", protected: "abc"},
	{name: "underscore is literal", moving: "a_", protected: "a1"},
	{name: "prefix is not descendant", moving: "foo", protected: "foobar"},
}

func TestSubtreeOperationsUseLiteralSegmentBoundaries(t *testing.T) {
	operations := []struct {
		name string
		run  func(*testing.T, subtreeNameCase)
	}{
		{name: "same source move", run: testSameSourceSubtreeMove},
		{name: "cross source move", run: testCrossSourceSubtreeMove},
		{name: "copy rollback", run: testSubtreeCopyRollback},
		{name: "trash and restore", run: testSubtreeTrashRestore},
		{name: "permanent delete", run: testSubtreePermanentDelete},
	}
	for _, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			for _, names := range subtreeNameCases {
				t.Run(names.name, func(t *testing.T) {
					operation.run(t, names)
				})
			}
		})
	}
}

func testSameSourceSubtreeMove(t *testing.T, names subtreeNameCase) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTransferUser(t, service, 0)
	seedLinkedSubtreePair(t, service, source, userID, names)

	if _, err := service.MoveWithLockTokens(source, names.moving, "moved", nil, &userID); err != nil {
		t.Fatal(err)
	}
	assertLinkedPath(t, service, source.ID, names.protected+"/note.txt")
	assertLinkedPath(t, service, source.ID, "moved/note.txt")
	assertSubtreeFile(t, root, names.protected, names.protected)
}

func testCrossSourceSubtreeMove(t *testing.T, names subtreeNameCase) {
	service, source, target, sourceRoot, targetRoot, userID := newTransferRecoveryFixture(t)
	seedLinkedSubtreePair(t, service, source, userID, names)

	if _, err := service.MoveAcrossSources(source, target, names.moving, "moved", &userID); err != nil {
		t.Fatal(err)
	}
	assertLinkedPath(t, service, source.ID, names.protected+"/note.txt")
	assertLinkedPath(t, service, target.ID, "moved/note.txt")
	assertSubtreeFile(t, sourceRoot, names.protected, names.protected)
	assertSubtreeFile(t, targetRoot, "moved", names.moving)
}

func testSubtreeCopyRollback(t *testing.T, names subtreeNameCase) {
	service, source, target, _, targetRoot, userID := newTransferRecoveryFixture(t)
	if _, err := service.Mkdir(source, "", "origin"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "origin", "note.txt", strings.NewReader("origin"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	seedLinkedSubtree(t, service, target, userID, names.protected, 1)

	plan, err := service.buildTransferPlan(source, target, "origin", names.moving)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.executeTransferCopy(plan); err != nil {
		t.Fatal(err)
	}
	if err := service.syncTransferRecords(source, target, plan, false, &userID); err != nil {
		t.Fatal(err)
	}
	if err := service.rollbackTransferTarget(target, plan); err != nil {
		t.Fatal(err)
	}

	assertLinkedPath(t, service, target.ID, names.protected+"/note.txt")
	assertSubtreeFile(t, targetRoot, names.protected, names.protected)
	assertNoLinkedPath(t, service, target.ID, names.moving+"/note.txt")
}

func testSubtreeTrashRestore(t *testing.T, names subtreeNameCase) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTransferUser(t, service, 0)
	seedLinkedSubtreePair(t, service, source, userID, names)

	entry, err := service.MoveToTrash(source, names.moving, userID)
	if err != nil {
		t.Fatal(err)
	}
	assertLinkedPath(t, service, source.ID, names.protected+"/note.txt")
	assertSubtreeFile(t, root, names.protected, names.protected)
	if _, err := service.RestoreTrash(source, entry.Key, "restored", userID); err != nil {
		t.Fatal(err)
	}
	assertLinkedPath(t, service, source.ID, names.protected+"/note.txt")
	assertLinkedPath(t, service, source.ID, "restored/note.txt")
	assertSubtreeFile(t, root, "restored", names.moving)
}

func testSubtreePermanentDelete(t *testing.T, names subtreeNameCase) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTransferUser(t, service, 0)
	seedLinkedSubtreePair(t, service, source, userID, names)

	if err := service.DeleteWithLockTokens(source, names.moving, nil, &userID); err != nil {
		t.Fatal(err)
	}
	assertLinkedPath(t, service, source.ID, names.protected+"/note.txt")
	assertNoLinkedPath(t, service, source.ID, names.moving+"/note.txt")
	assertSubtreeFile(t, root, names.protected, names.protected)
}

func seedLinkedSubtreePair(t *testing.T, service *Service, source *models.StorageSource, userID int64, names subtreeNameCase) {
	t.Helper()
	seedLinkedSubtree(t, service, source, userID, names.moving, 0)
	seedLinkedSubtree(t, service, source, userID, names.protected, 1)
}

func seedLinkedSubtree(t *testing.T, service *Service, source *models.StorageSource, userID int64, dir string, ordinal int) {
	t.Helper()
	if _, err := service.Mkdir(source, "", dir); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, dir, "note.txt", strings.NewReader(dir), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	relPath := dir + "/note.txt"
	id := fmt.Sprintf("%d-%d", source.ID, ordinal)
	if _, err := service.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES (?, 'user', ?, ?, ?, 'note.txt', ?, ?, 'text/plain', 1, 1, 'txt', CURRENT_TIMESTAMP)`,
		"img-subtree-"+id, userID, source.ID, relPath, "/i/img-subtree-"+id+".txt", len(dir)); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO file_shares
  (share_key, storage_source_id, relative_path, entry_type, created_by_user_id,
   max_downloads, download_count, created_at)
  VALUES (?, ?, ?, 'file', ?, 0, 0, CURRENT_TIMESTAMP)`, "shr-subtree-"+id, source.ID, relPath, userID); err != nil {
		t.Fatal(err)
	}
}

func assertSubtreeFile(t *testing.T, root, dir, want string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(root, dir, "note.txt"))
	if err != nil || string(content) != want {
		t.Fatalf("file %s/note.txt=%q err=%v", dir, content, err)
	}
}
