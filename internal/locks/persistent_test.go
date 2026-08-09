package locks_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/locks"
)

func TestPersistentStoreLifecycleAndMutationGuard(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	ctx := context.Background()
	userID, sourceID, otherSourceID := seedPersistentLockRelations(t, conn)
	store := locks.NewPersistentStore(conn)

	created, err := store.Create(ctx, sourceID, "docs", locks.DepthInfinity, "<owner>release</owner>", userID, 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(created.Token, "urn:uuid:") || created.Depth != locks.DepthInfinity || created.OwnerUserID != userID {
		t.Fatalf("unexpected created lock: %+v", created)
	}

	// A new store instance represents a process restart and must see the same lock.
	restarted := locks.NewPersistentStore(conn)
	discovered, err := restarted.Discover(ctx, sourceID, "docs/guide/readme.md")
	if err != nil || len(discovered) != 1 || discovered[0].Token != created.Token {
		t.Fatalf("Discover()=%+v, %v", discovered, err)
	}
	if _, err := restarted.Create(ctx, sourceID, "docs/guide", locks.DepthZero, "", userID, time.Minute); !errors.Is(err, locks.ErrPersistentLocked) {
		t.Fatalf("overlapping Create() error=%v", err)
	}
	otherLock, err := restarted.Create(ctx, otherSourceID, "docs", locks.DepthInfinity, "", userID, time.Minute)
	if err != nil {
		t.Fatalf("same path in another source should be independent: %v", err)
	}

	if _, err := restarted.GuardMutation(ctx, sourceID, []locks.MutationScope{{Path: "docs/guide", IncludeDescendants: true}}, nil, &userID); !errors.Is(err, locks.ErrPersistentLocked) {
		t.Fatalf("GuardMutation() without token error=%v", err)
	}
	wrongOwner := userID + 1
	if _, err := restarted.GuardMutation(ctx, sourceID, []locks.MutationScope{{Path: "docs/guide"}}, []string{created.Token}, &wrongOwner); !errors.Is(err, locks.ErrPersistentLocked) {
		t.Fatalf("GuardMutation() with wrong owner error=%v", err)
	}
	finish, err := restarted.GuardMutation(ctx, sourceID, []locks.MutationScope{{Path: "docs/guide", IncludeDescendants: true}}, []string{created.Token}, &userID)
	if err != nil {
		t.Fatalf("GuardMutation() with matching token: %v", err)
	}
	if err := finish("docs"); err != nil {
		t.Fatal(err)
	}
	if err := finish("docs"); err != nil {
		t.Fatalf("finish must be idempotent: %v", err)
	}
	if discovered, err := restarted.Discover(ctx, sourceID, "docs"); err != nil || len(discovered) != 0 {
		t.Fatalf("removed-root lock remained: %+v, %v", discovered, err)
	}
	if discovered, err := restarted.Discover(ctx, otherSourceID, "docs/child"); err != nil || len(discovered) != 1 {
		t.Fatalf("other source lock was removed: %+v, %v", discovered, err)
	}

	refreshed, err := restarted.Refresh(ctx, otherLock.Token, userID, otherSourceID, "docs/child", 10*time.Minute)
	if err != nil || !refreshed.ExpiresAt.After(otherLock.ExpiresAt) {
		t.Fatalf("Refresh()=%+v, %v", refreshed, err)
	}
	if _, err := restarted.Refresh(ctx, otherLock.Token, wrongOwner, otherSourceID, "docs", time.Minute); !errors.Is(err, locks.ErrLockForbidden) {
		t.Fatalf("wrong-owner Refresh() error=%v", err)
	}
	if _, err := restarted.Refresh(ctx, otherLock.Token, userID, sourceID, "docs", time.Minute); !errors.Is(err, locks.ErrLockNotFound) {
		t.Fatalf("wrong-source Refresh() error=%v", err)
	}
	if err := restarted.Unlock(ctx, otherLock.Token, wrongOwner, otherSourceID, "docs"); !errors.Is(err, locks.ErrLockForbidden) {
		t.Fatalf("wrong-owner Unlock() error=%v", err)
	}
	if err := restarted.Unlock(ctx, otherLock.Token, userID, otherSourceID, "docs/child"); err != nil {
		t.Fatalf("Unlock(): %v", err)
	}
	if err := restarted.Unlock(ctx, otherLock.Token, userID, otherSourceID, "docs"); !errors.Is(err, locks.ErrLockNotFound) {
		t.Fatalf("second Unlock() error=%v", err)
	}

	expired, err := restarted.Create(ctx, sourceID, "expired.txt", locks.DepthZero, "", userID, -time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if count, err := restarted.CleanupExpired(ctx); err != nil || count != 1 {
		t.Fatalf("CleanupExpired()=%d, %v for %s", count, err, expired.Token)
	}
	if err := restarted.Delete(ctx, "missing-token"); err != nil {
		t.Fatalf("Delete() should be idempotent: %v", err)
	}
}

func seedPersistentLockRelations(t *testing.T, conn *sql.DB) (int64, int64, int64) {
	t.Helper()
	now := time.Now().UTC()
	userResult, err := conn.Exec(`INSERT INTO users
  (user_public_id, username, display_name, password_hash, role, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`, "u_locktest", "lock-user", "Lock User", "not-used", "user", now, now)
	if err != nil {
		t.Fatal(err)
	}
	userID, err := userResult.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	insertSource := func(key, name, root string) int64 {
		result, err := conn.Exec(`INSERT INTO storage_sources (key, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, key, name, root, now, now)
		if err != nil {
			t.Fatal(err)
		}
		id, err := result.LastInsertId()
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	return userID, insertSource("src-lock-a", "Lock A", "/tmp/lock-a"), insertSource("src-lock-b", "Lock B", "/tmp/lock-b")
}
