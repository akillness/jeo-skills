package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/archivestore"
	pgdb "github.com/Autumn-27/artex/db"
)

// An S3-compatible endpoint that answers CreateMultipartUpload with 200 and no
// UploadId makes the SDK's upload manager dereference a nil pointer. The panic
// happens in the archive worker goroutine: it must fail that one job like any
// other upload error, keep the source data, and leave the process running.
func TestReview318ArchiveWorkerSurvivesUploadPanic(t *testing.T) {
	skipWithoutDSN(t)
	t.Setenv("ARTEX_ARCHIVE_STORAGE", "local")
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	s.archiveWG.Wait()

	var creates, unexpected atomic.Int32
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		switch {
		case r.Method == http.MethodPost && r.URL.Query().Has("uploads"):
			creates.Add(1)
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>test</Bucket></InitiateMultipartUploadResult>`)
		case r.Method == http.MethodDelete:
			// The worker's deferred cleanup of the upload that never committed.
			w.WriteHeader(http.StatusNoContent)
		default:
			unexpected.Add(1)
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer remote.Close()
	s.archiveStore, err = archivestore.New(archivestore.Config{Endpoint: remote.URL, Bucket: "test", Prefix: "tasks", AccessKey: "test", SecretKey: "test", PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}

	task, err := m.CreateTask("multipart panic", "keep the source", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() { _, _ = m.pg.Exec(`DELETE FROM task_archives WHERE task_id=$1`, id); _ = m.pg.DeleteTask(id) }()
	if err := m.pg.SetPaused(id, true); err != nil {
		t.Fatal(err)
	}
	// The package must exceed the 8 MiB part size of archivestore.Upload for the
	// upload manager to choose multipart: 9 MiB of random bytes do not compress.
	source := make([]byte, 9<<20)
	if _, err := rand.Read(source); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(m.dir, "tasks", task.ID, "workspace", "large.bin")
	if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, source, 0600); err != nil {
		t.Fatal(err)
	}
	job, err := m.pg.QueueTaskArchive(id)
	if err != nil {
		t.Fatal(err)
	}

	// Run the server's own worker goroutine, as New starts it.
	workerCtx, stopWorker := context.WithCancel(context.Background())
	s.ctx = workerCtx
	s.startTaskArchiveWorker()
	defer func() { stopWorker(); s.archiveWG.Wait() }()

	deadline := time.Now().Add(2 * time.Minute)
	var item *pgdb.TaskArchive
	for {
		item, err = m.pg.GetTaskArchive(job.ID)
		if err != nil {
			t.Fatal(err)
		}
		if item == nil {
			t.Fatal("archive job disappeared")
		}
		if item.State != pgdb.ArchiveQueued && item.State != pgdb.Archiving {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("archive job still %s (%s)", item.State, item.Phase)
		}
		time.Sleep(50 * time.Millisecond)
	}
	if creates.Load() != 1 {
		t.Fatalf("expected one CreateMultipartUpload, got %d: the package did not take the multipart path", creates.Load())
	}
	if item.State != pgdb.ArchiveFailed || !strings.Contains(item.Error, "panic") {
		t.Fatalf("job must be archive_failed with the panic as its error: state=%s error=%q", item.State, item.Error)
	}
	if item.ArchivePath != "" || item.SHA256 != "" || item.ArchivedAt != nil {
		t.Fatalf("a location was committed for a failed archive: path=%q sha256=%q archived_at=%v", item.ArchivePath, item.SHA256, item.ArchivedAt)
	}
	got, err := os.ReadFile(file)
	if err != nil || sha256.Sum256(got) != sha256.Sum256(source) {
		t.Fatalf("source file lost or changed after the panic: %v", err)
	}
	if pgTask, err := m.pg.GetTask(id); err != nil || pgTask == nil {
		t.Fatalf("task lost after the panic: %v", err)
	}
	if unexpected.Load() != 0 {
		t.Fatalf("%d unexpected S3 requests", unexpected.Load())
	}
}
