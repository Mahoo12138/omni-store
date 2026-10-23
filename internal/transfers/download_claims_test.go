package transfers

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
)

// 下载名额按（访问会话, 下载目标）去重：同一目标的 Range 续传与重试不重复计数，
// 不同目标、不同会话仍各自消耗名额，总额仍受 max_downloads 限制。
func TestSendDownloadClaimsReuseWithinSession(t *testing.T) {
	service, _, _, _, owner := newTransfersFixture(t)
	maxDownloads := int64(4)
	send, files, token := newSendWithDownloads(t, service, owner, &maxDownloads, 4)

	for i := 0; i < 5; i++ {
		if _, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(files[0].ID)); err != nil {
			t.Fatalf("repeat download %d: %v", i+1, err)
		}
	}
	if count := downloadCount(t, service, send.ID); count != 1 {
		t.Fatalf("repeat requests consumed %d slots, want 1", count)
	}

	for i := 0; i < 2; i++ {
		if _, _, err := service.ReserveSendDownload(send.PublicKey, token, SendArchiveDownloadTarget); err != nil {
			t.Fatalf("archive %d: %v", i+1, err)
		}
	}
	if count := downloadCount(t, service, send.ID); count != 2 {
		t.Fatalf("archive retry consumed %d slots, want 2", count)
	}

	// 另一次解锁是新的访问会话：同一文件重新计数。
	secondToken, _, err := service.UnlockSend(send.PublicKey, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.ReserveSendDownload(send.PublicKey, secondToken, SendFileDownloadTarget(files[0].ID)); err != nil {
		t.Fatalf("new session claim: %v", err)
	}
	if _, _, err := service.ReserveSendDownload(send.PublicKey, secondToken, SendFileDownloadTarget(files[1].ID)); err != nil {
		t.Fatalf("new session second target: %v", err)
	}
	if count := downloadCount(t, service, send.ID); count != 4 {
		t.Fatalf("count=%d, want 4", count)
	}

	// 总额耗尽后，已有声明仍可继续续传/重试，新目标一律拒绝。
	if _, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(files[0].ID)); err != nil {
		t.Fatalf("existing claim after limit: %v", err)
	}
	if _, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(files[2].ID)); !errors.Is(err, ErrDownloadLimit) {
		t.Fatalf("new target over limit error=%v", err)
	}
	if count := downloadCount(t, service, send.ID); count != 4 {
		t.Fatalf("count after rejected claim=%d, want 4", count)
	}
	// 被拒绝的目标不留下声明，重试仍明确返回上限而不是误判免费。
	var claims int64
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM transfer_download_claims WHERE transfer_id = ? AND target = ?`,
		send.ID, SendFileDownloadTarget(files[2].ID)).Scan(&claims); err != nil {
		t.Fatal(err)
	}
	if claims != 0 {
		t.Fatalf("rejected claim persisted: %d", claims)
	}
}

// 并发请求同一目标只计一次；不同目标竞争同一批名额时仍然精确不超限。
func TestSendDownloadClaimsConcurrent(t *testing.T) {
	service, _, _, _, owner := newTransfersFixture(t)
	maxDownloads := int64(5)
	send, files, token := newSendWithDownloads(t, service, owner, &maxDownloads, 2)

	var wait sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(files[0].ID))
			errs <- err
		}()
	}
	wait.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent same-target request failed: %v", err)
		}
	}
	if count := downloadCount(t, service, send.ID); count != 1 {
		t.Fatalf("concurrent same-target count=%d, want 1", count)
	}

	// 剩余 4 个名额由 6 个不同目标竞争：恰好 4 个成功。
	errs = make(chan error, 6)
	for i := 0; i < 6; i++ {
		wait.Add(1)
		go func(target int64) {
			defer wait.Done()
			_, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(1000+target))
			errs <- err
		}(int64(i))
	}
	wait.Wait()
	close(errs)
	succeeded, limited := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrDownloadLimit):
			limited++
		default:
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}
	if succeeded != 4 || limited != 2 {
		t.Fatalf("succeeded=%d limited=%d, want 4/2", succeeded, limited)
	}
	if count := downloadCount(t, service, send.ID); count != 5 {
		t.Fatalf("count=%d, want 5", count)
	}
}

// 访问会话清理时声明随之删除，不残留到后续会话。
func TestSendDownloadClaimsCascadeWithSession(t *testing.T) {
	service, _, _, _, owner := newTransfersFixture(t)
	send, files, token := newSendWithDownloads(t, service, owner, nil, 1)
	if _, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(files[0].ID)); err != nil {
		t.Fatal(err)
	}
	var claims int64
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM transfer_download_claims WHERE transfer_id = ?`, send.ID).Scan(&claims); err != nil {
		t.Fatal(err)
	}
	if claims != 1 {
		t.Fatalf("claims=%d, want 1", claims)
	}
	if _, err := service.db.Exec(`DELETE FROM transfer_access_sessions WHERE transfer_id = ?`, send.ID); err != nil {
		t.Fatal(err)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM transfer_download_claims WHERE transfer_id = ?`, send.ID).Scan(&claims); err != nil {
		t.Fatal(err)
	}
	if claims != 0 {
		t.Fatalf("claims survived session cleanup: %d", claims)
	}
	if _, _, err := service.ReserveSendDownload(send.PublicKey, token, SendFileDownloadTarget(files[0].ID)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted session error=%v", err)
	}
}

func newSendWithDownloads(t *testing.T, service *Service, owner int64, maxDownloads *int64, fileCount int) (*Send, []*SendFile, string) {
	t.Helper()
	requireCode := false
	send, _, err := service.CreateSend(CreateSendInput{
		OwnerUserID: owner, Title: "下载会话", MaxDownloads: maxDownloads, RequireCode: &requireCode,
	})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < fileCount; i++ {
		if _, err := service.AddSendUpload(send.ID, owner, fmt.Sprintf("file-%02d.txt", i), strings.NewReader("payload")); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.FinalizeSend(send.ID, owner); err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockSend(send.PublicKey, "", "")
	if err != nil {
		t.Fatal(err)
	}
	files, err := service.ListSendFiles(send.PublicKey, token)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != fileCount {
		t.Fatalf("files=%d, want %d", len(files), fileCount)
	}
	return send, files, token
}

func downloadCount(t *testing.T, service *Service, sendID int64) int64 {
	t.Helper()
	var count int64
	if err := service.db.QueryRow(`SELECT download_count FROM transfers WHERE id = ?`, sendID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
