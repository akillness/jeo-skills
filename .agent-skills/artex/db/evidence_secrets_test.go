package db

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

const (
	evCookie = "session=ev-cookie-secret"
	evBearer = "Bearer ev-auth-secret"
)

// evidenceFixture records a finding. With legacy=false the snapshot goes through
// the normal insert path; with legacy=true it is written in clear by raw SQL.
func evidenceFixture(t *testing.T, d *DB, tag string, legacy bool) (*Task, int64, TrafficEvidenceSnapshot) {
	t.Helper()
	task, err := d.CreateTask("evidence heads at rest "+tag, "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	s := TrafficEvidenceSnapshot{SourceTrafficID: "t-sec-ev-" + tag, CapturedAt: 1, URL: "http://ev.example/" + tag, Method: "GET", Status: 200,
		ReqHead:  "GET /" + tag + " HTTP/1.1\nCookie: " + evCookie + "\nAuthorization: " + evBearer + "\n",
		RespHead: "HTTP/1.1 200 OK\nSet-Cookie: " + evCookie + "\n", ReqHash: "rh-" + tag, RespHash: "ph-" + tag}
	s.ID = TrafficSnapshotID(s)
	t.Cleanup(func() {
		d.Exec(`DELETE FROM task_archives WHERE task_id=$1`, task.ID)
		d.DeleteTaskCascade(task.ID, false, true) // findings and their bindings too
		if _, err := d.Exec(`DELETE FROM traffic_evidence_snapshots WHERE id=$1`, s.ID); err != nil {
			t.Errorf("cleanup snapshot: %v", err)
		}
	})
	f, err := d.Exploration(task.ExplorationID).RecordFinding(t.Context(), RecordFindingInput{TaskID: task.ID, ExplorationID: task.ExplorationID, Summary: "evidence " + tag, Severity: "low"})
	if err != nil {
		t.Fatal(err)
	}
	if legacy {
		_, err = d.Exec(`INSERT INTO traffic_evidence_snapshots(id,source_traffic_id,captured_at,url,method,status,req_head,resp_head,req_hash,resp_hash,req_len,resp_len)
VALUES($1,$2,1,$3,'GET',200,$4,$5,$6,$7,0,0)`, s.ID, s.SourceTrafficID, s.URL, s.ReqHead, s.RespHead, s.ReqHash, s.RespHash)
		if err == nil {
			_, err = d.Exec(`INSERT INTO finding_traffic_bindings(finding_id,snapshot_id,position) VALUES($1,$2,0)`, f.FindingID, s.ID)
		}
	} else {
		err = d.WithEvidenceTx(t.Context(), func(tx *sql.Tx) error {
			return AddFindingTrafficTx(tx, f.FindingID, []PreparedTrafficEvidence{{Ref: TrafficRef{TrafficID: s.SourceTrafficID, Role: "proof"}, Snapshot: s}})
		})
	}
	if err != nil {
		t.Fatal(err)
	}
	return task, f.FindingID, s
}

// rawHeads reads the stored heads; both must be sealed and hide the secrets.
func rawHeads(t *testing.T, d *DB, id string) (req, resp string) {
	t.Helper()
	if err := d.QueryRow(`SELECT req_head,resp_head FROM traffic_evidence_snapshots WHERE id=$1`, id).Scan(&req, &resp); err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{req, resp} {
		if !isEncrypted(v) || strings.Contains(v, evCookie) || strings.Contains(v, evBearer) {
			t.Fatalf("head stored in clear: %q", v)
		}
	}
	return req, resp
}

// assertClearHeads checks the application read and that the stored value is
// sealed exactly once.
func assertClearHeads(t *testing.T, d *DB, findingID int64, want TrafficEvidenceSnapshot) {
	t.Helper()
	got, err := d.GetFindingTraffic(t.Context(), findingID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Bindings) != 1 || got.Bindings[0].Snapshot.ReqHead != want.ReqHead || got.Bindings[0].Snapshot.RespHead != want.RespHead || got.Bindings[0].SnapshotID != want.ID {
		t.Fatalf("read back: %+v", got.Bindings)
	}
	req, resp := rawHeads(t, d, want.ID)
	box := activeSecretBox.Load()
	if p, err := box.decrypt(colEvReqHead.aad(), req); err != nil || p != want.ReqHead {
		t.Fatalf("req_head not sealed once: %q %v", p, err)
	}
	if p, err := box.decrypt(colEvRespHead.aad(), resp); err != nil || p != want.RespHead {
		t.Fatalf("resp_head not sealed once: %q %v", p, err)
	}
}

func TestEvidenceHeadsSealedAtInsert(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	_, fid, s := evidenceFixture(t, d, "insert", false)
	assertClearHeads(t, d, fid, s)
	var url, method string
	if err := d.QueryRow(`SELECT url,method FROM traffic_evidence_snapshots WHERE id=$1`, s.ID).Scan(&url, &method); err != nil || url != s.URL || method != "GET" {
		t.Fatalf("metadata must stay in clear: %q %q %v", url, method, err)
	}
}

func TestEvidenceHeadsBackfillAndKeyChecks(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	_, fid, s := evidenceFixture(t, d, "legacy", true)
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	assertClearHeads(t, d, fid, s)
	req, resp := rawHeads(t, d, s.ID)
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	if r2, p2 := rawHeads(t, d, s.ID); r2 != req || p2 != resp {
		t.Fatal("second backfill must leave the ciphertexts untouched")
	}

	// A head sealed under another key: the read and the startup check fail and
	// name the column. The startup check samples one sealed row per column, so
	// this row must be the only sealed snapshot.
	var sealedRows int
	if err := d.QueryRow(`SELECT count(*) FROM traffic_evidence_snapshots WHERE req_head LIKE 'enc:v1:%' OR resp_head LIKE 'enc:v1:%'`).Scan(&sealedRows); err != nil || sealedRows != 1 {
		t.Fatalf("want only this fixture's snapshot sealed, got %d (%v)", sealedRows, err)
	}
	other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
	for _, c := range []secretColumn{colEvReqHead, colEvRespHead} {
		bad, _ := other.encrypt(c.aad(), "GET / HTTP/1.1\nCookie: other\n")
		if _, err := d.Exec(`UPDATE traffic_evidence_snapshots SET `+c.col+`=$1 WHERE id=$2`, bad, s.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := d.GetFindingTraffic(t.Context(), fid); err == nil || !strings.Contains(err.Error(), c.aad()) {
			t.Fatalf("want a read failure naming %s, got %v", c.aad(), err)
		}
		if err := d.InitSecrets(t.TempDir()); err == nil || !strings.Contains(err.Error(), "secret key check") || !strings.Contains(err.Error(), c.aad()) {
			t.Fatalf("want a key-check failure naming %s, got %v", c.aad(), err)
		}
		if _, err := d.Exec(`UPDATE traffic_evidence_snapshots SET req_head=$1,resp_head=$2 WHERE id=$3`, req, resp, s.ID); err != nil {
			t.Fatal(err)
		}
	}
	assertClearHeads(t, d, fid, s)

	// No key with sealed heads: refuse, and each head counts. One head stays
	// sealed so the refusal never turns into a new key.
	t.Setenv(secretKeyEnv, "")
	dir := t.TempDir()
	withHeads := encryptedCount(t, d, dir)
	for _, c := range []secretColumn{colEvReqHead, colEvRespHead} {
		if _, err := d.Exec(`UPDATE traffic_evidence_snapshots SET req_head=$1,resp_head=$2 WHERE id=$3`, req, resp, s.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := d.Exec(`UPDATE traffic_evidence_snapshots SET `+c.col+`='' WHERE id=$1`, s.ID); err != nil {
			t.Fatal(err)
		}
		if n := encryptedCount(t, d, dir); withHeads-n != 1 {
			t.Fatalf("no-key refusal counted %d then %d encrypted values; %s must count", withHeads, n, c.aad())
		}
	}
}

// Export keeps the heads sealed; import opens them to check the snapshot ID,
// then the insert seals them once. A legacy clear archive is sealed on import.
func TestEvidenceHeadsArchiveRoundTrip(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	if err = d.EnsureLLMRecordsTable(); err != nil {
		t.Fatal(err)
	}
	if err = d.EnsureLLMUsageTable(); err != nil {
		t.Fatal(err)
	}
	for _, legacy := range []bool{false, true} {
		t.Run(fmt.Sprint("legacy=", legacy), func(t *testing.T) {
			task, fid, s := evidenceFixture(t, d, fmt.Sprint("archive-", legacy), false)
			if err := d.SetPaused(task.ID, true); err != nil {
				t.Fatal(err)
			}
			archive, err := d.QueueTaskArchive(task.ID)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = d.ClaimTaskArchiveJob(t.Context()); err != nil {
				t.Fatal(err)
			}
			snapshot, err := d.SnapshotTaskArchive(task.ID)
			if err != nil {
				t.Fatal(err)
			}
			exported := string(snapshot.Tables["traffic_evidence_snapshots"])
			if !strings.Contains(exported, secretPrefix) || strings.Contains(exported, evCookie) || strings.Contains(exported, evBearer) {
				t.Fatalf("archive must keep the heads sealed: %s", exported)
			}
			if err = d.CompleteTaskArchive(archive.ID, snapshot, "/tmp/evidence-heads-test.tar.zst", "fixture", 1, 1); err != nil {
				t.Fatal(err)
			}
			var rows []map[string]any
			if err = json.Unmarshal(snapshot.Tables["traffic_evidence_snapshots"], &rows); err != nil || len(rows) != 1 {
				t.Fatal(rows, err)
			}
			if legacy { // an archive written before the heads were sealed
				rows[0]["req_head"], rows[0]["resp_head"] = s.ReqHead, s.RespHead
				snapshot.Tables["traffic_evidence_snapshots"], _ = json.Marshal(rows)
			} else { // a head sealed under another key fails the import, naming the column
				other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
				bad, _ := other.encrypt(colEvReqHead.aad(), s.ReqHead)
				good := rows[0]["req_head"]
				rows[0]["req_head"] = bad
				raw, _ := json.Marshal(rows)
				if _, err := ArchiveEvidenceSnapshots(&TaskArchiveSnapshot{FormatVersion: snapshot.FormatVersion, Tables: map[string]json.RawMessage{"traffic_evidence_snapshots": raw}}); err == nil || !strings.Contains(err.Error(), colEvReqHead.aad()) {
					t.Fatalf("want an import failure naming %s, got %v", colEvReqHead.aad(), err)
				}
				rows[0]["req_head"] = good
			}
			list, err := ArchiveEvidenceSnapshots(snapshot)
			if err != nil || len(list) != 1 || list[0].ReqHead != s.ReqHead || list[0].RespHead != s.RespHead {
				t.Fatalf("archive snapshots: %+v %v", list, err)
			}
			// The hot row is gone (GC), so the restore inserts it again.
			if _, err = d.Exec(`DELETE FROM traffic_evidence_snapshots WHERE id=$1`, s.ID); err != nil {
				t.Fatal(err)
			}
			if _, err = d.QueueTaskArchiveRestore(archive.ID); err != nil {
				t.Fatal(err)
			}
			if _, err = d.ClaimTaskArchiveJob(t.Context()); err != nil {
				t.Fatal(err)
			}
			if _, err = d.RestoreTaskArchive(archive.ID, snapshot, 0); err != nil {
				t.Fatal(err)
			}
			assertClearHeads(t, d, fid, s)
		})
	}
}
