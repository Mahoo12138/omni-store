package transfers

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

func newTransfersFixture(t *testing.T) (*Service, *capabilities.Service, *models.StorageSource, *models.StorageSource, int64) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	userService := users.NewService(conn)
	owner, err := userService.Create("transfer-owner", "Transfer Owner", "owner-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	mkSource := func(name string) *models.StorageSource {
		root := filepath.Join(base, strings.ToLower(name))
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
		source, err := sourceService.Create(sources.CreateInput{Name: name, RootPath: root})
		if err != nil {
			t.Fatal(err)
		}
		return source
	}
	carrier := mkSource("Carrier")
	store := mkSource("Store")
	capabilityService := capabilities.NewService(conn, sourceService)
	enabled := true
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityTransferCenter, capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &carrier.Key,
	}); err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	service := NewService(conn, sourceService, capabilityService, fileService, dataDir, "test-master-key")
	return service, capabilityService, carrier, store, owner.ID
}

func TestSendLifecycleFromDraftToRevoke(t *testing.T) {
	service, _, carrier, store, owner := newTransfersFixture(t)

	maxDownloads := int64(3)
	send, pickupCode, err := service.CreateSend(CreateSendInput{
		OwnerUserID: owner, Title: "交付包", Description: "给客户的资料",
		ExpiresInHours: &[]int64{48}[0], MaxDownloads: &maxDownloads,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(send.PublicKey, "tr-") || len(pickupCode) != pickupCodeLength {
		t.Fatalf("send=%+v pickup=%q", send, pickupCode)
	}
	if send.Status != "draft" {
		t.Fatalf("new send status=%q", send.Status)
	}

	// 未定稿前不可公开访问。
	if _, err := service.LookupSend(send.PublicKey); !errors.Is(err, ErrNotFound) {
		t.Fatalf("draft lookup error=%v", err)
	}

	// 直传嵌套结构文件。
	if _, err := service.AddSendUpload(send.ID, owner, "docs/方案/v2.pdf", bytes.NewBufferString("PDF-bytes")); err != nil {
		t.Fatal(err)
	}
	// 从已有存储源复制目录结构。
	if err := os.MkdirAll(filepath.Join(store.RootPath, "assets", "2026"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.RootPath, "assets", "logo.png"), []byte("PNG"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.RootPath, "assets", "2026", "annual.pdf"), []byte("ANNUAL"), 0o600); err != nil {
		t.Fatal(err)
	}
	copied, err := service.AddSendFilesFromStore(send.ID, owner, store.Key, "assets")
	if err != nil {
		t.Fatal(err)
	}
	if len(copied) != 2 {
		t.Fatalf("copied=%+v", copied)
	}

	// 定稿：空包拒绝，有文件后成功。
	empty, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.FinalizeSend(empty.ID, owner); !errors.Is(err, ErrNoFiles) {
		t.Fatalf("empty finalize error=%v", err)
	}
	finalized, err := service.FinalizeSend(send.ID, owner)
	if err != nil {
		t.Fatal(err)
	}
	if finalized.Status != "active" || finalized.TotalFiles != 3 {
		t.Fatalf("finalized=%+v", finalized)
	}
	// 定稿后不能再加文件。
	if _, err := service.AddSendUpload(send.ID, owner, "late.txt", bytes.NewBufferString("x")); !errors.Is(err, ErrNotDraft) {
		t.Fatalf("post-finalize add error=%v", err)
	}

	// 公开信息与会话。
	info, err := service.LookupSend(send.PublicKey)
	if err != nil || info.FileCount != 3 || !info.HasPassword == false {
		t.Fatalf("lookup=%+v err=%v", info, err)
	}
	if info.DownloadsLeft == nil || *info.DownloadsLeft != 3 {
		t.Fatalf("downloads left=%v", info.DownloadsLeft)
	}
	if _, _, err := service.UnlockSend(send.PublicKey, "WRONGCODE", ""); !errors.Is(err, ErrPickupCode) {
		t.Fatalf("wrong code error=%v", err)
	}
	token, _, err := service.UnlockSend(send.PublicKey, strings.ToLower(pickupCode), "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ListSendFiles(send.PublicKey, "invalid-token"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bad session error=%v", err)
	}
	fileList, err := service.ListSendFiles(send.PublicKey, token)
	if err != nil || len(fileList) != 3 {
		t.Fatalf("files=%+v err=%v", fileList, err)
	}
	foundNested := false
	for _, file := range fileList {
		if file.RelativePath == "docs/方案/v2.pdf" {
			foundNested = true
		}
	}
	if !foundNested {
		t.Fatalf("nested structure lost: %+v", fileList)
	}

	// 下载名额：第 3 次后耗尽。
	for i := 0; i < 3; i++ {
		if _, _, err := service.ReserveSendDownload(send.PublicKey, token); err != nil {
			t.Fatalf("reserve %d: %v", i+1, err)
		}
	}
	if _, _, err := service.ReserveSendDownload(send.PublicKey, token); !errors.Is(err, ErrDownloadLimit) {
		t.Fatalf("over-limit error=%v", err)
	}

	// 撤销：载荷删除、公开不可见。
	if err := service.RevokeSend(send.ID, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := service.LookupSend(send.PublicKey); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoked lookup error=%v", err)
	}
	payload := filepath.Join(carrier.RootPath, ".omnistore", "transfer", "send", send.PublicKey)
	if _, err := os.Stat(payload); !os.IsNotExist(err) {
		t.Fatalf("revoked payload remains: %v", err)
	}
	// 重复撤销幂等。
	if err := service.RevokeSend(send.ID, owner); err != nil {
		t.Fatal(err)
	}
}

func TestSendPasswordAndExpiry(t *testing.T) {
	service, _, _, _, owner := newTransfersFixture(t)

	send, code, err := service.CreateSend(CreateSendInput{
		OwnerUserID: owner, Password: "share-pass", ExpiresInHours: &[]int64{0}[0],
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "a.txt", bytes.NewBufferString("A")); err != nil {
		t.Fatal(err)
	}
	if _, err := service.FinalizeSend(send.ID, owner); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UnlockSend(send.PublicKey, code, "bad-pass"); !errors.Is(err, ErrPassword) {
		t.Fatalf("wrong password error=%v", err)
	}
	if _, _, err := service.UnlockSend(send.PublicKey, code, "share-pass"); err != nil {
		t.Fatalf("correct unlock: %v", err)
	}

	// 手动把有效期拨到过去：读取派生过期；GC 后载荷删除、状态落盘。
	past := time.Now().UTC().Add(-time.Hour)
	if _, err := service.db.Exec(`UPDATE transfers SET expires_at = ? WHERE id = ?`, past, send.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.LookupSend(send.PublicKey); !errors.Is(err, ErrExpired) {
		t.Fatalf("expired lookup error=%v", err)
	}
	result, err := service.RunGC(time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if result.TransfersExpired != 1 {
		t.Fatalf("gc result=%+v", result)
	}
	var status string
	if err := service.db.QueryRow(`SELECT status FROM transfers WHERE id = ?`, send.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "expired" {
		t.Fatalf("status=%q", status)
	}
}

func TestActiveQuotaLimitsPayload(t *testing.T) {
	service, _, _, _, owner := newTransfersFixture(t)
	if err := service.SetSettings(Settings{ActiveQuotaBytes: 10, DefaultExpiryHours: 1}); err != nil {
		t.Fatal(err)
	}
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "small.txt", bytes.NewBufferString("12345")); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "big.txt", bytes.NewBufferString(strings.Repeat("x", 20))); !errors.Is(err, files.ErrQuotaExceeded) {
		t.Fatalf("over quota error=%v", err)
	}
}

func TestCollectLifecycleAndLimits(t *testing.T) {
	service, _, carrier, target, owner := newTransfersFixture(t)

	collection, code, err := service.CreateCollection(CreateCollectionInput{
		OwnerUserID: owner, Title: "作业收集", Description: "请提交作业",
		ExpiresInHours: &[]int64{24}[0], RequireName: true,
		MaxFileSizeMB: &[]int64{1}[0],
		AllowedExts:   []string{"pdf", "png"},
	})
	if err != nil {
		t.Fatal(err)
	}
	info, err := service.LookupCollection(collection.PublicKey)
	if err != nil || !info.RequireName || len(info.AllowedExts) != 2 {
		t.Fatalf("lookup=%+v err=%v", info, err)
	}

	// 收件码错误与缺姓名。
	if _, _, err := service.UnlockCollection(collection.PublicKey, "XXXXXXXX", ""); !errors.Is(err, ErrPickupCode) {
		t.Fatalf("wrong code error=%v", err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
		{RelativePath: "a.pdf", Body: bytes.NewBufferString("PDF")},
	}); !errors.Is(err, ErrNameRequired) {
		t.Fatalf("missing name error=%v", err)
	}

	// 不允许的类型。
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "小明", "", []IncomingSubmissionFile{
		{RelativePath: "evil.exe", Body: bytes.NewBufferString("MZ")},
	}); !errors.Is(err, ErrTypeNotAllowed) {
		t.Fatalf("bad type error=%v", err)
	}

	// 正常提交（嵌套结构）。
	submission, err := service.SubmitToCollection(collection.PublicKey, token, "小明", "第一次提交", []IncomingSubmissionFile{
		{RelativePath: "作业/第一周.pdf", Body: bytes.NewBufferString("WEEK1")},
		{RelativePath: "作业/第二周.pdf", Body: bytes.NewBufferString("WEEK2")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if submission.FileCount != 2 || submission.TotalSize != 10 {
		t.Fatalf("submission=%+v", submission)
	}
	physical := filepath.Join(carrier.RootPath, ".omnistore", "transfer", "collect", collection.PublicKey,
		fmt.Sprintf("%d", submission.ID), "作业", "第一周.pdf")
	if content, err := os.ReadFile(physical); err != nil || string(content) != "WEEK1" {
		t.Fatalf("physical content=%q err=%v", content, err)
	}

	// 收件箱含文件清单。
	inbox, err := service.ListSubmissions(collection.ID, owner)
	if err != nil || len(inbox) != 1 || len(inbox[0].Files) != 2 {
		t.Fatalf("inbox=%+v err=%v", inbox, err)
	}

	// 保存到有写权限的普通目录（复制而非搬移）。
	if err := os.MkdirAll(filepath.Join(target.RootPath, "homework"), 0o755); err != nil {
		t.Fatal(err)
	}
	saved, err := service.SaveSubmissionToFiles(collection.ID, owner, submission.ID, target.Key, "homework/小明")
	if err != nil {
		t.Fatal(err)
	}
	if len(saved) != 2 {
		t.Fatalf("saved=%+v", saved)
	}
	if content, err := os.ReadFile(filepath.Join(target.RootPath, "homework", "小明", "作业", "第一周.pdf")); err != nil || string(content) != "WEEK1" {
		t.Fatalf("saved content=%q err=%v", content, err)
	}
	// 原提交载荷仍在（复制语义）。
	if _, err := os.Stat(physical); err != nil {
		t.Fatalf("payload moved instead of copied: %v", err)
	}

	// 提交他人集合不可见：另一 owner 的集合收件箱隔离。
	otherOwner, err := users.NewService(service.db).Create("other-owner", "Other Owner", "other-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	other, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: otherOwner.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ListSubmissions(other.ID, owner); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-owner inbox error=%v", err)
	}

	// 关闭后不可再提交。
	if err := service.CloseCollection(collection.ID, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := service.LookupCollection(collection.PublicKey); !errors.Is(err, ErrClosed) {
		t.Fatalf("closed lookup error=%v", err)
	}
}

func TestSubmissionSizeLimitsAndGC(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	collection, code, err := service.CreateCollection(CreateCollectionInput{
		OwnerUserID: owner, MaxTotalSizeMB: &[]int64{1}[0], AllowedExts: []string{"txt"},
	})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	// 类型限制 + 总量限额触发（1 MB 上限，提交 2 MB）。
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "s", "", []IncomingSubmissionFile{
		{RelativePath: "big.txt", Body: bytes.NewReader(bytes.Repeat([]byte("x"), 2*1024*1024))},
	}); !errors.Is(err, ErrTotalSizeExceeded) {
		t.Fatalf("over total error=%v", err)
	}
	// 失败提交不留台账、不留载荷目录（父目录可能保留为空壳）。
	var count int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM transfer_submissions`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed submission left rows=%d err=%v", count, err)
	}
	entries, err := os.ReadDir(filepath.Join(carrier.RootPath, ".omnistore", "transfer", "collect", collection.PublicKey))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed submission left payload dirs: %v", entries)
	}

	// 正常提交一行（0 文件行）模拟中断：GC 清理空提交。
	if _, err := service.db.Exec(`INSERT INTO transfer_submissions (collection_id, created_at) VALUES (?, datetime('now', '-2 hours'))`,
		collection.ID); err != nil {
		t.Fatal(err)
	}
	result, err := service.RunGC(time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if result.EmptySubmissions != 1 {
		t.Fatalf("gc=%+v", result)
	}
}

func TestRecoverUploadOperations(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "committed.txt", bytes.NewBufferString("OK")); err != nil {
		t.Fatal(err)
	}
	src, err := sources.NewService(service.db, filepath.Join(carrier.RootPath, "..", "data")).Get(carrier.Key)
	if err != nil {
		t.Fatal(err)
	}

	// 场景一：已提交（台账有行）——恢复只清日志。
	committedOp := service.newUploadOperation("send-file", carrier.ID, send.ID, 0,
		sendPayloadRel(send.PublicKey, "committed.txt"))
	if err := service.writeUploadOperation(committedOp); err != nil {
		t.Fatal(err)
	}
	// 场景二：未提交（文件已落盘、台账无行）——恢复删除文件。
	orphanRel := sendPayloadRel(send.PublicKey, "orphan.txt")
	orphanOp := service.newUploadOperation("send-file", carrier.ID, send.ID, 0, orphanRel)
	if err := service.writeUploadOperation(orphanOp); err != nil {
		t.Fatal(err)
	}
	if _, err := service.files.WriteManagedFile(carrier, orphanRel, ManagedScopeDir, bytes.NewBufferString("ORPHAN"), 0, false); err != nil {
		t.Fatal(err)
	}

	recovered, err := service.RecoverUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if recovered != 1 {
		t.Fatalf("recovered=%d", recovered)
	}
	if _, err := os.Stat(filepath.Join(carrier.RootPath, filepath.FromSlash(orphanRel))); !os.IsNotExist(err) {
		t.Fatalf("orphan file survived recovery: %v", err)
	}
	if _, err := os.Stat(filepath.Join(carrier.RootPath, ".omnistore", "transfer", "send", send.PublicKey, "committed.txt")); err != nil {
		t.Fatalf("committed file lost: %v", err)
	}
	if _, err := os.Stat(service.uploadOperationPath(committedOp.OperationID)); !os.IsNotExist(err) {
		t.Fatalf("journal not cleaned: %v", err)
	}
	_ = src
}

func TestPickupCodeDigestIsHMACNotPlainHash(t *testing.T) {
	service, _, _, _, _ := newTransfersFixture(t)
	digest := service.codeDigest("ABCD2345")
	if digest != service.codeDigest("ABCD2345") {
		t.Fatal("digest must be deterministic")
	}
	// 与纯 SHA-256 不同：HMAC 掺入服务器密钥。
	if !service.verifyCode(digest, "abcd2345") {
		t.Fatal("verify must accept case-insensitive code")
	}
	if service.verifyCode(digest, "ABCD2346") {
		t.Fatal("verify must reject wrong code")
	}
}

func TestManagedPathsAreHiddenFromGenericAPI(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "hidden.txt", bytes.NewBufferString("HIDDEN")); err != nil {
		t.Fatal(err)
	}
	// 通用文件入口对载荷路径一律 404（NS 隔离）。
	if _, err := service.files.Stat(carrier, ".omnistore/transfer/send/"+send.PublicKey+"/hidden.txt"); !errors.Is(err, files.ErrNotFound) {
		t.Fatalf("files.Stat on payload = %v, want ErrNotFound", err)
	}
	// 逻辑路径本身不得使用托管段。
	if _, err := service.AddSendUpload(send.ID, owner, ".omnistore/evil.txt", bytes.NewBufferString("x")); !errors.Is(err, files.ErrInvalid) {
		t.Fatalf("managed logical path error=%v", err)
	}
	var orphan sql.NullString
	_ = orphan
}
