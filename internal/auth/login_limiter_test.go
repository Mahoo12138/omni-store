package auth

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func TestVerifyLoginPasswordUsesProductionCostDummyHash(t *testing.T) {
	cost, err := bcrypt.Cost([]byte(dummyPasswordHash))
	if err != nil {
		t.Fatalf("dummy hash is invalid: %v", err)
	}
	if cost != bcryptCost {
		t.Fatalf("dummy bcrypt cost=%d want=%d", cost, bcryptCost)
	}
	if VerifyLoginPassword("", "anything") {
		t.Fatal("dummy password unexpectedly matched")
	}
	hash, err := HashPassword("correct-password")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyLoginPassword(hash, "correct-password") || VerifyLoginPassword(hash, "wrong-password") {
		t.Fatal("real login password verification is incorrect")
	}
}

func TestLoginLimiterEnforcesIPAndUsernameWindows(t *testing.T) {
	unlimited := NewLoginLimiter(time.Minute, 0, 0)
	for range 100 {
		if _, _, ok := unlimited.Begin("198.51.100.100", "unlimited"); !ok {
			t.Fatal("disabled limiter rejected an attempt")
		}
	}

	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	limiter := NewLoginLimiter(10*time.Minute, 3, 2)
	limiter.now = func() time.Time { return now }

	first, _, ok := limiter.Begin("198.51.100.1", " Alice ")
	if !ok || first == nil {
		t.Fatal("first attempt was rejected")
	}
	second, _, ok := limiter.Begin("198.51.100.2", "Alice")
	if !ok || second == nil {
		t.Fatal("second attempt was rejected")
	}
	if _, retry, ok := limiter.Begin("198.51.100.3", "Alice"); ok || retry != 10*time.Minute {
		t.Fatalf("username limit not enforced: ok=%v retry=%v", ok, retry)
	}

	// A successful login clears the username bucket but not unrelated IP failures.
	limiter.Success(second)
	if _, _, ok := limiter.Begin("198.51.100.3", "Alice"); !ok {
		t.Fatal("successful login did not reset username failures")
	}

	if _, _, ok := limiter.Begin("203.0.113.1", "one"); !ok {
		t.Fatal("IP attempt one rejected")
	}
	if _, _, ok := limiter.Begin("203.0.113.1", "two"); !ok {
		t.Fatal("IP attempt two rejected")
	}
	if _, _, ok := limiter.Begin("203.0.113.1", "three"); !ok {
		t.Fatal("IP attempt three rejected")
	}
	if _, retry, ok := limiter.Begin("203.0.113.1", "four"); ok || retry != 10*time.Minute {
		t.Fatalf("IP limit not enforced: ok=%v retry=%v", ok, retry)
	}

	now = now.Add(10*time.Minute + time.Nanosecond)
	if _, _, ok := limiter.Begin("203.0.113.1", "four"); !ok {
		t.Fatal("expired window was not released")
	}

	// Cancelled internal errors must not consume the configured allowance.
	cancelled, _, ok := limiter.Begin("192.0.2.1", "cancelled")
	if !ok {
		t.Fatal("cancelled attempt rejected")
	}
	limiter.Cancel(cancelled)
	if len(limiter.byIP["192.0.2.1"]) != 0 || len(limiter.byUsername["cancelled"]) != 0 {
		t.Fatal("cancelled attempt remained in limiter")
	}
}

func TestLoginLimiterConcurrentAttemptsCannotExceedThreshold(t *testing.T) {
	limiter := NewLoginLimiter(time.Minute, 100, 10)
	var allowed atomic.Int64
	var group sync.WaitGroup
	for range 100 {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, _, ok := limiter.Begin("198.51.100.9", "parallel-user"); ok {
				allowed.Add(1)
			}
		}()
	}
	group.Wait()
	if allowed.Load() != 10 {
		t.Fatalf("concurrent attempts allowed=%d want=10", allowed.Load())
	}
}
