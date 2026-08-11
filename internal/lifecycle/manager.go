// Package lifecycle coordinates resource deletion with in-flight operations.
package lifecycle

import (
	"sort"
	"sync"
)

type key struct {
	kind uint8
	id   int64
}

const (
	sourceKind uint8 = iota + 1
	userKind
)

// Key identifies a lifecycle-managed resource.
type Key struct{ value key }

// Source identifies a storage source lifecycle.
func Source(id int64) Key { return Key{value: key{kind: sourceKind, id: id}} }

// User identifies a user lifecycle.
func User(id int64) Key { return Key{value: key{kind: userKind, id: id}} }

type entry struct {
	mu   sync.RWMutex
	refs int
}

var registry = struct {
	sync.Mutex
	entries map[key]*entry
}{entries: make(map[key]*entry)}

// Read prevents the identified resources from being deleted until release.
func Read(keys ...Key) func() { return acquire(false, keys) }

// Write waits for all in-flight operations on the resources and prevents new
// ones from starting until release. Deletion checks and deletion must share one
// Write lease.
func Write(keys ...Key) func() { return acquire(true, keys) }

func acquire(write bool, requested []Key) func() {
	keys := normalizedKeys(requested)
	entries := make([]*entry, len(keys))
	registry.Lock()
	for i, item := range keys {
		current := registry.entries[item]
		if current == nil {
			current = &entry{}
			registry.entries[item] = current
		}
		current.refs++
		entries[i] = current
	}
	registry.Unlock()

	for _, current := range entries {
		if write {
			current.mu.Lock()
		} else {
			current.mu.RLock()
		}
	}

	var once sync.Once
	return func() {
		once.Do(func() {
			for i := len(entries) - 1; i >= 0; i-- {
				if write {
					entries[i].mu.Unlock()
				} else {
					entries[i].mu.RUnlock()
				}
			}
			registry.Lock()
			for i, item := range keys {
				entries[i].refs--
				if entries[i].refs == 0 {
					delete(registry.entries, item)
				}
			}
			registry.Unlock()
		})
	}
}

func normalizedKeys(requested []Key) []key {
	seen := make(map[key]struct{}, len(requested))
	keys := make([]key, 0, len(requested))
	for _, item := range requested {
		if item.value.kind == 0 || item.value.id <= 0 {
			continue
		}
		if _, exists := seen[item.value]; exists {
			continue
		}
		seen[item.value] = struct{}{}
		keys = append(keys, item.value)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].kind != keys[j].kind {
			return keys[i].kind < keys[j].kind
		}
		return keys[i].id < keys[j].id
	})
	return keys
}
