package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	pgdb "github.com/Autumn-27/artex/db"
)

// An outbox bridges the local PostgreSQL transaction and object storage. Never
// delete the only package before metadata permits it. Unfinished cleanup is
// retried after a restart (and before subsequent jobs).
type remoteArchiveJournal struct {
	ArchiveID int64  `json:"archive_id"`
	URI       string `json:"uri"`
	LocalPath string `json:"local_path,omitempty"`
	Operation string `json:"operation"`
}

func (s *Server) validateStoredArchive(uri string) error {
	if strings.HasPrefix(uri, "s3://") {
		return s.archiveStore.Validate(uri)
	}
	return validateArchivePath(s.m.dir, uri)
}

func removeLocalArchivePackage(filename string) error {
	if err := os.Remove(filename); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *Server) removeStoredArchive(uri string) error {
	if err := s.validateStoredArchive(uri); err != nil {
		return err
	}
	if strings.HasPrefix(uri, "s3://") {
		return s.archiveStore.Delete(s.ctx, uri)
	}
	return removeLocalArchivePackage(uri)
}

func (s *Server) writeRemoteArchiveJournal(j remoteArchiveJournal) (string, error) {
	dir := filepath.Join(taskArchiveRoot(s.m.dir), ".remote")
	if err := os.MkdirAll(dir, archiveDirMode); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(dir, ".journal-")
	if err != nil {
		return "", err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	encodeErr := json.NewEncoder(f).Encode(j)
	syncErr := f.Sync()
	if err := errors.Join(encodeErr, syncErr, f.Close()); err != nil {
		return "", err
	}
	name := tmp + ".json"
	if err := os.Rename(tmp, name); err != nil {
		return "", err
	}
	// Persist the directory entry before an upload or database deletion starts.
	if err := syncDir(dir); err != nil {
		return "", err
	}
	// The .remote directory itself may have just been created.
	return name, syncDir(filepath.Dir(dir))
}

func (s *Server) recoverRemoteArchiveJournals() error {
	dir := filepath.Join(taskArchiveRoot(s.m.dir), ".remote")
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var errs []error
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		name := filepath.Join(dir, entry.Name())
		if err := s.recoverRemoteArchiveJournal(name); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (s *Server) recoverRemoteArchiveJournal(name string) error {
	raw, err := os.ReadFile(name)
	if err != nil {
		return err
	}
	var j remoteArchiveJournal
	if err := json.Unmarshal(raw, &j); err != nil {
		return err
	}
	if j.ArchiveID <= 0 {
		return errors.New("invalid remote archive journal ID")
	}
	if err := s.archiveStore.Validate(j.URI); err != nil {
		return err
	}
	item, err := s.m.pg.GetTaskArchive(j.ArchiveID)
	if err != nil {
		return err
	}
	switch j.Operation {
	case "upload":
		if item == nil || item.ArchivePath != j.URI {
			if err := s.archiveStore.Delete(s.ctx, j.URI); err != nil {
				return err
			}
		}
		if err := validateArchivePath(s.m.dir, j.LocalPath); err != nil {
			return err
		}
		// An old failed upload may outlive a retry after switching back to
		// local storage. The retry reuses this pathname: keep its committed
		// package instead of treating it as the old upload's temporary copy.
		if item == nil || item.ArchivePath != j.LocalPath {
			if err := removeLocalArchivePackage(j.LocalPath); err != nil {
				return err
			}
		}
	case "delete":
		if item == nil {
			if err := s.archiveStore.Delete(s.ctx, j.URI); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unknown remote archive operation %q", j.Operation)
	}
	return os.Remove(name)
}

func (s *Server) deleteRemoteTaskArchive(job *pgdb.TaskArchive) error {
	journal, err := s.writeRemoteArchiveJournal(remoteArchiveJournal{ArchiveID: job.ID, URI: job.ArchivePath, Operation: "delete"})
	if err != nil {
		return err
	}
	if err := s.m.pg.DeleteTaskArchiveStub(job.ID); err != nil {
		// A connection failure can leave the transaction's commit ambiguous.
		// Recovery consults PostgreSQL before deciding whether to delete.
		return err
	}
	if err := s.recoverRemoteArchiveJournal(journal); err != nil {
		// The task is gone; the durable outbox retries the remaining object cleanup.
		log.Printf("[task-archive] archive %d deleted; remote cleanup pending: %v", job.ID, err)
	}
	return nil
}
