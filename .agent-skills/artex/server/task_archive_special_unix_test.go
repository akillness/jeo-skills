//go:build unix

package server

import (
	"net"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	pgdb "github.com/Autumn-27/artex/db"
)

// A named pipe or a socket left in the task workspace by a command must not
// make the archive unrestorable, nor stop the task from being archived.
func TestTaskArchiveSkipsSpecialFiles(t *testing.T) {
	// A short root: a socket path is limited to about 100 bytes.
	dataDir, err := os.MkdirTemp("/tmp", "arch")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dataDir) })
	taskID := "42"
	runDir := filepath.Join(dataDir, "tasks", taskID, "main")
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		t.Fatal(err)
	}
	evidence := filepath.Join(runDir, "evidence.txt")
	if err := os.WriteFile(evidence, []byte("task evidence"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Mkfifo(filepath.Join(runDir, "backpipe"), 0o600); err != nil {
		t.Skipf("mkfifo: %v", err)
	}
	ln, err := net.Listen("unix", filepath.Join(runDir, "ctl.sock"))
	if err != nil {
		t.Skipf("unix socket: %v", err)
	}
	ln.(*net.UnixListener).SetUnlinkOnClose(false)
	ln.Close()

	stage, err := stageTaskArchiveFiles(dataDir, 1, taskID, 7)
	if err != nil {
		t.Fatal(err)
	}
	archivePath := taskArchivePath(dataDir, 1, taskID)
	snapshot := &pgdb.TaskArchiveSnapshot{FormatVersion: pgdb.TaskArchiveFormatVersion, TaskID: 42, ExplorationID: 7}
	_, _, checksum, err := writeTaskArchivePackage(archivePath, stage.payload, snapshot)
	if err != nil {
		t.Fatalf("the task could not be archived: %v", err)
	}
	if err := stage.commit(); err != nil {
		t.Fatal(err)
	}
	extracted := filepath.Join(dataDir, "restore")
	if err := extractTaskArchivePackage(archivePath, checksum, extracted); err != nil {
		t.Fatalf("the archive of the task cannot be restored: %v", err)
	}
	installed, err := installTaskArchiveFiles(dataDir, extracted, taskID, 1, ExecPrivilege{})
	if err != nil {
		t.Fatal(err)
	}
	if err := installed.commit(); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(evidence); err != nil || string(got) != "task evidence" {
		t.Fatalf("restored %s = %q, %v", evidence, got, err)
	}
}
