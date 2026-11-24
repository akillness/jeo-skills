package server

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/evidence"
)

const (
	decodeGzipHead = "HTTP 200\nContent-Type: text/html\nContent-Encoding: gzip\n"
	decodeHTML     = "<html>\n  <body>user   admin:\tx7\n  end of dump</body>\n</html>"
	decodeQuote    = "user admin: x7 end of dump"
)

// compressBody runs data through the compressor built by newWriter.
func compressBody(t *testing.T, newWriter func(io.Writer) io.WriteCloser, data []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := newWriter(&buf)
	if _, err := w.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func gzipBody(t *testing.T, data []byte) []byte {
	return compressBody(t, func(w io.Writer) io.WriteCloser { return gzip.NewWriter(w) }, data)
}

// decodeSnapshot stores raw as a response body in a database-less evidence
// store (same layout as evidence.hashPath) and returns the snapshot bound to it.
func decodeSnapshot(t *testing.T, respHead string, raw []byte) (*evidence.Store, db.TrafficEvidenceSnapshot) {
	t.Helper()
	sum := sha256.Sum256(raw)
	hash := hex.EncodeToString(sum[:])
	dir := t.TempDir()
	path := filepath.Join(dir, "blobs", hash[:2], hash+".bin")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	return &evidence.Store{Dir: dir}, db.TrafficEvidenceSnapshot{RespHead: respHead, RespHash: hash, RespLen: int64(len(raw))}
}

func TestDecodeEvidenceBodyGzipQuoteFound(t *testing.T) {
	// A body of a few dozen bytes is not worth deflating: some encoders emit a
	// stored block instead, and then the round trip below tests nothing. Give
	// the fixture enough redundancy that any encoder compresses it, and assert
	// the compression itself by size rather than by looking for a word in the
	// output: a stored block is larger than its input by construction, so size
	// states the real invariant without assuming how a particular flate version
	// picks between stored and compressed blocks (#276).
	body := strings.Repeat(decodeHTML, 200)
	raw := gzipBody(t, []byte(body))
	if !bytes.HasPrefix(raw, []byte{0x1f, 0x8b}) {
		t.Fatal("fixture is not gzip")
	}
	if len(raw) >= len(body)/2 {
		t.Fatalf("fixture is not compressed: %d bytes in, %d bytes out", len(body), len(raw))
	}
	out, truncated, err := decodeEvidenceBody(decodeGzipHead, raw, verificationReadCap)
	if err != nil || truncated {
		t.Fatalf("decode: truncated=%v err=%v", truncated, err)
	}
	if !bytes.Equal(out, []byte(body)) {
		t.Fatalf("decoded %d bytes, want the %d byte body", len(out), len(body))
	}
	if !strings.Contains(normalizeEvidenceText(string(out)), normalizeEvidenceText(decodeQuote)) {
		t.Fatalf("quote %q not found in decoded body", decodeQuote)
	}
}

func TestDecodeEvidenceBodyTruncatedGzipFails(t *testing.T) {
	raw := gzipBody(t, []byte(strings.Repeat(decodeHTML, 50)))
	for _, cut := range []int{5, len(raw) / 2, len(raw) - 1} {
		out, truncated, err := decodeEvidenceBody(decodeGzipHead, raw[:cut], verificationReadCap)
		if err == nil || out != nil || truncated {
			t.Fatalf("cut at %d: out=%d bytes truncated=%v err=%v, want an error and no bytes", cut, len(out), truncated, err)
		}
	}
	// Not gzip at all: the raw bytes must not come back either.
	out, _, err := decodeEvidenceBody(decodeGzipHead, []byte(decodeHTML), verificationReadCap)
	if err == nil || out != nil {
		t.Fatalf("plain text declared as gzip: out=%q err=%v, want an error and no bytes", out, err)
	}
}

func TestDecodeEvidenceBodyIdentityAndNoHeaderUnchanged(t *testing.T) {
	raw := []byte(decodeHTML)
	for _, head := range []string{
		"",
		"HTTP 200\nContent-Type: text/html\n",
		"HTTP 200\nContent-Encoding: identity\n",
		"HTTP 200\r\ncontent-encoding:  Identity \r\n",
	} {
		out, truncated, err := decodeEvidenceBody(head, raw, verificationReadCap)
		if err != nil || truncated || !bytes.Equal(out, raw) {
			t.Fatalf("head %q: out=%q truncated=%v err=%v, want the raw bytes", head, out, truncated, err)
		}
	}
}

func TestDecodeEvidenceBodyUnknownEncodingFails(t *testing.T) {
	raw := gzipBody(t, []byte(decodeHTML))
	for _, head := range []string{
		"HTTP 200\nContent-Encoding: br\n",
		"HTTP 200\nContent-Encoding: gzip, br\n",
		"HTTP 200\nContent-Encoding: gzip\nContent-Encoding: zstd\n",
	} {
		out, _, err := decodeEvidenceBody(head, raw, verificationReadCap)
		if err == nil || !strings.Contains(err.Error(), "unsupported content-encoding") || out != nil {
			t.Fatalf("head %q: out=%d bytes err=%v, want unsupported content-encoding", head, len(out), err)
		}
	}
}

func TestDecodeEvidenceBodyTwoLayersFails(t *testing.T) {
	raw := gzipBody(t, gzipBody(t, []byte(decodeHTML)))
	for _, head := range []string{
		"HTTP 200\nContent-Encoding: gzip, gzip\n",
		"HTTP 200\nContent-Encoding: gzip\nContent-Encoding: deflate\n",
	} {
		out, _, err := decodeEvidenceBody(head, raw, verificationReadCap)
		if err == nil || !strings.Contains(err.Error(), "unsupported content-encoding") || out != nil {
			t.Fatalf("head %q: out=%d bytes err=%v, want unsupported content-encoding", head, len(out), err)
		}
	}
}

func TestDecodeEvidenceBodyOverLimitTruncated(t *testing.T) {
	const limit = 1000
	plain := []byte(strings.Repeat("0123456789", 500))
	out, truncated, err := decodeEvidenceBody(decodeGzipHead, gzipBody(t, plain), limit)
	if err != nil || !truncated || len(out) != limit || !bytes.Equal(out, plain[:limit]) {
		t.Fatalf("over limit: len=%d truncated=%v err=%v, want %d bytes truncated", len(out), truncated, err, limit)
	}
	// Exactly at the limit is complete, not truncated.
	out, truncated, err = decodeEvidenceBody(decodeGzipHead, gzipBody(t, plain[:limit]), limit)
	if err != nil || truncated || len(out) != limit {
		t.Fatalf("at limit: len=%d truncated=%v err=%v, want %d bytes not truncated", len(out), truncated, err, limit)
	}
}

func TestDecodeEvidenceBodyUppercaseHeader(t *testing.T) {
	raw := gzipBody(t, []byte(decodeHTML))
	for _, head := range []string{
		"HTTP 200\nContent-Encoding: GZIP\n",
		"HTTP 200\r\nCONTENT-ENCODING: GZIP\r\n",
	} {
		out, truncated, err := decodeEvidenceBody(head, raw, verificationReadCap)
		if err != nil || truncated || string(out) != decodeHTML {
			t.Fatalf("head %q: out=%q truncated=%v err=%v", head, out, truncated, err)
		}
	}
}

func TestDecodeEvidenceBodyDeflate(t *testing.T) {
	const head = "HTTP 200\nContent-Encoding: deflate\n"
	bodies := map[string][]byte{
		"zlib": compressBody(t, func(w io.Writer) io.WriteCloser { return zlib.NewWriter(w) }, []byte(decodeHTML)),
		"raw": compressBody(t, func(w io.Writer) io.WriteCloser {
			fw, err := flate.NewWriter(w, flate.DefaultCompression)
			if err != nil {
				t.Fatal(err)
			}
			return fw
		}, []byte(decodeHTML)),
	}
	for name, raw := range bodies {
		out, truncated, err := decodeEvidenceBody(head, raw, verificationReadCap)
		if err != nil || truncated || string(out) != decodeHTML {
			t.Fatalf("%s deflate: out=%q truncated=%v err=%v", name, out, truncated, err)
		}
		if out, _, err := decodeEvidenceBody(head, raw[:len(raw)-1], verificationReadCap); err == nil || out != nil {
			t.Fatalf("truncated %s deflate: out=%d bytes err=%v, want an error and no bytes", name, len(out), err)
		}
	}
}

func TestDecodeBoundResponseGzipTextIsSearchable(t *testing.T) {
	store, snap := decodeSnapshot(t, decodeGzipHead, gzipBody(t, []byte(decodeHTML)))
	bb, err := readBoundResponse(store, snap)
	if err != nil {
		t.Fatal(err)
	}
	if bb.nonText || bb.truncated {
		t.Fatalf("gzip html: nonText=%v truncated=%v", bb.nonText, bb.truncated)
	}
	if !quoteInBodies(normalizeEvidenceText(decodeQuote), []boundBody{bb}) {
		t.Fatalf("quote %q not found in %q", decodeQuote, bb.text)
	}
}

func TestDecodeBoundResponseGzipBinaryStaysNonText(t *testing.T) {
	binary := append([]byte("PNG\x00\x01\x02 user admin: x7 end of dump "), 0xff, 0xfe)
	store, snap := decodeSnapshot(t, decodeGzipHead, gzipBody(t, binary))
	bb, err := readBoundResponse(store, snap)
	if err != nil {
		t.Fatal(err)
	}
	if !bb.nonText || bb.text != "" {
		t.Fatalf("gzip binary: nonText=%v text=%q, want non-text", bb.nonText, bb.text)
	}
	if quoteInBodies(normalizeEvidenceText(decodeQuote), []boundBody{bb}) {
		t.Fatal("quote matched inside a non-text body")
	}
}

func TestDecodeBoundResponseBadGzipIsAnError(t *testing.T) {
	raw := gzipBody(t, []byte(decodeHTML))
	store, snap := decodeSnapshot(t, decodeGzipHead, raw[:len(raw)-4])
	if bb, err := readBoundResponse(store, snap); err == nil {
		t.Fatalf("truncated gzip: got %+v, want an error", bb)
	}
	store, snap = decodeSnapshot(t, "HTTP 200\nContent-Encoding: br\n", raw)
	if bb, err := readBoundResponse(store, snap); err == nil || !strings.Contains(err.Error(), "unsupported content-encoding") {
		t.Fatalf("br: got %+v err=%v, want unsupported content-encoding", bb, err)
	}
}

// A response captured with Content-Encoding: gzip and no body at all (HEAD,
// 304) is not a decode failure: it stays an empty body, without error.
func TestDecodeEvidenceBodyEmptyBodyWithEncodingStaysEmpty(t *testing.T) {
	for _, head := range []string{
		decodeGzipHead,
		"HTTP 304\r\nCONTENT-ENCODING: GZIP\r\n",
		"HTTP 200\nContent-Encoding: deflate\n",
	} {
		for _, raw := range [][]byte{nil, {}} {
			out, truncated, err := decodeEvidenceBody(head, raw, verificationReadCap)
			if err != nil || truncated || len(out) != 0 {
				t.Fatalf("head %q: out=%q truncated=%v err=%v, want an empty body and no error", head, out, truncated, err)
			}
		}
	}
}

// An empty bound body, compressed or not, is read without error but can never
// satisfy a quote. In assessFindingVerification a quote that matches no body
// only leads to unverified or not_assessed, never verified, so this is what
// keeps an empty response (HEAD, 304) from verifying a finding.
func TestDecodeBoundResponseEmptyBodyNeverMatchesQuote(t *testing.T) {
	cases := []struct {
		name string
		head string
		raw  []byte
	}{
		{"gzip header, no bytes", decodeGzipHead, nil},
		{"deflate header, no bytes", "HTTP 200\nContent-Encoding: deflate\n", nil},
		{"identity header, no bytes", "HTTP 200\nContent-Encoding: identity\n", nil},
		{"no encoding header, no bytes", "HTTP 304\nContent-Type: text/html\n", nil},
		{"gzip stream of an empty payload", decodeGzipHead, gzipBody(t, nil)},
	}
	quotes := []string{
		decodeQuote,
		"x",
		// Present in the response head: the head is not searchable text.
		"Content-Encoding: gzip",
		"HTTP 200",
	}
	for _, c := range cases {
		store, snap := decodeSnapshot(t, c.head, c.raw)
		bb, err := readBoundResponse(store, snap)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if bb.text != "" || bb.nonText || bb.truncated {
			t.Fatalf("%s: got %+v, want an empty text body", c.name, bb)
		}
		for _, q := range quotes {
			nq := normalizeEvidenceText(q)
			if nq == "" {
				t.Fatalf("quote %q normalizes to nothing", q)
			}
			if quoteInBodies(nq, []boundBody{bb}) {
				t.Fatalf("%s: quote %q matched an empty body", c.name, q)
			}
		}
	}
}
