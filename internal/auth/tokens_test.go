package auth_test

import (
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/db"
)

func newTokenFixture(t *testing.T) (*auth.Tokens, int64) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "tokens.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	now := time.Now().UTC()
	result, err := conn.Exec(`INSERT INTO users
  (user_public_id, username, display_name, password_hash, role, is_disabled, created_at, updated_at)
  VALUES ('u_token01', 'token-user', 'Token User', 'unused', 'user', 0, ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	userID, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("read user id: %v", err)
	}
	return auth.NewTokens(conn), userID
}

func TestMultipleImageBedTokensCanBeManagedIndependently(t *testing.T) {
	tokens, userID := newTokenFixture(t)
	first, firstPlaintext, err := tokens.CreateImageBedToken(userID, "Laptop PicGo")
	if err != nil {
		t.Fatalf("create first token: %v", err)
	}
	second, secondPlaintext, err := tokens.CreateImageBedToken(userID, "Desktop PicGo")
	if err != nil {
		t.Fatalf("create second token: %v", err)
	}
	if first.TokenID == second.TokenID || firstPlaintext == secondPlaintext {
		t.Fatal("tokens must have unique ids and plaintext values")
	}

	items, err := tokens.ListImageBedTokens(userID)
	if err != nil {
		t.Fatalf("list tokens: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected two tokens, got %d", len(items))
	}
	if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, firstPlaintext); err != nil {
		t.Fatalf("verify first token: %v", err)
	}
	if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, secondPlaintext); err != nil {
		t.Fatalf("verify second token: %v", err)
	}

	if err := tokens.DeleteImageBedToken(userID+999, first.TokenID); !errors.Is(err, auth.ErrImageBedTokenNotFound) {
		t.Fatalf("another user must not delete the token, got %v", err)
	}
	if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, firstPlaintext); err != nil {
		t.Fatalf("token should remain valid after foreign delete attempt: %v", err)
	}
	if err := tokens.DeleteImageBedToken(userID, first.TokenID); err != nil {
		t.Fatalf("delete first token: %v", err)
	}
	if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, firstPlaintext); !errors.Is(err, auth.ErrTokenInvalid) {
		t.Fatalf("deleted token should be invalid, got %v", err)
	}
	if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, secondPlaintext); err != nil {
		t.Fatalf("remaining token should stay valid: %v", err)
	}

	status, err := tokens.Status(userID)
	if err != nil {
		t.Fatalf("read token status: %v", err)
	}
	if !status[auth.TokenTypeImageBed].Exists || status[auth.TokenTypeImageBed].Count != 1 {
		t.Fatalf("unexpected image bed token status: %+v", status[auth.TokenTypeImageBed])
	}
}

func TestLegacyImageBedResetRevokesAllTokens(t *testing.T) {
	tokens, userID := newTokenFixture(t)
	_, first, _ := tokens.CreateImageBedToken(userID, "First")
	_, second, _ := tokens.CreateImageBedToken(userID, "Second")

	replacement, err := tokens.Reset(userID, auth.TokenTypeImageBed)
	if err != nil {
		t.Fatalf("reset image bed tokens: %v", err)
	}
	for _, old := range []string{first, second} {
		if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, old); !errors.Is(err, auth.ErrTokenInvalid) {
			t.Fatalf("old token should be invalid after reset, got %v", err)
		}
	}
	if _, err := tokens.VerifyByToken(auth.TokenTypeImageBed, replacement); err != nil {
		t.Fatalf("replacement token should be valid: %v", err)
	}
	items, err := tokens.ListImageBedTokens(userID)
	if err != nil || len(items) != 1 || items[0].Label != "默认 Token" {
		t.Fatalf("unexpected reset result: items=%+v err=%v", items, err)
	}
}

func TestImageBedTokenValidationAndLimit(t *testing.T) {
	tokens, userID := newTokenFixture(t)
	if _, _, err := tokens.CreateImageBedToken(userID, "   "); !errors.Is(err, auth.ErrImageBedTokenLabel) {
		t.Fatalf("expected label validation error, got %v", err)
	}
	if _, _, err := tokens.CreateImageBedToken(userID, "bad\nlabel"); !errors.Is(err, auth.ErrImageBedTokenLabel) {
		t.Fatalf("expected control character validation error, got %v", err)
	}
	for i := range auth.MaxImageBedTokens {
		if _, _, err := tokens.CreateImageBedToken(userID, fmt.Sprintf("Token %d", i+1)); err != nil {
			t.Fatalf("create token %d: %v", i, err)
		}
	}
	if _, _, err := tokens.CreateImageBedToken(userID, "One too many"); !errors.Is(err, auth.ErrImageBedTokenLimit) {
		t.Fatalf("expected token limit error, got %v", err)
	}
	if err := tokens.DeleteImageBedToken(userID, "ibt_missing"); !errors.Is(err, auth.ErrImageBedTokenNotFound) {
		t.Fatalf("expected not found error, got %v", err)
	}
}
