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
		attempt, _, ok := unlimited.Begin("198.51.100.100", "unlimited")
		if !ok {
			t.Fatal("disabled limiter rejected an attempt")
		}
		if _, ok := unlimited.Failure(attempt); !ok {
			t.Fatal("disabled username limiter rejected a failure")
		}
	}
	if len(unlimited.byIP) != 0 || len(unlimited.byUsername) != 0 {
		t.Fatal("disabled limiter retained state")
	}

	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	limiter := NewLoginLimiter(10*time.Minute, 3, 2)
	limiter.now = func() time.Time { return now }

	first, _, ok := limiter.Begin("198.51.100.1", " Alice ")
	if !ok || first == nil {
		t.Fatal("first attempt was rejected")
	}
	if retry, allowed := limiter.Failure(first); !allowed || retry != 0 {
		t.Fatalf("first username failure rejected: allowed=%v retry=%v", allowed, retry)
	}
	second, _, ok := limiter.Begin("198.51.100.2", "Alice")
	if !ok || second == nil {
		t.Fatal("second attempt was rejected")
	}
	if retry, allowed := limiter.Failure(second); !allowed || retry != 0 {
		t.Fatalf("second username failure rejected: allowed=%v retry=%v", allowed, retry)
	}
	third, retry, ok := limiter.Begin("198.51.100.3", "Alice")
	if !ok || retry != 0 {
		t.Fatalf("username failures blocked password verification: ok=%v retry=%v", ok, retry)
	}
	if retry, allowed := limiter.Failure(third); allowed || retry != 10*time.Minute {
		t.Fatalf("username failure limit not enforced after verification: allowed=%v retry=%v", allowed, retry)
	}

	// A correct password still reaches Success and clears the username bucket.
	correct, _, ok := limiter.Begin("198.51.100.4", "Alice")
	if !ok {
		t.Fatal("username failures locked out a correct password")
	}
	limiter.Success(correct)
	if len(limiter.byUsername["Alice"]) != 0 {
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
	var verified atomic.Int64
	var failuresAllowed atomic.Int64
	var group sync.WaitGroup
	for range 100 {
		group.Add(1)
		go func() {
			defer group.Done()
			if attempt, _, ok := limiter.Begin("198.51.100.9", "parallel-user"); ok {
				verified.Add(1)
				if _, allowed := limiter.Failure(attempt); allowed {
					failuresAllowed.Add(1)
				}
			}
		}()
	}
	group.Wait()
	if verified.Load() != 100 {
		t.Fatalf("username limiter blocked verification for %d attempts", 100-verified.Load())
	}
	if failuresAllowed.Load() != 10 {
		t.Fatalf("concurrent username failures allowed=%d want=10", failuresAllowed.Load())
	}
	if got := len(limiter.byUsername["parallel-user"]); got != 10 {
		t.Fatalf("username event bucket grew past threshold: got=%d want=10", got)
	}
}

func TestLoginLimiterSweepsExpiredAndCapsTrackedKeys(t *testing.T) {
	now := time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)
	limiter := NewLoginLimiter(time.Minute, 10, 10)
	limiter.maxTrackedKeys = 3
	limiter.now = func() time.Time { return now }

	for index := 0; index < 8; index++ {
		key := string(rune('a' + index))
		attempt, _, ok := limiter.Begin("ip-"+key, "user-"+key)
		if !ok {
			t.Fatalf("attempt %d rejected", index)
		}
		limiter.Failure(attempt)
	}
	if len(limiter.byIP) > 3 || len(limiter.byUsername) > 3 {
		t.Fatalf("tracked keys exceeded cap: ip=%d username=%d", len(limiter.byIP), len(limiter.byUsername))
	}

	now = now.Add(2 * time.Minute)
	limiter.Begin("fresh-ip", "fresh-user")
	if len(limiter.byIP) != 1 || len(limiter.byUsername) != 0 {
		t.Fatalf("expired keys were not swept: ip=%d username=%d", len(limiter.byIP), len(limiter.byUsername))
	}
}
