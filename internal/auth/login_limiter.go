package auth

import (
	"strings"
	"sync"
	"time"
)

type loginAttemptEvent struct {
	id uint64
	at time.Time
}

// LoginAttempt 是一次已原子预占限流额度的登录尝试。
type LoginAttempt struct {
	id       uint64
	ip       string
	username string
}

// LoginLimiter 按客户端 IP 和规范化用户名分别限制失败登录。
// 尝试开始时先预占额度；失败时保留，成功或内部错误时释放，避免并发穿透。
type LoginLimiter struct {
	mu             sync.Mutex
	window         time.Duration
	maxPerIP       int
	maxPerUsername int
	nextID         uint64
	byIP           map[string][]loginAttemptEvent
	byUsername     map[string][]loginAttemptEvent
	now            func() time.Time
}

// NewLoginLimiter 创建进程内滑动窗口登录限流器。阈值 <= 0 表示不限制该维度。
func NewLoginLimiter(window time.Duration, maxPerIP, maxPerUsername int) *LoginLimiter {
	if window <= 0 {
		window = 15 * time.Minute
	}
	return &LoginLimiter{
		window:         window,
		maxPerIP:       maxPerIP,
		maxPerUsername: maxPerUsername,
		byIP:           make(map[string][]loginAttemptEvent),
		byUsername:     make(map[string][]loginAttemptEvent),
		now:            time.Now,
	}
}

// Begin 原子检查并预占一次登录额度。被拒绝时返回需要等待的最短时长。
func (l *LoginLimiter) Begin(ip, username string) (*LoginAttempt, time.Duration, bool) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		ip = "unknown"
	}
	// 用户名在当前数据模型中区分大小写，限流键必须保持同一语义。
	username = strings.TrimSpace(username)
	if username == "" {
		username = "unknown"
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	cutoff := now.Add(-l.window)
	ipEvents := pruneLoginEvents(l.byIP[ip], cutoff)
	usernameEvents := pruneLoginEvents(l.byUsername[username], cutoff)
	l.storeEvents(l.byIP, ip, ipEvents)
	l.storeEvents(l.byUsername, username, usernameEvents)

	retryAfter := time.Duration(0)
	if l.maxPerIP > 0 && len(ipEvents) >= l.maxPerIP {
		retryAfter = retryDuration(now, ipEvents[0].at, l.window)
	}
	if l.maxPerUsername > 0 && len(usernameEvents) >= l.maxPerUsername {
		if retry := retryDuration(now, usernameEvents[0].at, l.window); retry > retryAfter {
			retryAfter = retry
		}
	}
	if retryAfter > 0 {
		return nil, retryAfter, false
	}

	l.nextID++
	attempt := &LoginAttempt{id: l.nextID, ip: ip, username: username}
	event := loginAttemptEvent{id: attempt.id, at: now}
	l.byIP[ip] = append(ipEvents, event)
	l.byUsername[username] = append(usernameEvents, event)
	return attempt, 0, true
}

// Success 释放本次 IP 额度，并清除该用户名的历史失败计数。
func (l *LoginLimiter) Success(attempt *LoginAttempt) {
	if attempt == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.storeEvents(l.byIP, attempt.ip, removeLoginEvent(l.byIP[attempt.ip], attempt.id))
	delete(l.byUsername, attempt.username)
}

// Cancel 在数据库等内部错误时释放本次预占，不把服务故障算作认证失败。
func (l *LoginLimiter) Cancel(attempt *LoginAttempt) {
	if attempt == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.storeEvents(l.byIP, attempt.ip, removeLoginEvent(l.byIP[attempt.ip], attempt.id))
	l.storeEvents(l.byUsername, attempt.username, removeLoginEvent(l.byUsername[attempt.username], attempt.id))
}

func (l *LoginLimiter) storeEvents(target map[string][]loginAttemptEvent, key string, events []loginAttemptEvent) {
	if len(events) == 0 {
		delete(target, key)
		return
	}
	target[key] = events
}

func pruneLoginEvents(events []loginAttemptEvent, cutoff time.Time) []loginAttemptEvent {
	first := 0
	for first < len(events) && !events[first].at.After(cutoff) {
		first++
	}
	if first == len(events) {
		return nil
	}
	return events[first:]
}

func removeLoginEvent(events []loginAttemptEvent, id uint64) []loginAttemptEvent {
	for index, event := range events {
		if event.id == id {
			return append(events[:index], events[index+1:]...)
		}
	}
	return events
}

func retryDuration(now, oldest time.Time, window time.Duration) time.Duration {
	retry := oldest.Add(window).Sub(now)
	if retry <= 0 {
		return time.Nanosecond
	}
	return retry
}
