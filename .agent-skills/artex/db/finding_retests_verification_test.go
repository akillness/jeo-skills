package db

import (
	"strings"
	"testing"
)

// runRetest drives one retest session to its terminal state with the given
// staged verdict, using the same calls the server makes, and returns its ID.
func runRetest(t *testing.T, d *DB, fid int64, verdict, summary, finish string) int64 {
	t.Helper()
	ctx := t.Context()
	r, c, _, err := d.CreateFindingRetest(ctx, fid, "")
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := d.StartFindingRetest(ctx, r.ID); err != nil || !ok {
		t.Fatalf("start retest: ok=%v err=%v", ok, err)
	}
	if verdict != "" {
		if err := d.RecordFindingRetestResult(ctx, c.ID, verdict, summary, "retest evidence"); err != nil {
			t.Fatal(err)
		}
	}
	if err := d.FinishFindingRetest(r.ID, finish, ""); err != nil {
		t.Fatal(err)
	}
	return r.ID
}

func verificationOf(t *testing.T, d *DB, fid int64) (status string, poe int, note string) {
	t.Helper()
	if err := d.QueryRow(`SELECT verification_status, poe_level, verification_note FROM findings WHERE id=$1`, fid).
		Scan(&status, &poe, &note); err != nil {
		t.Fatal(err)
	}
	return
}

func TestRetestReproducedVerifiesUnverifiedFinding(t *testing.T) {
	d, fid := retestDB(t)
	runRetest(t, d, fid, "reproduced", "still exploitable with the original PoC", "completed")
	status, _, note := verificationOf(t, d, fid)
	if status != VerificationVerified || !strings.Contains(note, "retest") || !strings.Contains(note, "reproduced") {
		t.Fatalf("verification after reproduced: status=%s note=%q", status, note)
	}
}

func TestRetestFixedVerifiesAndKeepsFixedStatus(t *testing.T) {
	d, fid := retestDB(t)
	runRetest(t, d, fid, "fixed", "payload now rejected, control still works", "completed")
	status, _, note := verificationOf(t, d, fid)
	if status != VerificationVerified || !strings.Contains(note, "retest") || !strings.Contains(note, "fixed") {
		t.Fatalf("verification after fixed: status=%s note=%q", status, note)
	}
	f, err := d.GetFinding(fid)
	if err != nil || f == nil {
		t.Fatalf("get finding: %v", err)
	}
	if f.Status != FindingFixed {
		t.Fatalf("human status after fixed retest = %q, want %q", f.Status, FindingFixed)
	}
}

func TestRetestInconclusiveDoesNotDowngradeVerified(t *testing.T) {
	d, fid := retestDB(t)
	if err := d.SetFindingVerification(fid, VerificationVerified, 3, ""); err != nil {
		t.Fatal(err)
	}
	runRetest(t, d, fid, "inconclusive", "target unreachable from the retest session", "completed")
	status, poe, note := verificationOf(t, d, fid)
	if status != VerificationVerified || poe != 3 || note != "" {
		t.Fatalf("verified finding after inconclusive: status=%s poe=%d note=%q", status, poe, note)
	}
}

func TestRetestFailedOrStoppedLeavesVerificationUnchanged(t *testing.T) {
	for _, finish := range []string{"failed", "stopped"} {
		t.Run(finish, func(t *testing.T) {
			d, fid := retestDB(t)
			if err := d.SetFindingVerification(fid, VerificationNotAssessed, 3, "earlier note"); err != nil {
				t.Fatal(err)
			}
			// A verdict staged before the session was cut off must not count.
			runRetest(t, d, fid, "reproduced", "staged before interruption", finish)
			status, poe, note := verificationOf(t, d, fid)
			if status != VerificationNotAssessed || poe != 3 || note != "earlier note" {
				t.Fatalf("after %s: status=%s poe=%d note=%q", finish, status, poe, note)
			}
		})
	}
}

func TestRetestUpgradesFromNotAssessedAndBlocked(t *testing.T) {
	for _, from := range []string{VerificationNotAssessed, VerificationBlocked} {
		t.Run(from, func(t *testing.T) {
			d, fid := retestDB(t)
			if err := d.SetFindingVerification(fid, from, 0, ""); err != nil {
				t.Fatal(err)
			}
			runRetest(t, d, fid, "reproduced", "reproduced on retest", "completed")
			if status, _, _ := verificationOf(t, d, fid); status != VerificationVerified {
				t.Fatalf("from %s after reproduced: status=%s", from, status)
			}
		})
	}
}
