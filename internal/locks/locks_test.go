package locks

import (
	"testing"
	"time"
)

func waitForManagerWaiters(t *testing.T, manager *Manager, expected int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		manager.mu.Lock()
		count := len(manager.waiters)
		manager.mu.Unlock()
		if count >= expected {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("lock waiters did not reach %d", expected)
}

func TestKeySeparatesSourceAndPath(t *testing.T) {
	if got, want := Key("src-a", "docs/file.txt"), "src-a\x00docs/file.txt"; got != want {
		t.Fatalf("Key()=%q want=%q", got, want)
	}
}

func TestManagerReadersShareLockAndWriterWaits(t *testing.T) {
	manager := NewManager()
	key := Key("src-a", "file.txt")
	unlockReader1 := manager.RLock(key)
	unlockReader2 := manager.RLock(key)

	writerAcquired := make(chan struct{})
	writerDone := make(chan struct{})
	go func() {
		unlockWriter := manager.Lock(key)
		close(writerAcquired)
		unlockWriter()
		close(writerDone)
	}()

	select {
	case <-writerAcquired:
		t.Fatal("writer acquired while readers still held the lock")
	case <-time.After(25 * time.Millisecond):
	}
	unlockReader1()
	select {
	case <-writerAcquired:
		t.Fatal("writer acquired before the final reader released")
	case <-time.After(25 * time.Millisecond):
	}
	unlockReader2()
	select {
	case <-writerDone:
	case <-time.After(time.Second):
		t.Fatal("writer did not acquire after readers released")
	}
	if len(manager.entries) != 0 {
		t.Fatalf("released lock entries leaked: %d", len(manager.entries))
	}
}

func TestLockPairOrdersKeysAndHandlesIdenticalKey(t *testing.T) {
	manager := NewManager()
	unlocks := manager.LockPair("z", "a")
	acquired := make(chan struct{})
	go func() {
		unlock := manager.LockPair("a", "z")
		close(acquired)
		unlock()
	}()
	select {
	case <-acquired:
		t.Fatal("second pair acquired before first pair released")
	case <-time.After(25 * time.Millisecond):
	}
	unlocks()
	select {
	case <-acquired:
	case <-time.After(time.Second):
		t.Fatal("reversed lock pair deadlocked")
	}

	unlockSame := manager.LockPair("same", "same")
	unlockSame()
	if len(manager.entries) != 0 {
		t.Fatalf("released lock entries leaked: %d", len(manager.entries))
	}
}

func TestManagerSerializesAncestorAndDescendantPathsButNotSiblings(t *testing.T) {
	manager := NewManager()
	unlockParent := manager.Lock(Key("src-a", "docs"))

	childAcquired := make(chan struct{})
	go func() {
		unlock := manager.Lock(Key("src-a", "docs/report.txt"))
		close(childAcquired)
		unlock()
	}()
	waitForManagerWaiters(t, manager, 1)
	siblingAcquired := make(chan struct{})
	go func() {
		unlock := manager.Lock(Key("src-a", "photos/image.jpg"))
		close(siblingAcquired)
		unlock()
	}()

	select {
	case <-childAcquired:
		t.Fatal("descendant writer acquired while ancestor writer was held")
	case <-time.After(25 * time.Millisecond):
	}
	select {
	case <-siblingAcquired:
	case <-time.After(time.Second):
		t.Fatal("non-overlapping sibling path was unnecessarily blocked")
	}
	unlockParent()
	select {
	case <-childAcquired:
	case <-time.After(time.Second):
		t.Fatal("descendant writer did not acquire after ancestor released")
	}
}

func TestManagerWriterWaitingOnAncestorBlocksNewDescendantReaders(t *testing.T) {
	manager := NewManager()
	unlockReader := manager.RLock(Key("src-a", "docs/report.txt"))
	writerAcquired := make(chan struct{})
	go func() {
		unlock := manager.Lock(Key("src-a", "docs"))
		close(writerAcquired)
		unlock()
	}()
	waitForManagerWaiters(t, manager, 1)

	lateReaderAcquired := make(chan struct{})
	go func() {
		unlock := manager.RLock(Key("src-a", "docs/other.txt"))
		close(lateReaderAcquired)
		unlock()
	}()
	waitForManagerWaiters(t, manager, 2)
	select {
	case <-lateReaderAcquired:
		t.Fatal("new descendant reader bypassed an earlier ancestor writer")
	case <-time.After(25 * time.Millisecond):
	}
	unlockReader()
	select {
	case <-writerAcquired:
	case <-time.After(time.Second):
		t.Fatal("ancestor writer did not acquire after reader released")
	}
	select {
	case <-lateReaderAcquired:
	case <-time.After(time.Second):
		t.Fatal("late reader did not acquire after writer completed")
	}
}

func TestManagerUsesPathSegmentBoundariesAndExactCoordinationKeys(t *testing.T) {
	if keysConflict(Key("src-a", "doc"), Key("src-a", "docs/file.txt")) {
		t.Fatal("path prefix without segment boundary must not conflict")
	}
	if keysConflict(Key("src-a", "docs"), Key("src-b", "docs/file.txt")) {
		t.Fatal("paths in different sources must not conflict")
	}
	if keysConflict("quota:src-a", "quota:src-a/child") {
		t.Fatal("coordination keys without path separator must use exact matching")
	}
}

func TestPersistentLockScopeRelations(t *testing.T) {
	if !lockCovers("docs", DepthInfinity, "docs/guide/readme.md") {
		t.Fatal("infinity lock should cover descendants")
	}
	if lockCovers("docs", DepthZero, "docs/readme.md") {
		t.Fatal("depth-zero lock must not cover descendants")
	}
	if lockCovers("doc", DepthInfinity, "docs/readme.md") {
		t.Fatal("path segment boundary was not respected")
	}
	if !lockScopesIntersect("docs", DepthInfinity, "docs/readme.md", DepthZero) {
		t.Fatal("parent infinity lock should intersect child lock")
	}
	if lockScopesIntersect("docs/a", DepthZero, "docs/b", DepthZero) {
		t.Fatal("siblings should not intersect")
	}

	lock := PersistentLock{RelativePath: "docs/locked.txt", Depth: DepthZero}
	if !mutationIntersectsLock(MutationScope{Path: "docs", IncludeDescendants: true}, lock) {
		t.Fatal("directory mutation should intersect a descendant lock")
	}
	if mutationIntersectsLock(MutationScope{Path: "docs", IncludeDescendants: false}, lock) {
		t.Fatal("non-recursive parent mutation should not intersect child lock")
	}
}
