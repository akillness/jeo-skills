package server

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"

	"github.com/Autumn-27/artex/archivestore"
	pgdb "github.com/Autumn-27/artex/db"
)

// Recreate persisted states at operation boundaries, then run the same recovery
// functions used at startup. PostgreSQL, files, and HTTP object storage are real
// isolated fixtures; no production failpoint hooks are needed.
func TestRemoteArchiveInterruptionRecovery(t *testing.T) {
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("requires isolated PostgreSQL")
	}
	phases := []string{
		"staged_before_compression", "compression_partial", "compressed_before_journal", "journal_before_upload",
		"uploaded_before_verification", "verified_before_database",
		"database_before_local_cleanup", "package_cleaned_before_stage_cleanup",
		"restore_download_before_install", "restore_files_before_database", "restore_database_before_object_delete", "restore_object_deleted_before_stub",
		"delete_journal_before_database", "delete_database_before_object",
	}
	for _, phase := range phases {
		t.Run(phase, func(t *testing.T) {
			m, err := NewManager(t.TempDir(), "")
			if err != nil {
				t.Fatal(err)
			}
			defer m.Close()
			store, objects := newRecoveryObjectStore(t)
			s := &Server{ctx: context.Background(), m: m, archiveStore: store}
			task, err := m.CreateTask("interruption "+phase, "preserve source", nil, 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			id, _ := strconv.ParseInt(task.ID, 10, 64)
			defer func() { _, _ = m.pg.Exec("DELETE FROM task_archives WHERE task_id=$1", id); _ = m.pg.DeleteTask(id) }()
			if err := m.pg.SetPaused(id, true); err != nil {
				t.Fatal(err)
			}
			job, err := m.pg.QueueTaskArchive(id)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := m.pg.Exec("UPDATE task_archives SET state=$2 WHERE id=$1", job.ID, pgdb.Archiving); err != nil {
				t.Fatal(err)
			}
			source := filepath.Join(m.dir, "tasks", task.ID, "workspace", "source.txt")
			if err := os.MkdirAll(filepath.Dir(source), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(source, []byte("original task data"), 0600); err != nil {
				t.Fatal(err)
			}
			snapshot, err := m.pg.SnapshotTaskArchive(id)
			if err != nil {
				t.Fatal(err)
			}
			stage, err := stageTaskArchiveFiles(m.dir, job.ID, task.ID, snapshot.ExplorationID)
			if err != nil {
				t.Fatal(err)
			}
			packagePath := taskArchivePath(m.dir, job.ID, task.ID)
			if phase == "compression_partial" {
				if err := os.MkdirAll(filepath.Dir(packagePath), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(packagePath+".partial", []byte("incomplete compressed package"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			var original, compressed int64
			var checksum, uri, journal string
			if phase != "staged_before_compression" && phase != "compression_partial" {
				original, compressed, checksum, err = writeTaskArchivePackage(packagePath, stage.payload, snapshot)
				if err != nil {
					t.Fatal(err)
				}
				uri = store.URI(id, job.ID, checksum)
			}
			if phase != "staged_before_compression" && phase != "compression_partial" && phase != "compressed_before_journal" {
				journal, err = s.writeRemoteArchiveJournal(remoteArchiveJournal{ArchiveID: job.ID, URI: uri, LocalPath: packagePath, Operation: "upload"})
				if err != nil {
					t.Fatal(err)
				}
			}
			committed := phase != "staged_before_compression" && phase != "compression_partial" && phase != "compressed_before_journal" &&
				phase != "journal_before_upload" && phase != "uploaded_before_verification" && phase != "verified_before_database"
			if phase == "uploaded_before_verification" {
				data, err := os.ReadFile(packagePath)
				if err != nil {
					t.Fatal(err)
				}
				objects.put(uri, data)
			} else if phase == "verified_before_database" || committed {
				if err := store.Upload(s.ctx, uri, packagePath, checksum); err != nil {
					t.Fatal(err)
				}
			}
			if committed {
				if err := m.pg.CompleteTaskArchive(job.ID, snapshot, uri, checksum, original, compressed); err != nil {
					t.Fatal(err)
				}
			}
			afterArchive := phase == "restore_download_before_install" || phase == "restore_files_before_database" || phase == "restore_database_before_object_delete" ||
				phase == "restore_object_deleted_before_stub" || phase == "delete_journal_before_database" || phase == "delete_database_before_object"
			if phase == "package_cleaned_before_stage_cleanup" || afterArchive {
				if err := os.Remove(packagePath); err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(journal); err != nil {
					t.Fatal(err)
				}
			}
			if afterArchive {
				if err := stage.commit(); err != nil {
					t.Fatal(err)
				}
			}
			restored := false
			remoteDeleted := false
			if phase == "restore_download_before_install" || phase == "restore_files_before_database" || phase == "restore_database_before_object_delete" || phase == "restore_object_deleted_before_stub" {
				if _, err := m.pg.Exec("UPDATE task_archives SET state=$2 WHERE id=$1", job.ID, pgdb.Restoring); err != nil {
					t.Fatal(err)
				}
				parent := filepath.Join(taskArchiveRoot(m.dir), ".restore")
				if err := os.MkdirAll(parent, 0700); err != nil {
					t.Fatal(err)
				}
				extracted, err := os.MkdirTemp(parent, "interrupted-")
				if err != nil {
					t.Fatal(err)
				}
				downloaded := filepath.Join(extracted, "download.tar.zst")
				if err := store.Download(s.ctx, uri, downloaded, checksum, compressed); err != nil {
					t.Fatal(err)
				}
				if err := extractTaskArchivePackage(downloaded, checksum, extracted); err != nil {
					t.Fatal(err)
				}
				if phase != "restore_download_before_install" {
					if _, err := installTaskArchiveFiles(m.dir, extracted, task.ID, job.ID, s.execPriv); err != nil {
						t.Fatal(err)
					}
				}
				if phase == "restore_database_before_object_delete" || phase == "restore_object_deleted_before_stub" {
					if _, err := m.pg.RestoreTaskArchive(job.ID, snapshot, 0); err != nil {
						t.Fatal(err)
					}
					restored = true
				}
				if phase == "restore_object_deleted_before_stub" {
					if err := store.Delete(s.ctx, uri); err != nil {
						t.Fatal(err)
					}
					remoteDeleted = true
				}
			}
			deleting := phase == "delete_journal_before_database" || phase == "delete_database_before_object"
			if deleting {
				if _, err := m.pg.Exec("UPDATE task_archives SET state=$2 WHERE id=$1", job.ID, pgdb.Deleting); err != nil {
					t.Fatal(err)
				}
				if _, err := s.writeRemoteArchiveJournal(remoteArchiveJournal{ArchiveID: job.ID, URI: uri, Operation: "delete"}); err != nil {
					t.Fatal(err)
				}
				if phase == "delete_database_before_object" {
					if err := m.pg.DeleteTaskArchiveStub(job.ID); err != nil {
						t.Fatal(err)
					}
					remoteDeleted = true
				}
			}
			if err := m.pg.RecoverTaskArchiveJobs(); err != nil {
				t.Fatal(err)
			}
			if err := recoverTaskArchiveStages(m.dir, m.pg); err != nil {
				t.Fatal(err)
			}
			if err := recoverTaskArchiveRestoreStages(m.dir, m.pg); err != nil {
				t.Fatal(err)
			}
			if err := s.recoverRemoteArchiveJournals(); err != nil {
				t.Fatal(err)
			}
			wantSource := !committed || restored
			data, fileErr := os.ReadFile(source)
			if wantSource && (fileErr != nil || string(data) != "original task data") {
				t.Fatalf("source data lost: %v", fileErr)
			}
			if !wantSource && !os.IsNotExist(fileErr) {
				t.Fatalf("archived source resurrected: %v", fileErr)
			}
			if _, err := os.Stat(packagePath); !os.IsNotExist(err) {
				t.Fatalf("temporary package remains: %v", err)
			}
			if _, err := os.Stat(packagePath + ".partial"); !os.IsNotExist(err) {
				t.Fatalf("partial package remains: %v", err)
			}
			if got, want := objects.has(uri), committed && !remoteDeleted; got != want {
				t.Fatalf("remote object exists=%v, want=%v", got, want)
			}
			if committed && !deleting {
				actual, err := m.pg.IsTaskArchiveRestored(job.ID)
				if err != nil || actual != restored {
					t.Fatalf("restored=%v want=%v err=%v", actual, restored, err)
				}
			}
			// A second startup must be harmless at every boundary.
			if err := recoverTaskArchiveStages(m.dir, m.pg); err != nil {
				t.Fatal(err)
			}
			if err := recoverTaskArchiveRestoreStages(m.dir, m.pg); err != nil {
				t.Fatal(err)
			}
			if err := s.recoverRemoteArchiveJournals(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

type recoveryObjects struct {
	mu   sync.Mutex
	data map[string][]byte
}

func (o *recoveryObjects) put(uri string, data []byte) {
	o.mu.Lock()
	defer o.mu.Unlock()
	// Test URIs always use the fixture bucket with path-style addressing.
	o.data["/test/"+uri[len("s3://test/"):]] = append([]byte(nil), data...)
}
func (o *recoveryObjects) has(uri string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	if uri == "" {
		return false
	}
	_, ok := o.data["/test/"+uri[len("s3://test/"):]]
	return ok
}
func newRecoveryObjectStore(t *testing.T) (*archivestore.Store, *recoveryObjects) {
	t.Helper()
	objects := &recoveryObjects{data: map[string][]byte{}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		objects.mu.Lock()
		defer objects.mu.Unlock()
		data, exists := objects.data[r.URL.Path]
		w.Header().Set("ETag", `"recovery-etag"`)
		switch r.Method {
		case "PUT":
			if r.Header.Get("X-Amz-Server-Side-Encryption") != "AES256" {
				t.Error("missing SSE")
			}
			objects.data[r.URL.Path], _ = io.ReadAll(r.Body)
		case "HEAD":
			if !exists {
				w.WriteHeader(404)
				return
			}
			w.Header().Set("Content-Length", strconv.Itoa(len(data)))
			w.Header().Set("X-Amz-Server-Side-Encryption", "AES256")
		case "GET":
			if !exists {
				w.WriteHeader(404)
				return
			}
			var start, end int
			if n, err := fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &start, &end); err != nil || n != 2 || start < 0 || end >= len(data) || r.Header.Get("If-Match") != `"recovery-etag"` {
				w.WriteHeader(416)
				return
			}
			w.Header().Set("Content-Length", strconv.Itoa(end-start+1))
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(data)))
			w.WriteHeader(206)
			_, _ = w.Write(data[start : end+1])
		case "DELETE":
			delete(objects.data, r.URL.Path)
			w.WriteHeader(204)
		default:
			t.Errorf("unexpected object request %s", r.Method)
			w.WriteHeader(400)
		}
	}))
	t.Cleanup(srv.Close)
	store, err := archivestore.New(archivestore.Config{Endpoint: srv.URL, Bucket: "test", Prefix: "tasks", AccessKey: "test", SecretKey: "test", PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	return store, objects
}

// Neither a rollback conflict nor a temporary-file cleanup failure may discard
// the staging journal: recovery must be safe to retry after the obstruction ends.
func TestArchivePartialRecoveryRetainsJournalOnFailure(t *testing.T) {
	if os.Getenv("ARTEX_PG_DSN") == "" {
		t.Skip("requires isolated PostgreSQL")
	}
	for _, failure := range []string{"rollback-conflict", "cleanup-failure"} {
		t.Run(failure, func(t *testing.T) {
			m, err := NewManager(t.TempDir(), "")
			if err != nil {
				t.Fatal(err)
			}
			defer m.Close()
			task, err := m.CreateTask("partial recovery "+failure, "retain source", nil, 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			id, _ := strconv.ParseInt(task.ID, 10, 64)
			defer func() { _, _ = m.pg.Exec("DELETE FROM task_archives WHERE task_id=$1", id); _ = m.pg.DeleteTask(id) }()
			if err := m.pg.SetPaused(id, true); err != nil {
				t.Fatal(err)
			}
			job, err := m.pg.QueueTaskArchive(id)
			if err != nil {
				t.Fatal(err)
			}
			source := filepath.Join(m.dir, "tasks", task.ID, "workspace", "source.txt")
			if err := os.MkdirAll(filepath.Dir(source), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(source, []byte("original"), 0600); err != nil {
				t.Fatal(err)
			}
			snapshot, err := m.pg.SnapshotTaskArchive(id)
			if err != nil {
				t.Fatal(err)
			}
			stage, err := stageTaskArchiveFiles(m.dir, job.ID, task.ID, snapshot.ExplorationID)
			if err != nil {
				t.Fatal(err)
			}
			partial := taskArchivePath(m.dir, job.ID, task.ID) + ".partial"
			if err := os.MkdirAll(filepath.Dir(partial), 0700); err != nil {
				t.Fatal(err)
			}
			var obstruction string
			if failure == "rollback-conflict" {
				if len(stage.journal.Moves) == 0 {
					t.Fatal("no staged source")
				}
				obstruction = stage.journal.Moves[0].Source
				if err := os.MkdirAll(obstruction, 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(partial, []byte("partial"), 0600); err != nil {
					t.Fatal(err)
				}
			} else {
				if err := os.Mkdir(partial, 0700); err != nil {
					t.Fatal(err)
				}
				obstruction = filepath.Join(partial, "block-remove")
				if err := os.WriteFile(obstruction, []byte("fixture"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := recoverTaskArchiveStages(m.dir, m.pg); err == nil {
				t.Fatal("expected recovery obstruction")
			}
			if _, err := os.Stat(filepath.Join(stage.root, "journal.json")); err != nil {
				t.Fatal("lost retry journal", err)
			}
			if _, err := os.Stat(partial); err != nil {
				t.Fatal("removed partial before successful recovery", err)
			}
			if failure == "cleanup-failure" {
				if got, err := os.ReadFile(source); err != nil || string(got) != "original" {
					t.Fatal("source was not rolled back", err)
				}
			}
			if err := os.RemoveAll(obstruction); err != nil {
				t.Fatal(err)
			}
			if err := recoverTaskArchiveStages(m.dir, m.pg); err != nil {
				t.Fatal(err)
			}
			if got, err := os.ReadFile(source); err != nil || string(got) != "original" {
				t.Fatal("source lost on retry", err)
			}
			for _, path := range []string{stage.root, partial} {
				if _, err := os.Stat(path); !os.IsNotExist(err) {
					t.Fatalf("recovery left %s: %v", path, err)
				}
			}
			if err := recoverTaskArchiveStages(m.dir, m.pg); err != nil {
				t.Fatal(err)
			}
		})
	}
}
