package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/archivestore"
	pgdb "github.com/Autumn-27/artex/db"
)

func TestRemoteArchiveLifecycle(t *testing.T) {
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("requires isolated PostgreSQL")
	}
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
	s.ctx = context.Background()
	var mu sync.Mutex
	objects := map[string][]byte{}
	corrupt, failDelete := false, false
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch r.Method {
		case "PUT":
			objects[r.URL.Path], _ = io.ReadAll(r.Body)
			w.Header().Set("ETag", `"test"`)
		case "HEAD":
			w.Header().Set("X-Amz-Server-Side-Encryption", "AES256")
			w.Header().Set("ETag", `"test"`)
			w.Header().Set("Content-Length", strconv.Itoa(len(objects[r.URL.Path])))
		case "GET":
			data := objects[r.URL.Path]
			if corrupt && len(data) > 0 {
				data = bytes.Clone(data)
				data[0] ^= 0xff
			}
			var start, end int64
			if n, err := fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &start, &end); err != nil || n != 2 || start < 0 || end < start || end >= int64(len(data)) || r.Header.Get("If-Match") != `"test"` {
				w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			w.Header().Set("ETag", `"test"`)
			w.Header().Set("Content-Length", strconv.FormatInt(end-start+1, 10))
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(data)))
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write(data[start : end+1])
		case "DELETE":
			if failDelete {
				w.WriteHeader(403)
				return
			}
			delete(objects, r.URL.Path)
			w.WriteHeader(204)
		default:
			w.WriteHeader(400)
		}
	}))
	defer remote.Close()
	s.archiveStore, err = archivestore.New(archivestore.Config{Endpoint: remote.URL, Bucket: "test", Prefix: "tasks", AccessKey: "test", SecretKey: "test", PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	task, err := m.CreateTask("S3 round trip", "preserve data", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() { _, _ = m.pg.Exec(`DELETE FROM task_archives WHERE task_id=$1`, id); _ = m.pg.DeleteTask(id) }()
	if err := m.pg.SetPaused(id, true); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(m.dir, "tasks", task.ID, "workspace", "important.txt")
	if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("keep this content"), 0600); err != nil {
		t.Fatal(err)
	}
	pgTask, err := m.pg.GetTask(id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exploration(pgTask.ExplorationID).AppendActivity(pgdb.Activity{Worker: "system", Kind: "system", Summary: "archive proof"}); err != nil {
		t.Fatal(err)
	}
	job, err := m.pg.QueueTaskArchive(id)
	if err != nil {
		t.Fatal(err)
	}
	// A configured-but-invalid backend must fail before moving any source data.
	s.archiveStoreErr = errors.New("invalid fixture configuration")
	if err := s.runOneTaskArchiveJob(); !errors.Is(err, s.archiveStoreErr) {
		t.Fatalf("configuration error was not returned: %v", err)
	}
	if got, err := os.ReadFile(file); err != nil || string(got) != "keep this content" {
		t.Fatalf("bad configuration lost source: %v", err)
	}
	if pgTask, err := m.pg.GetTask(id); err != nil || pgTask == nil {
		t.Fatal("bad configuration lost task", err)
	}
	s.archiveStoreErr = nil
	if _, err := m.pg.QueueTaskArchive(id); err != nil {
		t.Fatal(err)
	}
	// A corrupt readback must roll back filesystem staging and leave PG intact.
	mu.Lock()
	corrupt = true
	mu.Unlock()
	if err := s.runOneTaskArchiveJob(); err == nil {
		t.Fatal("expected integrity failure")
	}
	if got, _ := os.ReadFile(file); string(got) != "keep this content" {
		t.Fatal("upload failure lost source")
	}
	if task, err := m.pg.GetTask(id); err != nil || task == nil {
		t.Fatal("upload failure lost task")
	}
	mu.Lock()
	corrupt = false
	mu.Unlock()
	if err := s.recoverRemoteArchiveJournals(); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.QueueTaskArchive(id); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatal(err)
	}
	job, err = m.pg.GetTaskArchive(job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if job.State != pgdb.ArchiveReady || job.Storage != "s3" || !strings.HasPrefix(job.ArchivePath, "s3://") {
		t.Fatalf("unexpected archive %+v", job)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("workspace not released")
	}
	if _, err := os.Stat(taskArchivePath(m.dir, job.ID, task.ID)); !os.IsNotExist(err) {
		t.Fatal("local package retained")
	}
	// Simulate the crash window after commit: cleanup keeps the remote object.
	journal, err := s.writeRemoteArchiveJournal(remoteArchiveJournal{ArchiveID: job.ID, URI: job.ArchivePath, LocalPath: taskArchivePath(m.dir, job.ID, task.ID), Operation: "upload"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.recoverRemoteArchiveJournal(journal); err != nil {
		t.Fatal(err)
	}
	// A corrupted download must leave the archive and its remote package intact.
	mu.Lock()
	corrupt = true
	mu.Unlock()
	if _, err := m.pg.QueueTaskArchiveRestore(job.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err == nil {
		t.Fatal("expected corrupted restore to fail")
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("corrupted archive installed workspace files")
	}
	if restored, err := m.pg.IsTaskArchiveRestored(job.ID); err != nil || restored {
		t.Fatalf("corrupted archive restored database: %v %v", restored, err)
	}
	mu.Lock()
	if len(objects) == 0 {
		t.Error("corrupted restore deleted the only remote package")
	}
	corrupt = false
	mu.Unlock()
	// Restoration commits files and PG first. Failed remote deletion is retryable.
	mu.Lock()
	failDelete = true
	mu.Unlock()
	if _, err := m.pg.QueueTaskArchiveRestore(job.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err == nil {
		t.Fatal("expected remote delete failure")
	}
	if got, _ := os.ReadFile(file); string(got) != "keep this content" {
		t.Fatal("restored content differs")
	}
	if restored, err := m.pg.IsTaskArchiveRestored(job.ID); err != nil || !restored {
		t.Fatalf("PG restore %v %v", restored, err)
	}
	mu.Lock()
	failDelete = false
	mu.Unlock()
	if _, err := m.pg.QueueTaskArchiveRestore(job.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatal(err)
	}
	if item, err := m.pg.GetTaskArchive(job.ID); err != nil || item != nil {
		t.Fatal("restore did not consume stub")
	}
	var count int
	if err := m.pg.QueryRow(`SELECT count(*) FROM activity WHERE exploration_id=$1 AND summary='archive proof'`, pgTask.ExplorationID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("activity restore count=%d err=%v", count, err)
	}
	// Re-archive, then crash/retry the deletion outbox after PG removed its stub.
	job, err = m.pg.QueueTaskArchive(id)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	failDelete = true
	mu.Unlock()
	if _, err := m.pg.QueueTaskArchiveDelete(job.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	failDelete = false
	mu.Unlock()
	if err := s.recoverRemoteArchiveJournals(); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	remaining := len(objects)
	mu.Unlock()
	if remaining != 0 {
		t.Fatalf("left %d objects", remaining)
	}
}

// Once PostgreSQL has committed an archive location and checksum, a subsequent
// queued operation must not make startup recovery resurrect the old workspace.
func TestTaskArchiveStageRecoveryAfterCommit(t *testing.T) {
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("requires isolated PostgreSQL")
	}
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	task, err := m.CreateTask("remote stage recovery", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() {
		_, _ = m.pg.Exec("DELETE FROM task_archives WHERE task_id=$1", taskID)
		_ = m.pg.DeleteTask(taskID)
	}()
	if err := m.pg.SetPaused(taskID, true); err != nil {
		t.Fatal(err)
	}
	job, err := m.pg.QueueTaskArchive(taskID)
	if err != nil {
		t.Fatal(err)
	}
	pgTask, err := m.pg.GetTask(taskID)
	if err != nil {
		t.Fatal(err)
	}
	for _, backend := range []string{"local", "s3"} {
		for _, state := range []string{pgdb.ArchiveReady, pgdb.RestoreQueued, pgdb.DeleteQueued, pgdb.ArchiveQueued} {
			t.Run(backend+"/"+state, func(t *testing.T) {
				committed := state != pgdb.ArchiveQueued
				checksum := ""
				if committed {
					checksum = strings.Repeat("a", 64)
				}
				packagePath := taskArchivePath(m.dir, job.ID, task.ID)
				if err := os.MkdirAll(filepath.Dir(packagePath), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(packagePath, []byte("verified package"), 0600); err != nil {
					t.Fatal(err)
				}
				location := packagePath
				if backend == "s3" {
					location = "s3://test/tasks/package.tar.zst"
				}
				if _, err := m.pg.Exec("UPDATE task_archives SET state=$2,archive_path=$3,sha256=$4 WHERE id=$1", job.ID, state, location, checksum); err != nil {
					t.Fatal(err)
				}
				file := filepath.Join(m.dir, "tasks", task.ID, "workspace", "remaining.txt")
				if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(file, []byte("retain until commit"), 0600); err != nil {
					t.Fatal(err)
				}
				stage, err := stageTaskArchiveFiles(m.dir, job.ID, task.ID, pgTask.ExplorationID)
				if err != nil {
					t.Fatal(err)
				}
				if err := recoverTaskArchiveStages(m.dir, m.pg); err != nil {
					t.Fatal(err)
				}
				if _, err := os.Stat(stage.root); !os.IsNotExist(err) {
					t.Fatalf("staging cleanup incomplete: %v", err)
				}
				if backend == "local" && committed {
					if data, err := os.ReadFile(packagePath); err != nil || string(data) != "verified package" {
						t.Fatal("committed local package lost", err)
					}
				} else if !committed {
					if _, err := os.Stat(packagePath); !os.IsNotExist(err) {
						t.Fatal("uncommitted temporary package retained", err)
					}
				}
				if committed {
					if _, err := os.Stat(file); !os.IsNotExist(err) {
						t.Fatalf("resurrected committed workspace: %v", err)
					}
				} else if data, err := os.ReadFile(file); err != nil || string(data) != "retain until commit" {
					t.Fatalf("uncommitted archive lost source: %v", err)
				}
			})
		}
	}
}

// Failed remote cleanup can survive switching to local storage and retrying the
// same archive ID. Its journal must never remove the newly committed local copy.
func TestRemoteArchiveJournalPreservesLocalRetry(t *testing.T) {
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("requires isolated PostgreSQL")
	}
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	task, err := m.CreateTask("local retry", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() {
		_, _ = m.pg.Exec("DELETE FROM task_archives WHERE task_id=$1", taskID)
		_ = m.pg.DeleteTask(taskID)
	}()
	if err := m.pg.SetPaused(taskID, true); err != nil {
		t.Fatal(err)
	}
	job, err := m.pg.QueueTaskArchive(taskID)
	if err != nil {
		t.Fatal(err)
	}
	filename := taskArchivePath(m.dir, job.ID, task.ID)
	if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, []byte("committed local archive"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec("UPDATE task_archives SET state=$2,archive_path=$3,sha256=$4 WHERE id=$1", job.ID, pgdb.ArchiveReady, filename, strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
	var deletes atomic.Int32
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		deletes.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer remote.Close()
	store, err := archivestore.New(archivestore.Config{Endpoint: remote.URL, Bucket: "test", Prefix: "tasks", AccessKey: "test", SecretKey: "test", PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{ctx: context.Background(), m: m, archiveStore: store}
	journal, err := s.writeRemoteArchiveJournal(remoteArchiveJournal{
		ArchiveID: job.ID, URI: store.URI(taskID, job.ID, strings.Repeat("b", 64)),
		LocalPath: filename, Operation: "upload",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.recoverRemoteArchiveJournal(journal); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filename); err != nil || string(data) != "committed local archive" {
		t.Fatalf("old upload cleanup removed local retry: %v", err)
	}
	if deletes.Load() != 1 {
		t.Fatal("uncommitted remote object was not removed")
	}
	if _, err := os.Stat(journal); !os.IsNotExist(err) {
		t.Fatalf("finished journal remains: %v", err)
	}
}
