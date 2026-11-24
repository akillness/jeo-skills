package server

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func webuiTestFS() fstest.MapFS {
	return fstest.MapFS{
		"_next/static/chunks/app.js": {Data: bytes.Repeat([]byte("const a=1;\n"), 400)},
		"index.html":                 {Data: []byte("<html><body>hi</body></html>")},
	}
}

const testAssetPath = "_next/static/chunks/app.js"

func TestServeWebAssetGzipAndValidators(t *testing.T) {
	fsys := webuiTestFS()

	req := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	rec := httptest.NewRecorder()
	if !serveWebAsset(rec, req, fsys, testAssetPath, true) {
		t.Fatal("asset not served")
	}
	res := rec.Result()
	if got := res.Header.Get("Content-Encoding"); got != "gzip" {
		t.Errorf("Content-Encoding = %q, want gzip", got)
	}
	if got := res.Header.Get("Cache-Control"); got != immutableValue {
		t.Errorf("Cache-Control = %q, want %q", got, immutableValue)
	}
	etag := res.Header.Get("ETag")
	if etag == "" {
		t.Error("ETag missing")
	}
	if !strings.Contains(res.Header.Get("Vary"), "Accept-Encoding") {
		t.Error("Vary missing Accept-Encoding")
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("body is not gzip: %v", err)
	}
	got, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("gunzip: %v", err)
	}
	if want := fsys[testAssetPath].Data; !bytes.Equal(got, want) {
		t.Errorf("round-trip mismatch: got %d bytes, want %d", len(got), len(want))
	}
	if len(body) >= len(fsys[testAssetPath].Data)/2 {
		t.Errorf("compression ineffective: %d of %d bytes", len(body), len(fsys[testAssetPath].Data))
	}

	// The same representation carries the same ETag on a second, unrelated
	// request; the identity representation carries a different one (covered in
	// TestServeWebAssetPerRepresentationETag).
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
	req2.Header.Set("Accept-Encoding", "gzip")
	serveWebAsset(rec2, req2, fsys, testAssetPath, true)
	if got := rec2.Result().Header.Get("ETag"); got != etag {
		t.Errorf("gzip ETag not stable: %q vs %q", got, etag)
	}
}

func TestServeWebAssetConditional(t *testing.T) {
	fsys := webuiTestFS()

	rec := httptest.NewRecorder()
	serveWebAsset(rec, httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil), fsys, testAssetPath, true)
	etag := rec.Result().Header.Get("ETag")
	if etag == "" {
		t.Fatal("no ETag to revalidate against")
	}

	req := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
	req.Header.Set("If-None-Match", etag)
	rec304 := httptest.NewRecorder()
	serveWebAsset(rec304, req, fsys, testAssetPath, true)
	if rec304.Code != http.StatusNotModified {
		t.Errorf("revalidation status = %d, want 304", rec304.Code)
	}
	if n := rec304.Body.Len(); n != 0 {
		t.Errorf("304 carried %d body bytes, want 0", n)
	}
}

func TestServeWebAssetHonoursEncodingAndCachePolicy(t *testing.T) {
	fsys := webuiTestFS()

	// A client that does not accept gzip gets the raw bytes.
	req := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
	req.Header.Set("Accept-Encoding", "identity")
	rec := httptest.NewRecorder()
	serveWebAsset(rec, req, fsys, testAssetPath, true)
	if got := rec.Result().Header.Get("Content-Encoding"); got != "" {
		t.Errorf("Content-Encoding = %q, want empty for identity", got)
	}
	body, _ := io.ReadAll(rec.Result().Body)
	if want := fsys[testAssetPath].Data; !bytes.Equal(body, want) {
		t.Errorf("identity body mismatch: %d vs %d bytes", len(body), len(want))
	}

	// gzip;q=0 must be treated as a refusal.
	req0 := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
	req0.Header.Set("Accept-Encoding", "gzip;q=0")
	rec0 := httptest.NewRecorder()
	serveWebAsset(rec0, req0, fsys, testAssetPath, true)
	if got := rec0.Result().Header.Get("Content-Encoding"); got != "" {
		t.Errorf("gzip;q=0 still compressed (Content-Encoding=%q)", got)
	}

	// HTML is revalidate-only, never immutable.
	recHTML := httptest.NewRecorder()
	serveWebAsset(recHTML, httptest.NewRequest(http.MethodGet, "/index.html", nil), fsys, "index.html", false)
	if got := recHTML.Result().Header.Get("Cache-Control"); got != revalidateValue {
		t.Errorf("html Cache-Control = %q, want %q", got, revalidateValue)
	}

	if webuiImmutable("index.html") {
		t.Error("index.html must not be immutable")
	}
	if !webuiImmutable("_next/static/chunks/app.js") {
		t.Error("_next/static assets must be immutable")
	}
}

// bothRepresentations returns the ETag and body of the identity and gzip
// representations of testAssetPath.
func bothRepresentations(t *testing.T, fsys fstest.MapFS) (rawETag, gzETag string, rawBody, gzBody []byte) {
	t.Helper()
	for _, enc := range []string{"identity", "gzip"} {
		req := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
		req.Header.Set("Accept-Encoding", enc)
		rec := httptest.NewRecorder()
		if !serveWebAsset(rec, req, fsys, testAssetPath, true) {
			t.Fatalf("%s: asset not served", enc)
		}
		res := rec.Result()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatalf("%s: read body: %v", enc, err)
		}
		if enc == "identity" {
			rawETag, rawBody = res.Header.Get("ETag"), body
		} else {
			gzETag, gzBody = res.Header.Get("ETag"), body
		}
		if len(body) == 0 {
			t.Fatalf("%s: empty body", enc)
		}
	}
	return rawETag, gzETag, rawBody, gzBody
}

// TestServeWebAssetPerRepresentationETag pins the property that the raw and gzip
// bodies never share a strong validator: a request validated against one must
// not be answered from the other.
func TestServeWebAssetPerRepresentationETag(t *testing.T) {
	fsys := webuiTestFS()
	rawETag, gzETag, rawBody, gzBody := bothRepresentations(t, fsys)

	if rawETag == "" || gzETag == "" {
		t.Fatalf("missing validator: raw %q gzip %q", rawETag, gzETag)
	}
	if rawETag == gzETag {
		t.Fatalf("both representations share the strong validator %q", rawETag)
	}

	type request struct {
		name       string
		enc        string
		ifRange    string
		wantStatus int
		wantBody   []byte
	}
	cases := []request{
		// Sanity: a range validated against its own representation is honoured.
		{"range on raw, own etag", "identity", rawETag, http.StatusPartialContent, rawBody[:10]},
		{"range on gzip, own etag", "gzip", gzETag, http.StatusPartialContent, gzBody[:10]},
		// The regression: the ETag of the other representation must not
		// validate a range, so the full, self-consistent body comes back.
		{"range on raw, gzip etag", "identity", gzETag, http.StatusOK, rawBody},
		{"range on gzip, raw etag", "gzip", rawETag, http.StatusOK, gzBody},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
		req.Header.Set("Accept-Encoding", tc.enc)
		req.Header.Set("Range", "bytes=0-9")
		req.Header.Set("If-Range", tc.ifRange)
		rec := httptest.NewRecorder()
		if !serveWebAsset(rec, req, fsys, testAssetPath, true) {
			t.Fatalf("%s: asset not served", tc.name)
		}
		res := rec.Result()
		body, _ := io.ReadAll(res.Body)
		if res.StatusCode != tc.wantStatus {
			t.Errorf("%s: status = %d, want %d", tc.name, res.StatusCode, tc.wantStatus)
		}
		if !bytes.Equal(body, tc.wantBody) {
			t.Errorf("%s: body = %d bytes, want %d", tc.name, len(body), len(tc.wantBody))
		}
		if got := res.Header.Get("Content-Encoding"); tc.enc == "gzip" && got != "gzip" {
			t.Errorf("%s: Content-Encoding = %q, want gzip", tc.name, got)
		}
		if got := res.Header.Get("ETag"); got == "" {
			t.Errorf("%s: ETag missing", tc.name)
		}
	}
}

// TestServeWebAssetConditionalIsPerRepresentation is the 304 half of the same
// property: a client holding the gzip validator must not revalidate the raw
// representation against it.
func TestServeWebAssetConditionalIsPerRepresentation(t *testing.T) {
	fsys := webuiTestFS()
	rawETag, gzETag, _, _ := bothRepresentations(t, fsys)

	type conditional struct {
		name      string
		enc       string
		validator string
		want      int
	}
	cases := []conditional{
		{"raw against own etag", "identity", rawETag, http.StatusNotModified},
		{"gzip against own etag", "gzip", gzETag, http.StatusNotModified},
		{"raw against gzip etag", "identity", gzETag, http.StatusOK},
		{"gzip against raw etag", "gzip", rawETag, http.StatusOK},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/"+testAssetPath, nil)
		req.Header.Set("Accept-Encoding", tc.enc)
		req.Header.Set("If-None-Match", tc.validator)
		rec := httptest.NewRecorder()
		serveWebAsset(rec, req, fsys, testAssetPath, true)
		if rec.Code != tc.want {
			t.Errorf("%s: status = %d, want %d", tc.name, rec.Code, tc.want)
		}
		if tc.want == http.StatusOK && rec.Body.Len() == 0 {
			t.Errorf("%s: 200 carried no body", tc.name)
		}
	}
}

func TestServeWebAssetMissing(t *testing.T) {
	if serveWebAsset(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/nope.js", nil), webuiTestFS(), "nope.js", false) {
		t.Error("missing asset reported as served")
	}
}
