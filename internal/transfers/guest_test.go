package transfers

import (
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
)

func TestGuestIdentityAndTaskExpiryBoundaries(t *testing.T) {
	service, _, _, _, userID := newTransfersFixture(t)
	before := time.Now().UTC()
	longGuest, _, err := service.CreateGuestIdentity(30 * 24 * time.Hour)
	if err != nil || longGuest.ExpiresAt.Before(before.Add(GuestMaxTTL)) || longGuest.ExpiresAt.After(time.Now().UTC().Add(GuestMaxTTL)) {
		t.Fatalf("guest TTL=%+v err=%v", longGuest, err)
	}
	guest, token, err := service.CreateGuestIdentity(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	var digest string
	if err := service.db.QueryRow(`SELECT token_hash FROM transfer_guest_identities WHERE id = ?`, guest.ID).Scan(&digest); err != nil || digest != auth.HashToken(token) || digest == token {
		t.Fatalf("guest token stored unsafely: err=%v", err)
	}
	if csrf := service.GuestCSRFToken(token); csrf == "" || csrf == token || csrf != service.GuestCSRFToken(token) {
		t.Fatal("guest CSRF derivation is not stable and distinct")
	}
	if got, err := service.GetGuestIdentity(token); err != nil || got.ID != guest.ID || !got.ExpiresAt.Equal(guest.ExpiresAt) {
		t.Fatalf("restore=%+v err=%v", got, err)
	}
	if _, err := service.GetGuestIdentity(token + "changed"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("invalid guest token accepted: %v", err)
	}
	for _, hours := range []*int64{nil, ptrHours(24), ptrHours(168), ptrHours(math.MaxInt64)} {
		send, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID, ExpiresInHours: hours})
		if err != nil || send.ExpiresAt == nil || !send.ExpiresAt.Equal(guest.ExpiresAt) {
			t.Fatalf("guest send expiry=%+v err=%v", send, err)
		}
		collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID, ExpiresInHours: hours})
		if err != nil || collection.ExpiresAt == nil || !collection.ExpiresAt.Equal(guest.ExpiresAt) {
			t.Fatalf("guest collection expiry=%+v err=%v", collection, err)
		}
	}
	for _, hours := range []int64{0, -1} {
		if _, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID, ExpiresInHours: &hours}); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("guest send accepts expiry %d: %v", hours, err)
		}
		if _, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID, ExpiresInHours: &hours}); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("guest collection accepts expiry %d: %v", hours, err)
		}
	}
	userSend, _, err := service.CreateSend(CreateSendInput{OwnerUserID: userID, ExpiresInHours: ptrHours(0)})
	if err != nil || userSend.ExpiresAt != nil {
		t.Fatalf("user no-expiry behavior changed: %+v %v", userSend, err)
	}
}

func ptrHours(hours int64) *int64 { return &hours }

func TestGuestActiveTaskLimitIsSharedAndAtomic(t *testing.T) {
	service, _, _, _, _ := newTransfersFixture(t)
	guest, _, err := service.CreateGuestIdentity(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	var firstSend *Send
	for i := int64(0); i < GuestMaxActiveTasks-1; i++ {
		if i%2 == 0 {
			send, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID})
			if err != nil {
				t.Fatal(err)
			}
			if firstSend == nil {
				firstSend = send
			}
		} else if _, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID}); err != nil {
			t.Fatal(err)
		}
	}
	start, results := make(chan struct{}), make(chan error, 2)
	go func() {
		<-start
		_, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID})
		results <- err
	}()
	go func() {
		<-start
		_, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID})
		results <- err
	}()
	close(start)
	accepted, rejected := 0, 0
	for i := 0; i < 2; i++ {
		select {
		case err := <-results:
			if err == nil {
				accepted++
			} else if errors.Is(err, ErrConflictState) {
				rejected++
			} else {
				t.Fatalf("task create failed unexpectedly: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("concurrent guest task creation blocked")
		}
	}
	if accepted != 1 || rejected != 1 {
		t.Fatalf("task limit accepted=%d rejected=%d", accepted, rejected)
	}
	if err := service.RevokeSendForOwner(firstSend.ID, Owner{GuestID: guest.ID}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID}); err != nil {
		t.Fatalf("revoked task did not release active slot: %v", err)
	}
}

func TestGuestFileLimitRollsBackSendAndCollection(t *testing.T) {
	service, _, carrier, _, _ := newTransfersFixture(t)
	service.SetGuestMaxFileSize(3)
	guest, _, err := service.CreateGuestIdentity(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	owner := Owner{GuestID: guest.ID}
	send, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUploadForOwner(send.ID, owner, "a.txt", strings.NewReader("1234")); !errors.Is(err, files.ErrQuotaExceeded) {
		t.Fatalf("guest send file limit ignored: %v", err)
	}
	if listed, err := service.ListOwnSendFilesForOwner(send.ID, owner); err != nil || len(listed) != 0 {
		t.Fatalf("failed send upload left ledger: %v %v", listed, err)
	}
	if _, err := os.Stat(filepath.Join(carrier.RootPath, filepath.FromSlash(sendPayloadRel(send.PublicKey, "a.txt")))); !os.IsNotExist(err) {
		t.Fatalf("failed send upload left payload: %v", err)
	}
	optional := false
	collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID, RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
		{RelativePath: "a.txt", Body: strings.NewReader("1234")},
	}); !errors.Is(err, ErrFileSizeExceeded) {
		t.Fatalf("guest collection file limit ignored: %v", err)
	}
	assertEmptyCollection(t, service, carrier.RootPath, collection)
	if _, err := service.AddSendUploadForOwner(send.ID, owner, "a.txt", strings.NewReader("123")); err != nil {
		t.Fatalf("failed upload prevents valid retry: %v", err)
	}
}

func TestConcurrentGuestSendAndCollectionRespectCombinedQuota(t *testing.T) {
	for _, quota := range []string{"global", "guest"} {
		t.Run(quota, func(t *testing.T) {
			service, _, _, _, _ := newTransfersFixture(t)
			guest, _, err := service.CreateGuestIdentity(time.Hour)
			if err != nil {
				t.Fatal(err)
			}
			owner := Owner{GuestID: guest.ID}
			send, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID})
			if err != nil {
				t.Fatal(err)
			}
			optional := false
			collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID, RequireCode: &optional})
			if err != nil {
				t.Fatal(err)
			}
			if quota == "global" {
				if err := service.SetSettings(Settings{ActiveQuotaBytes: 6}); err != nil {
					t.Fatal(err)
				}
			} else {
				// 台账种子保留 6 字节余额，无需分配 1 GiB 的测试载荷。
				seed, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID})
				if err != nil {
					t.Fatal(err)
				}
				if _, err := service.db.Exec(`UPDATE transfers SET total_size = ? WHERE id = ?`, GuestActiveQuotaBytes-6, seed.ID); err != nil {
					t.Fatal(err)
				}
			}
			token, _, err := service.UnlockCollection(collection.PublicKey, "", "")
			if err != nil {
				t.Fatal(err)
			}
			started, resume, results := make(chan struct{}, 2), make(chan struct{}), make(chan error, 2)
			defer close(resume)
			go func() {
				_, err := service.AddSendUploadForOwner(send.ID, owner, "a.txt", &blockedSubmissionReader{reader: strings.NewReader("1234"), started: started, resume: resume})
				results <- err
			}()
			go func() {
				_, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
					{RelativePath: "a.txt", Body: &blockedSubmissionReader{reader: strings.NewReader("1234"), started: started, resume: resume}},
				})
				results <- err
			}()
			for i := 0; i < 2; i++ {
				select {
				case <-started:
				case <-time.After(5 * time.Second):
					t.Fatal("quota writers did not start")
				}
			}
			resume <- struct{}{}
			resume <- struct{}{}
			accepted, rejected := 0, 0
			for i := 0; i < 2; i++ {
				select {
				case err := <-results:
					if err == nil {
						accepted++
					} else if errors.Is(err, ErrQuotaExceeded) {
						rejected++
					} else {
						t.Fatalf("unexpected quota error: %v", err)
					}
				case <-time.After(5 * time.Second):
					t.Fatal("quota rollback blocked")
				}
			}
			if accepted != 1 || rejected != 1 {
				t.Fatalf("quota accepted=%d rejected=%d", accepted, rejected)
			}
			var payloadRows int64
			if err := service.db.QueryRow(`SELECT (SELECT COUNT(*) FROM transfer_files) + (SELECT COUNT(*) FROM transfer_submission_files)`).Scan(&payloadRows); err != nil || payloadRows != 1 {
				t.Fatalf("quota ledger rows=%d err=%v", payloadRows, err)
			}
			entries, err := os.ReadDir(service.uploadOperationsDir())
			if err != nil || len(entries) != 0 {
				t.Fatalf("quota journal residue=%v err=%v", entries, err)
			}
		})
	}
}

func TestGuestIdentityExpiryDuringUploadRollsBack(t *testing.T) {
	service, _, carrier, _, _ := newTransfersFixture(t)
	guest, _, err := service.CreateGuestIdentity(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	owner := Owner{GuestID: guest.ID}
	send, _, err := service.CreateSend(CreateSendInput{OwnerGuestID: guest.ID})
	if err != nil {
		t.Fatal(err)
	}
	started, resume, done := make(chan struct{}, 1), make(chan struct{}), make(chan error, 1)
	defer close(resume)
	go func() {
		_, err := service.AddSendUploadForOwner(send.ID, owner, "a.txt", &blockedSubmissionReader{reader: strings.NewReader("data"), started: started, resume: resume})
		done <- err
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("guest upload did not start")
	}
	if _, err := service.db.Exec(`UPDATE transfer_guest_identities SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Hour), guest.ID); err != nil {
		t.Fatal(err)
	}
	resume <- struct{}{}
	select {
	case err := <-done:
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("expired identity upload committed: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("expired guest cleanup blocked")
	}
	var size, count int64
	if err := service.db.QueryRow(`SELECT total_size, total_files FROM transfers WHERE id = ?`, send.ID).Scan(&size, &count); err != nil || size != 0 || count != 0 {
		t.Fatalf("expired identity left payload ledger size=%d count=%d err=%v", size, count, err)
	}
	if _, err := os.Stat(filepath.Join(carrier.RootPath, filepath.FromSlash(sendPayloadRel(send.PublicKey, "a.txt")))); !os.IsNotExist(err) {
		t.Fatalf("expired identity left payload bytes: %v", err)
	}
}
