// Package locks 实现请求级内存路径读写锁（README §15）。
// MVP 只支持单实例，锁在进程内存中，不做持久锁和分布式锁。
package locks

import "sync"

// Manager 管理按 key 的读写锁。key = source_id + "\x00" + normalized_relative_path。
// 所有入口（REST、WebDAV、图床、公开 raw）必须共用同一个 Manager。
type Manager struct {
	mu      sync.Mutex
	entries map[string]*entry
}

type entry struct {
	refs int
	mu   sync.RWMutex
}

// NewManager 创建锁管理器。
func NewManager() *Manager {
	return &Manager{entries: make(map[string]*entry)}
}

// Key 构造锁 key。
func Key(sourceID, relPath string) string {
	return sourceID + "\x00" + relPath
}

func (m *Manager) acquire(key string) *entry {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.entries[key]
	if !ok {
		e = &entry{}
		m.entries[key] = e
	}
	e.refs++
	return e
}

func (m *Manager) release(key string, e *entry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e.refs--
	if e.refs == 0 {
		delete(m.entries, key)
	}
}

// RLock 获取读锁，返回解锁函数。用于下载、列表、文件信息。
func (m *Manager) RLock(key string) func() {
	e := m.acquire(key)
	e.mu.RLock()
	return func() {
		e.mu.RUnlock()
		m.release(key, e)
	}
}

// Lock 获取写锁，返回解锁函数。用于上传、删除、重命名、移动、创建目录。
func (m *Manager) Lock(key string) func() {
	e := m.acquire(key)
	e.mu.Lock()
	return func() {
		e.mu.Unlock()
		m.release(key, e)
	}
}

// LockPair 对两个 key 按固定顺序加写锁，避免死锁（README §15.3）。
// 用于移动 / 重命名的源路径和目标路径。
func (m *Manager) LockPair(key1, key2 string) func() {
	if key1 == key2 {
		return m.Lock(key1)
	}
	if key1 > key2 {
		key1, key2 = key2, key1
	}
	unlock1 := m.Lock(key1)
	unlock2 := m.Lock(key2)
	return func() {
		unlock2()
		unlock1()
	}
}
