// Package imagebed 实现登录用户图床和匿名公共图床（README §17）。
package imagebed

import (
	"sync"
	"time"
)

// RateLimiter 是匿名图床的进程内 IP 限流器（README §17.6）。
// 内存计数，服务重启后清空。
type RateLimiter struct {
	mu      sync.Mutex
	perHour int
	counts  map[string][]time.Time
}

// NewRateLimiter 创建限流器。perHour <= 0 表示不限流。
func NewRateLimiter(perHour int) *RateLimiter {
	return &RateLimiter{perHour: perHour, counts: make(map[string][]time.Time)}
}

// Allow 判断该 IP 是否允许再上传一张。允许时立即计数。
func (rl *RateLimiter) Allow(ip string) bool {
	if rl.perHour <= 0 {
		return true
	}
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-time.Hour)
	kept := rl.counts[ip][:0]
	for _, t := range rl.counts[ip] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= rl.perHour {
		rl.counts[ip] = kept
		return false
	}
	rl.counts[ip] = append(kept, now)

	// 顺手清理空条目，避免 map 无限增长。
	if len(rl.counts) > 10000 {
		for k, v := range rl.counts {
			if len(v) == 0 {
				delete(rl.counts, k)
			}
		}
	}
	return true
}
