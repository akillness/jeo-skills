package server

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"strings"
	"unicode/utf8"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/evidence"
)

// S1 receipt check. A finding is verified only when a proof/verification
// traffic body is bound, the agent declared POE L3 or higher, and every quote
// appears verbatim (after whitespace normalization) in one of those response
// bodies. Anything else is unverified, blocked or not_assessed, with a note.

const (
	verificationMinPOE        = 3
	verificationMinQuoteRunes = 8       // shorter normalized quotes are ignored: "x7" proves nothing
	verificationReadCap       = 4 << 20 // bytes read per bound body; a quote beyond this cannot be confirmed
	verificationNoteQuoteLen  = 60
)

// boundBody is one bound response body, read through the evidence store and
// normalized for the substring check.
type boundBody struct {
	text      string // whitespace-normalized text (only when !nonText)
	truncated bool   // body was longer than verificationReadCap
	nonText   bool   // binary or non-UTF-8 content: never claimed as a match
}

// normalizeEvidenceText trims and collapses every run of whitespace to one space.
// Case is kept.
func normalizeEvidenceText(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// decodeEvidenceBody undoes the HTTP Content-Encoding declared in respHead on a
// captured response body, returning at most limit decoded bytes. Only identity
// and one layer of gzip or deflate are handled. Any other coding, a stacked
// coding or a stream that does not decode is an error: the raw bytes are never
// returned in place of a failed decode.
func decodeEvidenceBody(respHead string, raw []byte, limit int) (out []byte, truncated bool, err error) {
	coding := ""
	for _, line := range strings.Split(respHead, "\n") {
		name, value, ok := strings.Cut(line, ":")
		if !ok || !strings.EqualFold(strings.TrimSpace(name), "Content-Encoding") {
			continue
		}
		for _, v := range strings.Split(value, ",") {
			switch v = strings.ToLower(strings.TrimSpace(v)); v {
			case "", "identity":
			case "gzip", "deflate":
				if coding != "" {
					return nil, false, fmt.Errorf("unsupported content-encoding: more than one compressed layer")
				}
				coding = v
			default:
				return nil, false, fmt.Errorf("unsupported content-encoding: %q", v)
			}
		}
	}
	if coding == "" || len(raw) == 0 {
		return raw, false, nil
	}
	var zr io.Reader
	switch {
	case coding == "gzip":
		zr, err = gzip.NewReader(bytes.NewReader(raw))
	case len(raw) >= 2 && raw[0]&0x0f == 8 && raw[0]>>4 <= 7 && (uint(raw[0])<<8|uint(raw[1]))%31 == 0:
		// HTTP "deflate" is the zlib format (RFC 9110); some servers send a bare
		// deflate stream instead, told apart by the zlib header.
		zr, err = zlib.NewReader(bytes.NewReader(raw))
	default:
		zr = flate.NewReader(bytes.NewReader(raw))
	}
	if err == nil {
		out, err = io.ReadAll(io.LimitReader(zr, int64(limit)+1))
	}
	if err != nil {
		return nil, false, fmt.Errorf("%s body: %w", coding, err)
	}
	if len(out) > limit {
		return out[:limit], true, nil
	}
	return out, false, nil
}

// readBoundResponse reads the response side of a bound snapshot through the
// evidence store (same bytes the UI shows), capped at verificationReadCap, and
// decodes its Content-Encoding under the same cap.
func readBoundResponse(store *evidence.Store, snap db.TrafficEvidenceSnapshot) (boundBody, error) {
	f, _, err := store.OpenBody(snap, "response")
	if err != nil {
		return boundBody{}, err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, verificationReadCap+1))
	if err != nil {
		return boundBody{}, err
	}
	var bb boundBody
	if len(raw) > verificationReadCap {
		bb.truncated = true
		raw = raw[:verificationReadCap]
	}
	raw, cut, err := decodeEvidenceBody(snap.RespHead, raw, verificationReadCap)
	if err != nil {
		return boundBody{}, err
	}
	if cut {
		bb.truncated = true
	}
	if bb.truncated {
		// The cap may cut a multi-byte rune: drop at most UTFMax-1 trailing bytes.
		for i := 0; i < utf8.UTFMax-1 && !utf8.Valid(raw) && len(raw) > 0; i++ {
			raw = raw[:len(raw)-1]
		}
	}
	if bytes.IndexByte(raw, 0) >= 0 || !utf8.Valid(raw) {
		bb.nonText = true
		return bb, nil
	}
	bb.text = normalizeEvidenceText(string(raw))
	return bb, nil
}

// assessFindingVerification computes the verification state of a finding from
// its bound traffic and the quotes the agent supplied. poe is the declared POE
// level (0 when absent). It never returns "verified" unless every rule passes.
func (s *Server) assessFindingVerification(ctx context.Context, findingID int64, poe int, quotes []string) (status, note string) {
	tr, err := s.m.pg.GetFindingTraffic(ctx, findingID)
	if err != nil {
		return db.VerificationNotAssessed, "binding read error: " + err.Error()
	}
	var proofs []db.FindingTrafficBinding
	for _, b := range tr.Bindings {
		if b.Role == "proof" || b.Role == "verification" {
			proofs = append(proofs, b)
		}
	}
	if len(proofs) == 0 {
		return db.VerificationUnverified, "no proof traffic bound"
	}
	if poe < verificationMinPOE {
		return db.VerificationUnverified, fmt.Sprintf("POE L%d below L3", poe)
	}
	if len(quotes) == 0 {
		return db.VerificationUnverified, "no evidence quotes provided"
	}
	var checked []string
	for _, q := range quotes {
		if utf8.RuneCountInString(normalizeEvidenceText(q)) >= verificationMinQuoteRunes {
			checked = append(checked, q)
		}
	}
	if len(checked) == 0 {
		return db.VerificationUnverified, "evidence quote too short"
	}
	store := s.evidenceStore()
	bodies := make([]boundBody, 0, len(proofs))
	for _, b := range proofs {
		bb, err := readBoundResponse(store, b.Snapshot)
		if err != nil {
			// Fail closed: an unreadable body is never an "unverified" verdict.
			return db.VerificationNotAssessed, "evidence body unreadable: " + err.Error()
		}
		bodies = append(bodies, bb)
	}
	for _, q := range checked {
		nq := normalizeEvidenceText(q)
		if nq != "" && quoteInBodies(nq, bodies) {
			continue
		}
		for _, bb := range bodies {
			if bb.nonText {
				return db.VerificationNotAssessed, "non-text evidence"
			}
		}
		for _, bb := range bodies {
			if bb.truncated {
				return db.VerificationNotAssessed, "quote not found within read cap of bound evidence"
			}
		}
		return db.VerificationUnverified, "quote not found in bound evidence: " + shortQuote(q)
	}
	return db.VerificationVerified, ""
}

func quoteInBodies(nq string, bodies []boundBody) bool {
	for _, bb := range bodies {
		if !bb.nonText && strings.Contains(bb.text, nq) {
			return true
		}
	}
	return false
}

// shortQuote returns the first verificationNoteQuoteLen runes of the trimmed
// quote, for use in a note.
func shortQuote(q string) string {
	r := []rune(strings.TrimSpace(q))
	if len(r) > verificationNoteQuoteLen {
		r = r[:verificationNoteQuoteLen]
	}
	return string(r)
}

// seedFindingVerificationSchema adds the S1 optional properties to the
// update_finding_report schema of existing databases. Idempotent: a property is
// added only when the stored schema lacks it, and user edits are preserved.
func (s *Server) seedFindingVerificationSchema() {
	raw, err := json.Marshal(s.toolUpdateFindingReport().InputSchema())
	if err != nil {
		log.Printf("[verification] tool schema: %v", err)
		return
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return
	}
	var properties map[string]json.RawMessage
	if err := json.Unmarshal(obj["properties"], &properties); err != nil {
		return
	}
	for _, name := range []string{"poe_level", "evidence_quotes"} {
		if len(properties[name]) == 0 {
			continue
		}
		_, err := s.m.pg.Exec(`UPDATE tools SET schema=jsonb_set(schema,ARRAY['properties',$2::text],$3::jsonb,true),updated_at=now()
WHERE key=$1 AND system AND NOT(COALESCE(schema->'properties','{}'::jsonb) ? $2)`, "update_finding_report", name, string(properties[name]))
		if err != nil {
			log.Printf("[verification] upgrade update_finding_report.%s: %v", name, err)
		}
	}
}

// seedFindingEvidenceSchema adds the optional counterevidence /
// confidence_rationale properties to the report_finding schema of existing
// databases (SeedTool is first-insert only, so without this the model would never
// see them). Idempotent: a property is added only when the stored schema lacks it,
// and user edits are preserved.
func (s *Server) seedFindingEvidenceSchema() {
	for _, seed := range agent.BuiltinToolSeeds() {
		if seed.Key != "report_finding" {
			continue
		}
		raw, err := json.Marshal(seed.Schema)
		if err != nil {
			log.Printf("[evidence] report_finding schema: %v", err)
			return
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(raw, &obj); err != nil {
			return
		}
		var properties map[string]json.RawMessage
		if err := json.Unmarshal(obj["properties"], &properties); err != nil {
			return
		}
		for _, name := range []string{"counterevidence", "confidence_rationale"} {
			if len(properties[name]) == 0 {
				continue
			}
			_, err := s.m.pg.Exec(`UPDATE tools SET schema=jsonb_set(schema,ARRAY['properties',$2::text],$3::jsonb,true),updated_at=now()
WHERE key=$1 AND system AND NOT(COALESCE(schema->'properties','{}'::jsonb) ? $2)`, "report_finding", name, string(properties[name]))
			if err != nil {
				log.Printf("[evidence] upgrade report_finding.%s: %v", name, err)
			}
		}
		return
	}
}
