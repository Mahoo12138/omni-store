package httpserver

import (
	"sync"
	"time"
)

// keyedRateLimiter 是固定窗口的按键限流器。
// 流转中心按「IP + 任务」限流：单个目标的爆破尝试不能锁死其他任务的合法取件。
type keyedRateLimiter struct {
	mu      sync.Mutex
	window  time.Duration
	max     int
	buckets map[string]*rateBucket
}

type rateBucket struct {
	start time.Time
	count int
}

func newKeyedRateLimiter(max int, window time.Duration) *keyedRateLimiter {
	return &keyedRateLimiter{
		window:  window,
		max:     max,
		buckets: make(map[string]*rateBucket),
	}
}

// Allow 判断该键在当前窗口内是否还有配额。
func (l *keyedRateLimiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.buckets) > 10000 {
		l.pruneLocked(now)
	}
	bucket, ok := l.buckets[key]
	if !ok || now.Sub(bucket.start) >= l.window {
		l.buckets[key] = &rateBucket{start: now, count: 1}
		return true
	}
	if bucket.count >= l.max {
		return false
	}
	bucket.count++
	return true
}

func (l *keyedRateLimiter) pruneLocked(now time.Time) {
	for key, bucket := range l.buckets {
		if now.Sub(bucket.start) >= l.window {
			delete(l.buckets, key)
		}
	}
}
