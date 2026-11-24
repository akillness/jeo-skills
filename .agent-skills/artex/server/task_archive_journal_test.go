package server

import (
	"encoding/json"
	"os"
	"testing"
)

// Writing the journal must succeed on every platform the server builds for. It
// needs no database: on Windows the directory sync it ended with failed, so no
// remote archive or remote deletion could start.
func TestRemoteArchiveJournalWrite(t *testing.T) {
	s := &Server{m: &Manager{dir: t.TempDir()}}
	want := remoteArchiveJournal{ArchiveID: 7, URI: "s3://bucket/tasks/package.tar.zst", LocalPath: "package.tar.zst", Operation: "upload"}
	name, err := s.writeRemoteArchiveJournal(want)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	var got remoteArchiveJournal
	if err := json.Unmarshal(raw, &got); err != nil || got != want {
		t.Fatalf("journal content %q: %v", raw, err)
	}
}
