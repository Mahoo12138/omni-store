package auth_test

import (
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/db"
)

func TestSessionLifecycleCSRFAndInvalidation(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	now := time.Now().UTC()
	result, err := conn.Exec(`INSERT INTO users
  (user_public_id, username, display_name, password_hash, role, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`, "u_session", "session-user", "Session User", "unused", "user", now, now)
	if err != nil {
		t.Fatal(err)
	}
	userID, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}

	sessions := auth.NewSessions(conn, 2*time.Hour)
	if sessions.TTL() != 2*time.Hour {
		t.Fatalf("TTL()=%v", sessions.TTL())
	}
	sessionID, csrf, err := sessions.Create(userID, "test-agent", "198.51.100.7")
	if err != nil || sessionID == "" || csrf == "" {
		t.Fatalf("Create() session=%q csrf=%q err=%v", sessionID, csrf, err)
	}
	user, session, err := sessions.Validate(sessionID)
	if err != nil || user.ID != userID || session.SessionID != sessionID {
		t.Fatalf("Validate() user=%+v session=%+v err=%v", user, session, err)
	}
	if !sessions.VerifyCSRF(session, csrf) || sessions.VerifyCSRF(session, "") || sessions.VerifyCSRF(session, "wrong-token") {
		t.Fatal("CSRF verification contract failed")
	}

	var storedCSRFHash string
	if err := conn.QueryRow(`SELECT csrf_token_hash FROM sessions WHERE session_id = ?`, sessionID).Scan(&storedCSRFHash); err != nil {
		t.Fatal(err)
	}
	if recovered := sessions.CSRFToken(sessionID); recovered != csrf {
		t.Fatalf("CSRFToken()=%q, want original token %q", recovered, csrf)
	}
	if sessions.CSRFToken("") != "" {
		t.Fatal("empty session ID must not produce a CSRF token")
	}

	const readers = 32
	var wg sync.WaitGroup
	errCh := make(chan string, readers)
	for range readers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if recovered := sessions.CSRFToken(sessionID); recovered != csrf {
				errCh <- recovered
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for recovered := range errCh {
		t.Errorf("concurrent CSRFToken()=%q, want %q", recovered, csrf)
	}
	var currentCSRFHash string
	if err := conn.QueryRow(`SELECT csrf_token_hash FROM sessions WHERE session_id = ?`, sessionID).Scan(&currentCSRFHash); err != nil {
		t.Fatal(err)
	}
	if currentCSRFHash != storedCSRFHash {
		t.Fatalf("recovering CSRF token changed stored hash: before=%q after=%q", storedCSRFHash, currentCSRFHash)
	}

	if _, _, err := sessions.Validate(""); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("empty session error=%v", err)
	}
	if _, _, err := sessions.Validate("missing"); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("missing session error=%v", err)
	}

	expiredID, _, err := sessions.Create(userID, "expired-agent", "198.51.100.8")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE sessions SET expires_at = ? WHERE session_id = ?`, time.Now().UTC().Add(-time.Minute), expiredID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := sessions.Validate(expiredID); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("expired session error=%v", err)
	}
	if count, err := sessions.CleanupExpired(); err != nil || count != 1 {
		t.Fatalf("CleanupExpired()=%d, %v", count, err)
	}

	secondID, secondCSRF, err := sessions.Create(userID, "second-agent", "198.51.100.9")
	if err != nil {
		t.Fatal(err)
	}
	if secondCSRF == csrf || sessions.CSRFToken(secondID) != secondCSRF {
		t.Fatal("each session must have a distinct stable CSRF token")
	}
	if err := sessions.Delete(secondID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := sessions.Validate(secondID); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("deleted session error=%v", err)
	}

	if err := sessions.DeleteByUser(userID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := sessions.Validate(sessionID); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("DeleteByUser session error=%v", err)
	}

	disabledID, _, err := sessions.Create(userID, "disabled-agent", "198.51.100.10")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`UPDATE users SET is_disabled = 1 WHERE id = ?`, userID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := sessions.Validate(disabledID); !errors.Is(err, auth.ErrSessionInvalid) {
		t.Fatalf("disabled user session error=%v", err)
	}
}
