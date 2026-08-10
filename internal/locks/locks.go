// Package locks 实现请求级内存路径读写锁（README §15）。
// MVP 只支持单实例，锁在进程内存中，不做持久锁和分布式锁。
package locks

import (
	"sort"
	"strings"
	"sync"
)

// Manager 管理按 key 的读写锁。文件路径 key = opaque_source_key + "\x00" +
// normalized_relative_path；同一来源内祖先与后代路径互相冲突，兄弟路径仍可并发。
// 不含分隔符的协调 key（例如 quota:*）继续只做精确匹配。
type Manager struct {
	mu      sync.Mutex
	cond    *sync.Cond
	entries map[string]*entry
	waiters []*waiter
}

type entry struct {
	readers int
	writers int
}

type waiter struct {
	keys  []string
	write bool
}

// NewManager 创建锁管理器。
func NewManager() *Manager {
	m := &Manager{entries: make(map[string]*entry)}
	m.cond = sync.NewCond(&m.mu)
	return m
}

// Key 构造锁 key。
func Key(sourceKey, relPath string) string {
	return sourceKey + "\x00" + relPath
}

func splitPathKey(key string) (source, relPath string, ok bool) {
	index := strings.IndexByte(key, 0)
	if index < 0 {
		return "", "", false
	}
	return key[:index], key[index+1:], true
}

func isSameOrDescendantPath(parent, child string) bool {
	return parent == "" || child == parent || strings.HasPrefix(child, parent+"/")
}

func keysConflict(left, right string) bool {
	if left == right {
		return true
	}
	leftSource, leftPath, leftIsPath := splitPathKey(left)
	rightSource, rightPath, rightIsPath := splitPathKey(right)
	if !leftIsPath || !rightIsPath || leftSource != rightSource {
		return false
	}
	return isSameOrDescendantPath(leftPath, rightPath) || isSameOrDescendantPath(rightPath, leftPath)
}

func normalizeKeys(keys []string) []string {
	ordered := append([]string(nil), keys...)
	sort.Strings(ordered)
	out := ordered[:0]
	for _, key := range ordered {
		if len(out) == 0 || out[len(out)-1] != key {
			out = append(out, key)
		}
	}
	return out
}

func waiterConflicts(left, right *waiter) bool {
	if !left.write && !right.write {
		return false
	}
	for _, leftKey := range left.keys {
		for _, rightKey := range right.keys {
			if keysConflict(leftKey, rightKey) {
				return true
			}
		}
	}
	return false
}

func (m *Manager) canAcquire(candidate *waiter) bool {
	for key, active := range m.entries {
		if active.writers == 0 && !candidate.write {
			continue
		}
		for _, candidateKey := range candidate.keys {
			if keysConflict(candidateKey, key) {
				return false
			}
		}
	}
	// 只阻止与更早等待者冲突的请求；不相交的兄弟路径可以越过队列并发。
	for _, queued := range m.waiters {
		if queued == candidate {
			break
		}
		if waiterConflicts(candidate, queued) {
			return false
		}
	}
	return true
}

func (m *Manager) acquire(keys []string, write bool) func() {
	keys = normalizeKeys(keys)
	candidate := &waiter{keys: keys, write: write}
	m.mu.Lock()
	m.waiters = append(m.waiters, candidate)
	for !m.canAcquire(candidate) {
		m.cond.Wait()
	}
	for index, queued := range m.waiters {
		if queued == candidate {
			m.waiters = append(m.waiters[:index], m.waiters[index+1:]...)
			break
		}
	}
	for _, key := range keys {
		active := m.entries[key]
		if active == nil {
			active = &entry{}
			m.entries[key] = active
		}
		if write {
			active.writers++
		} else {
			active.readers++
		}
	}
	m.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			m.mu.Lock()
			for _, key := range keys {
				active := m.entries[key]
				if write {
					active.writers--
				} else {
					active.readers--
				}
				if active.readers == 0 && active.writers == 0 {
					delete(m.entries, key)
				}
			}
			m.cond.Broadcast()
			m.mu.Unlock()
		})
	}
}

// RLock 获取读锁，返回解锁函数。用于下载、列表、文件信息。
func (m *Manager) RLock(key string) func() {
	return m.acquire([]string{key}, false)
}

// Lock 获取写锁，返回解锁函数。用于上传、删除、重命名、移动、创建目录。
func (m *Manager) Lock(key string) func() {
	return m.acquire([]string{key}, true)
}

// LockPair 原子获取两个写锁；路径范围由 Manager 统一判断，避免祖先/后代
// key 不完全相等时发生交叉等待。
func (m *Manager) LockPair(key1, key2 string) func() {
	return m.acquire([]string{key1, key2}, true)
}
