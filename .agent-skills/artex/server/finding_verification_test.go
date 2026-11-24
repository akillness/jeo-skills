package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

const verificationBody = "HTTP/1.1 200 OK\nuser   admin:\tx7\nend of dump"

func TestNormalizeEvidenceText(t *testing.T) {
	cases := map[string]string{
		"  a\t\tb\r\n c  ": "a b c",
		"Admin  User":      "Admin User", // case is kept
		"":                 "",
	}
	for in, want := range cases {
		if got := normalizeEvidenceText(in); got != want {
			t.Fatalf("normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestShortQuoteCapsAtSixtyRunes(t *testing.T) {
	long := strings.Repeat("é", 100)
	if got := []rune(shortQuote(long)); len(got) != verificationNoteQuoteLen {
		t.Fatalf("shortQuote kept %d runes, want %d", len(got), verificationNoteQuoteLen)
	}
}

// verificationFixture returns a server with one finding whose traffic "a" is
// bound with the given role and whose response body is verificationBody.
func verificationFixture(t *testing.T, role string) (*Server, *db.RecordedFinding, func(string, string, string) *httptest.ResponseRecorder) {
	t.Helper()
	s, f, req := trafficEvidenceServer(t)
	seedServerEvidenceFlow(t, s, "a", []byte(verificationBody))
	if role != "" {
		base := fmt.Sprintf("/api/exploration/findings/%d/traffic", f.FindingID)
		w := req("POST", base, fmt.Sprintf(`{"traffic_refs":[{"traffic_id":"a","role":%q}]}`, role))
		if w.Code != 200 {
			t.Fatalf("bind: %d %s", w.Code, w.Body)
		}
	}
	return s, f, req
}

// updateReport calls update_finding_report with the node id, as the agent does.
func updateReport(t *testing.T, s *Server, nodeID int64, extra string) (string, bool) {
	t.Helper()
	in := fmt.Sprintf(`{"finding_id":%d,"report":"# report","evidence_version":null%s}`, nodeID, extra)
	res, err := s.toolUpdateFindingReport().Call(context.Background(), json.RawMessage(in), &actool.ToolContext{})
	if err != nil {
		t.Fatal(err)
	}
	return res.Flatten(), res.IsError
}

func storedVerification(t *testing.T, s *Server, findingID int64) (status string, poe int, note, report string) {
	t.Helper()
	if err := s.m.pg.QueryRow(`SELECT verification_status, poe_level, verification_note, report FROM findings WHERE id=$1`, findingID).
		Scan(&status, &poe, &note, &report); err != nil {
		t.Fatal(err)
	}
	return
}

func TestVerificationNoBindingPOE4Unverified(t *testing.T) {
	s, f, _ := verificationFixture(t, "")
	msg, isErr := updateReport(t, s, f.NodeID, `,"poe_level":4,"evidence_quotes":["x7"]`)
	if isErr || !strings.Contains(msg, "verification: unverified - no proof traffic bound") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	status, poe, note, report := storedVerification(t, s, f.FindingID)
	if status != db.VerificationUnverified || poe != 4 || note != "no proof traffic bound" || report == "" {
		t.Fatalf("stored: status=%s poe=%d note=%q report=%q", status, poe, note, report)
	}
}

func TestVerificationProofPOE3MissingQuoteUnverified(t *testing.T) {
	s, f, _ := verificationFixture(t, "proof")
	msg, isErr := updateReport(t, s, f.NodeID, `,"poe_level":3,"evidence_quotes":["secret=999"]`)
	if isErr || !strings.Contains(msg, "warning:") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	status, _, note, report := storedVerification(t, s, f.FindingID)
	if status != db.VerificationUnverified || !strings.HasPrefix(note, "quote not found in bound evidence: secret=999") || report == "" {
		t.Fatalf("stored: status=%s note=%q report=%q", status, note, report)
	}
}

func TestVerificationProofPOE3ExactQuoteVerified(t *testing.T) {
	s, f, _ := verificationFixture(t, "verification")
	// The quote differs from the body only in whitespace runs: it must still match.
	msg, isErr := updateReport(t, s, f.NodeID, `,"poe_level":3,"evidence_quotes":["user admin:  x7"]`)
	if isErr || !strings.Contains(msg, "verification: verified (POE L3)") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	status, poe, note, _ := storedVerification(t, s, f.FindingID)
	if status != db.VerificationVerified || poe != 3 || note != "" {
		t.Fatalf("stored: status=%s poe=%d note=%q", status, poe, note)
	}
}

func TestVerificationShortQuoteUnverified(t *testing.T) {
	s, f, _ := verificationFixture(t, "proof")
	// "x7" is present in the body but below verificationMinQuoteRunes: it must not count.
	msg, isErr := updateReport(t, s, f.NodeID, `,"poe_level":3,"evidence_quotes":["x7"]`)
	if isErr || !strings.Contains(msg, "verification: unverified - evidence quote too short") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	status, _, note, _ := storedVerification(t, s, f.FindingID)
	if status != db.VerificationUnverified || note != "evidence quote too short" {
		t.Fatalf("stored: status=%s note=%q", status, note)
	}
}

func TestVerificationOldStyleCallUnverifiedWithoutError(t *testing.T) {
	s, f, _ := verificationFixture(t, "proof")
	msg, isErr := updateReport(t, s, f.NodeID, "")
	if isErr || !strings.Contains(msg, "verification: unverified") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	status, poe, _, report := storedVerification(t, s, f.FindingID)
	if status != db.VerificationUnverified || poe != 0 || report == "" {
		t.Fatalf("stored: status=%s poe=%d report=%q", status, poe, report)
	}
}

func TestVerificationUnreadableStoreNotAssessedReportSaved(t *testing.T) {
	s, f, _ := verificationFixture(t, "proof")
	// Remove the blobs behind the bound snapshot: the evidence store cannot open the body.
	if err := os.RemoveAll(filepath.Join(s.m.dir, "evidence")); err != nil {
		t.Fatal(err)
	}
	msg, isErr := updateReport(t, s, f.NodeID, `,"poe_level":3,"evidence_quotes":["user admin:  x7"]`)
	if isErr || !strings.Contains(msg, "verification: not_assessed") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	status, _, note, report := storedVerification(t, s, f.FindingID)
	if status != db.VerificationNotAssessed || !strings.HasPrefix(note, "evidence body unreadable") || report == "" {
		t.Fatalf("stored: status=%s note=%q report=%q", status, note, report)
	}
}

func TestVerificationRejectsOutOfRangePOE(t *testing.T) {
	s, f, _ := verificationFixture(t, "proof")
	msg, isErr := updateReport(t, s, f.NodeID, `,"poe_level":9`)
	if !isErr || !strings.Contains(msg, "invalid poe_level 9") {
		t.Fatalf("unexpected result: err=%v %q", isErr, msg)
	}
	if _, _, _, report := storedVerification(t, s, f.FindingID); report != "" {
		t.Fatal("report must not be written when the input is rejected")
	}
}

func TestVerificationColumnsExistWithHonestDefaults(t *testing.T) {
	s, f, _ := trafficEvidenceServer(t)
	var n int
	if err := s.m.pg.QueryRow(`SELECT count(*) FROM information_schema.columns
		WHERE table_name='findings' AND column_name IN ('poe_level','verification_status','verification_note')`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("expected 3 verification columns, found %d", n)
	}
	status, poe, note, _ := storedVerification(t, s, f.FindingID)
	if status != db.VerificationUnverified || poe != 0 || note != "" {
		t.Fatalf("new row: status=%s poe=%d note=%q", status, poe, note)
	}
}
