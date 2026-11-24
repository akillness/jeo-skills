package traffic

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/traffic/rewrite"
)

func TestHARRoundTripPlainBase64BinaryEmptyAndLargeBlob(t *testing.T) {
	src, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()

	// Install an enabled capture rewrite rule to prove HAR import NEVER runs rules
	// or writes exchange_rewrites rows.
	set := rewrite.Compile([]rewrite.Rule{{
		ID: 42, Name: "should-not-apply-to-har", Enabled: true, Phase: rewrite.PhaseRequest,
		Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Injected", Value: "1"}},
	}}, rewrite.Options{})
	if len(set.LoadErrors()) != 0 {
		t.Fatalf("compile rewrite rules: %v", set.LoadErrors())
	}
	src.SetRewriteRules(set)

	binaryResp := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x01}
	binaryReq := []byte{0x00, 0x01, 0x02, 0x80, 0xff}
	largeTextBody := "LARGE-HAR-NEEDLE-" + strings.Repeat("abcdefghij", (maxInlineBody/10)+50) // > 256 KiB -> blob!

	inputHAR := HAR{
		Log: &HARLog{
			Version: "1.2",
			Creator: HARCreator{Name: "TestBrowser", Version: "1.0"},
			Entries: []HAREntry{
				{
					StartedDateTime: "2026-05-01T10:00:00.789Z",
					Request: HARRequest{
						Method:      "POST",
						URL:         "https://app.example.com/api/v1/items/42?mode=full",
						HTTPVersion: "HTTP/1.1",
						Headers: []HARHeader{
							{Name: ":method", Value: "POST"},
							{Name: ":authority", Value: "app.example.com"},
							{Name: "Host", Value: "app.example.com"},
							{Name: "Content-Type", Value: "application/json"},
							{Name: "X-Trace", Value: "one"},
							{Name: "X-Trace", Value: "two"},
						},
						PostData: &HARPostData{
							MimeType: "application/json",
							Text:     `{"action":"create","needle":"plain-req-token"}`,
						},
					},
					Response: HARResponse{
						Status:      201,
						StatusText:  "Created",
						HTTPVersion: "HTTP/1.1",
						Headers: []HARHeader{
							{Name: "Content-Type", Value: "application/json; charset=utf-8"},
							{Name: "X-Resp", Value: "ok"},
						},
						Content: HARContent{
							MimeType: "application/json; charset=utf-8",
							Text:     `{"id":42,"msg":"plain-resp-marker"}`,
						},
					},
				},
				{
					StartedDateTime: "2026-05-01T10:00:05Z",
					Request: HARRequest{
						Method:      "POST",
						URL:         "https://cdn.example.com/upload",
						HTTPVersion: "HTTP/2.0",
						Headers:     []HARHeader{{Name: "Content-Type", Value: "application/octet-stream"}},
						PostData: &HARPostData{
							MimeType: "application/octet-stream",
							Text:     base64.StdEncoding.EncodeToString(binaryReq),
							Encoding: "base64",
						},
					},
					Response: HARResponse{
						Status:      200,
						HTTPVersion: "HTTP/2.0",
						Headers:     []HARHeader{{Name: "Content-Type", Value: "image/png"}},
						Content: HARContent{
							MimeType: "image/png",
							Text:     base64.StdEncoding.EncodeToString(binaryResp),
							Encoding: "base64",
						},
					},
				},
				{
					StartedDateTime: "2026-05-01T10:00:10Z",
					Request: HARRequest{
						Method:  "GET",
						URL:     "https://app.example.com/empty",
						Headers: []HARHeader{{Name: "Accept", Value: "*/*"}},
					},
					Response: HARResponse{
						Status:  204,
						Headers: []HARHeader{},
						Content: HARContent{},
					},
				},
				{
					StartedDateTime: "2026-05-01T10:00:15Z",
					Request: HARRequest{
						Method:  "GET",
						URL:     "https://blob.example.com/big.txt",
						Headers: []HARHeader{},
					},
					Response: HARResponse{
						Status:  200,
						Headers: []HARHeader{{Name: "Content-Type", Value: "text/plain"}},
						Content: HARContent{
							MimeType: "text/plain",
							Text:     largeTextBody,
						},
					},
				},
			},
		},
	}

	rawIn, err := json.Marshal(inputHAR)
	if err != nil {
		t.Fatal(err)
	}

	res, err := src.ImportHAR(rawIn, HARImportOptions{})
	if err != nil {
		t.Fatalf("ImportHAR: %v", err)
	}
	if res.Imported != 4 || res.Skipped != 0 || res.Failed != 0 || res.Truncated {
		t.Fatalf("ImportHAR result = %+v, want 4/0/0/false", res)
	}

	// Re-importing the exact same HAR must be idempotent (all skipped).
	res2, err := src.ImportHAR(rawIn, HARImportOptions{})
	if err != nil {
		t.Fatalf("re-import HAR: %v", err)
	}
	if res2.Imported != 0 || res2.Skipped != 4 || res2.Failed != 0 {
		t.Fatalf("re-import result = %+v, want 0/4/0", res2)
	}

	// Verify none of the imported exchanges are flagged rewritten or have exchange_rewrites rows.
	var rwRows int
	if err := src.DB().QueryRow(`SELECT COUNT(*) FROM exchange_rewrites`).Scan(&rwRows); err != nil || rwRows != 0 {
		t.Fatalf("exchange_rewrites count = %d err=%v, want 0", rwRows, err)
	}
	allRows, total, err := src.Page(PageQuery{RespMin: -1, RespMax: -1}, 0, 20)
	if err != nil || total != 4 || len(allRows) != 4 {
		t.Fatalf("Page after import = (%d, %d, %v), want (4, 4, nil)", len(allRows), total, err)
	}
	for _, r := range allRows {
		if !strings.HasPrefix(r.ID, "har-") {
			t.Fatalf("expected har- prefix on id %q", r.ID)
		}
		if r.Rewritten {
			t.Fatalf("imported exchange %s unexpectedly flagged rewritten", r.ID)
		}
		if rw, ids, err := src.RewriteInfo(r.ID); err != nil || rw || len(ids) != 0 {
			t.Fatalf("RewriteInfo(%s) = (%v, %v, %v), want (false, nil, nil)", r.ID, rw, ids, err)
		}
	}

	// Verify searchable via FTS (both inline body and spilled large text body).
	if rows, tot, err := src.Page(PageQuery{Body: "plain-resp-marker", RespMin: -1, RespMax: -1}, 0, 10); err != nil || tot != 1 || len(rows) != 1 {
		t.Fatalf("FTS search inline body = (%d, %d, %v), want 1", len(rows), tot, err)
	}
	if rows, tot, err := src.Page(PageQuery{Body: "LARGE-HAR-NEEDLE", RespMin: -1, RespMax: -1}, 0, 10); err != nil || tot != 1 || len(rows) != 1 {
		t.Fatalf("FTS search blob body = (%d, %d, %v), want 1", len(rows), tot, err)
	}

	// Verify large body actually spilled to a blob and registered in blob_refs.
	var blobHash string
	var blobRefCount int
	if err := src.DB().QueryRow(`SELECT resp_blob FROM exchange_bodies b JOIN exchanges e ON e.id=b.id WHERE e.host='blob.example.com'`).Scan(&blobHash); err != nil || blobHash == "" {
		t.Fatalf("large body did not spill to blob: hash=%q err=%v", blobHash, err)
	}
	if err := src.DB().QueryRow(`SELECT COUNT(*) FROM blob_refs WHERE hash=?`, blobHash).Scan(&blobRefCount); err != nil || blobRefCount != 1 {
		t.Fatalf("blob_refs count for %s = %d err=%v, want 1", blobHash, blobRefCount, err)
	}

	// Export HAR from src.
	exported, meta, err := src.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{CreatorVersion: "2.3.0"})
	if err != nil {
		t.Fatalf("ExportHAR: %v", err)
	}
	if meta.Exported != 4 || meta.TotalMatched != 4 || meta.Truncated || meta.TruncatedReason != "" {
		t.Fatalf("ExportHAR meta = %+v", meta)
	}
	if exported.Log.Version != "1.2" || exported.Log.Creator.Name != "ARTEX" || exported.Log.Creator.Version != "2.3.0" {
		t.Fatalf("ExportHAR header = %+v", exported.Log)
	}
	if len(exported.Log.Entries) != 4 {
		t.Fatalf("ExportHAR entries = %d, want 4", len(exported.Log.Entries))
	}

	// Verify HAR 1.2 required keys are present with explicit unknown placeholders
	// and serverIPAddress is not fabricated.
	rawExported, err := json.Marshal(exported)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(rawExported), `"serverIPAddress"`) {
		t.Fatalf("exported HAR invented serverIPAddress: %s", string(rawExported))
	}
	var rawDoc map[string]any
	if err := json.Unmarshal(rawExported, &rawDoc); err != nil {
		t.Fatal(err)
	}
	rawLog := rawDoc["log"].(map[string]any)
	rawEntries := rawLog["entries"].([]any)
	firstEntry := rawEntries[0].(map[string]any)
	if got, ok := firstEntry["time"].(float64); !ok || got != 0 {
		t.Fatalf("entry.time = %#v, want 0", firstEntry["time"])
	}
	if cacheObj, ok := firstEntry["cache"].(map[string]any); !ok || len(cacheObj) != 0 {
		t.Fatalf("entry.cache = %#v, want {}", firstEntry["cache"])
	}
	timingsObj, ok := firstEntry["timings"].(map[string]any)
	if !ok || timingsObj["send"] != float64(-1) || timingsObj["wait"] != float64(-1) || timingsObj["receive"] != float64(-1) {
		t.Fatalf("entry.timings = %#v, want {send:-1 wait:-1 receive:-1}", firstEntry["timings"])
	}
	reqObj := firstEntry["request"].(map[string]any)
	if cookies, ok := reqObj["cookies"].([]any); !ok || len(cookies) != 0 {
		t.Fatalf("request.cookies = %#v, want []", reqObj["cookies"])
	}
	if qs, ok := reqObj["queryString"].([]any); !ok || len(qs) != 0 {
		t.Fatalf("request.queryString = %#v, want []", reqObj["queryString"])
	}
	if hs, ok := reqObj["headersSize"].(float64); !ok || hs != -1 {
		t.Fatalf("request.headersSize = %#v, want -1", reqObj["headersSize"])
	}
	if _, ok := reqObj["httpVersion"].(string); !ok {
		t.Fatalf("request.httpVersion missing: %#v", reqObj)
	}
	respObj := firstEntry["response"].(map[string]any)
	if cookies, ok := respObj["cookies"].([]any); !ok || len(cookies) != 0 {
		t.Fatalf("response.cookies = %#v, want []", respObj["cookies"])
	}
	if redir, ok := respObj["redirectURL"].(string); !ok || redir != "" {
		t.Fatalf("response.redirectURL = %#v, want \"\"", respObj["redirectURL"])
	}
	if hs, ok := respObj["headersSize"].(float64); !ok || hs != -1 {
		t.Fatalf("response.headersSize = %#v, want -1", respObj["headersSize"])
	}
	if _, ok := respObj["httpVersion"].(string); !ok {
		t.Fatalf("response.httpVersion missing: %#v", respObj)
	}
	if _, ok := respObj["statusText"].(string); !ok {
		t.Fatalf("response.statusText missing: %#v", respObj)
	}
	contentObj := respObj["content"].(map[string]any)
	if _, ok := contentObj["mimeType"].(string); !ok {
		t.Fatalf("response.content.mimeType missing: %#v", contentObj)
	}

	// Verify stable chronological ordering & exact body encodings.
	e0 := exported.Log.Entries[0]
	if e0.Request.URL != "https://app.example.com/api/v1/items/42?mode=full" || e0.Response.Content.Encoding != "" || e0.Response.Content.Text != `{"id":42,"msg":"plain-resp-marker"}` {
		t.Fatalf("entry 0 mismatch: %+v", e0)
	}
	e1 := exported.Log.Entries[1]
	if e1.Response.Content.Encoding != "base64" || e1.Request.PostData == nil || e1.Request.PostData.Encoding != "base64" {
		t.Fatalf("entry 1 binary encodings wrong: req=%+v resp=%+v", e1.Request.PostData, e1.Response.Content)
	}
	gotBinResp, err := base64.StdEncoding.DecodeString(e1.Response.Content.Text)
	if err != nil || !bytes.Equal(gotBinResp, binaryResp) {
		t.Fatalf("entry 1 binary resp mismatch: got=%x err=%v", gotBinResp, err)
	}
	gotBinReq, err := base64.StdEncoding.DecodeString(e1.Request.PostData.Text)
	if err != nil || !bytes.Equal(gotBinReq, binaryReq) {
		t.Fatalf("entry 1 binary req mismatch: got=%x err=%v", gotBinReq, err)
	}
	e2 := exported.Log.Entries[2]
	if e2.Request.PostData != nil || e2.Response.Content.Size != 0 || e2.Response.Content.Text != "" {
		t.Fatalf("entry 2 empty body mismatch: %+v", e2)
	}
	e3 := exported.Log.Entries[3]
	if e3.Response.Content.Size != len(largeTextBody) || e3.Response.Content.Text != largeTextBody || e3.Response.Content.Encoding != "" {
		t.Fatalf("entry 3 large blob body truncated or altered: size=%d len=%d", e3.Response.Content.Size, len(e3.Response.Content.Text))
	}

	// Re-importing the exported HAR into src must be 100% idempotent (same deterministic IDs!).
	reimpSame, err := src.ImportHAR(rawExported, HARImportOptions{})
	if err != nil {
		t.Fatalf("re-import exported HAR into src: %v", err)
	}
	if reimpSame.Imported != 0 || reimpSame.Skipped != 4 || reimpSame.Failed != 0 {
		t.Fatalf("re-import exported HAR into src = %+v, want 0/4/0", reimpSame)
	}

	// Re-importing the exported HAR into a fresh store must yield identical IDs, metadata, and bodies.
	dst, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()

	reimpFresh, err := dst.ImportHAR(rawExported, HARImportOptions{})
	if err != nil {
		t.Fatalf("import exported HAR into dst: %v", err)
	}
	if reimpFresh.Imported != 4 || reimpFresh.Skipped != 0 || reimpFresh.Failed != 0 {
		t.Fatalf("dst import = %+v, want 4/0/0", reimpFresh)
	}

	exportedDst, _, err := dst.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{CreatorVersion: "2.3.0"})
	if err != nil {
		t.Fatal(err)
	}
	rawDst, err := json.Marshal(exportedDst)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(rawExported, rawDst) {
		t.Fatalf("dst round-trip HAR differs from src export")
	}
}

func TestHARImportValidationDuplicatesAndPartialErrors(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	badDocs := []struct {
		name string
		raw  string
		want string
	}{
		{"empty", "", "empty HAR"},
		{"malformed json", `{"log":`, "malformed JSON"},
		{"trailing garbage", `{"log":{"version":"1.2","entries":[]}} extra`, "trailing content"},
		{"missing log", `{}`, "missing log"},
		{"missing entries", `{"log":{"version":"1.2"}}`, "missing log.entries"},
		{"null entries", `{"log":{"version":"1.2","entries":null}}`, "missing log.entries"},
		{"unsupported version 1.1", `{"log":{"version":"1.1","entries":[]}}`, "unsupported HAR version"},
		{"unsupported version 2.0", `{"log":{"version":"2.0","entries":[]}}`, "unsupported HAR version"},
		{"empty version", `{"log":{"version":"","entries":[]}}`, "unsupported HAR version"},
	}
	for _, tc := range badDocs {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tr.ImportHAR([]byte(tc.raw), HARImportOptions{})
			if !errors.Is(err, ErrInvalidHAR) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("ImportHAR(%s) err = %v, want ErrInvalidHAR containing %q", tc.name, err, tc.want)
			}
		})
	}

	// Duplicate entries inside one HAR + bad entries mixed with valid ones.
	mixed := `{
		"log": {
			"version": "1.2",
			"entries": [
				{
					"startedDateTime": "2026-05-01T12:00:00Z",
					"request": {"method": "GET", "url": "https://dup.example/a", "headers": []},
					"response": {"status": 200, "headers": [], "content": {"text": "ok"}}
				},
				{
					"startedDateTime": "2026-05-01T12:00:00Z",
					"request": {"method": "GET", "url": "https://dup.example/a", "headers": []},
					"response": {"status": 200, "headers": [], "content": {"text": "ok"}}
				},
				{
					"startedDateTime": "not-a-timestamp",
					"request": {"method": "GET", "url": "https://bad.example/ts", "headers": []},
					"response": {"status": 200, "headers": [], "content": {}}
				},
				{
					"startedDateTime": "2026-05-01T12:00:01Z",
					"request": {"method": "GET", "url": "https://bad.example/hdr", "headers": [{"name": "X-Bad", "value": "a\r\nb"}]},
					"response": {"status": 200, "headers": [], "content": {}}
				},
				{
					"startedDateTime": "2026-05-01T12:00:02Z",
					"request": {"method": "GET", "url": "https://bad.example/b64", "headers": []},
					"response": {"status": 200, "headers": [], "content": {"text": "!!!not-base64!!!", "encoding": "base64"}}
				},
				{
					"startedDateTime": "2026-05-01T12:00:03Z",
					"request": {"method": "GET", "url": "https://good.example/b", "headers": []},
					"response": {"status": 200, "headers": [], "content": {"text": "second"}}
				}
			]
		}
	}`
	res, err := tr.ImportHAR([]byte(mixed), HARImportOptions{})
	if err != nil {
		t.Fatalf("mixed ImportHAR: %v", err)
	}
	if res.Imported != 2 || res.Skipped != 1 || res.Failed != 3 || len(res.Errors) != 3 {
		t.Fatalf("mixed ImportHAR result = %+v, want imported=2 skipped=1 failed=3 errors=3", res)
	}

	// Entry cap returns ErrInvalidHAR.
	if _, err := tr.ImportHAR([]byte(mixed), HARImportOptions{MaxEntries: 2}); !errors.Is(err, ErrInvalidHAR) {
		t.Fatalf("MaxEntries exceeded err = %v, want ErrInvalidHAR", err)
	}

	// Byte cap truncates cleanly and reports remaining skipped.
	byteCapHAR := `{
		"log": {
			"version": "1.2",
			"entries": [
				{
					"startedDateTime": "2026-05-01T12:01:00Z",
					"request": {"method": "GET", "url": "https://cap.example/1", "headers": []},
					"response": {"status": 200, "headers": [], "content": {"text": "1234567890"}}
				},
				{
					"startedDateTime": "2026-05-01T12:01:01Z",
					"request": {"method": "GET", "url": "https://cap.example/2", "headers": []},
					"response": {"status": 200, "headers": [], "content": {"text": "1234567890"}}
				}
			]
		}
	}`
	capRes, err := tr.ImportHAR([]byte(byteCapHAR), HARImportOptions{MaxTotalBytes: 15})
	if err != nil {
		t.Fatalf("byte-capped ImportHAR: %v", err)
	}
	if capRes.Imported != 1 || capRes.Skipped != 1 || !capRes.Truncated || len(capRes.Errors) != 1 {
		t.Fatalf("byte-capped ImportHAR = %+v, want imported=1 skipped=1 truncated=true", capRes)
	}
}

func TestHARExportFiltersAndTruncationCaps(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	insert := func(id string, ts int64, host string, status int, body string) {
		t.Helper()
		if _, err := tr.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, ts, host, "GET", "/"+id, "https://"+host+"/"+id, status, "text/plain", 0, len(body), ""); err != nil {
			t.Fatal(err)
		}
		if _, err := tr.DB().Exec(`INSERT INTO exchange_bodies(id,req_head,req_body,resp_head,resp_body)
VALUES(?,?,?,?,?)`, id, "GET /"+id+" HTTP/1.1\nHost: "+host, []byte{}, "HTTP/1.1 200 OK", []byte(body)); err != nil {
			t.Fatal(err)
		}
	}

	insert("e-2", 20, "alpha.example", 200, "bbbbbbbbbb")
	insert("e-1", 10, "alpha.example", 404, "aaaaaaaaaa")
	insert("e-3", 30, "beta.example", 200, "cccccccccc")

	// Filter by host + status, verify chronological order.
	doc, meta, err := tr.ExportHAR(PageQuery{Host: "alpha.example", RespMin: -1, RespMax: -1}, HARExportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if meta.Exported != 2 || meta.TotalMatched != 2 || meta.Truncated {
		t.Fatalf("filtered export meta = %+v", meta)
	}
	if doc.Log.Entries[0].Request.URL != "https://alpha.example/e-1" || doc.Log.Entries[1].Request.URL != "https://alpha.example/e-2" {
		t.Fatalf("export not in stable (ts,id) order: %+v", doc.Log.Entries)
	}

	// Truncation by MaxEntries.
	docEntryCap, metaEntryCap, err := tr.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{MaxEntries: 2})
	if err != nil {
		t.Fatal(err)
	}
	if !metaEntryCap.Truncated || metaEntryCap.TruncatedReason != "max_entries" || metaEntryCap.Exported != 2 || metaEntryCap.TotalMatched != 3 {
		t.Fatalf("entry-capped meta = %+v", metaEntryCap)
	}
	if !docEntryCap.Log.Truncated || docEntryCap.Log.TruncatedReason != "max_entries" || docEntryCap.Log.TotalMatched != 3 {
		t.Fatalf("entry-capped log fields = %+v", docEntryCap.Log)
	}

	// Truncation by MaxTotalBytes (note: raw cap counts both headers and bodies).
	// Each row here has req_head (~46B) + resp_head (15B) + body (10B) ≈ 71B.
	docByteCap, metaByteCap, err := tr.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{MaxTotalBytes: 100})
	if err != nil {
		t.Fatal(err)
	}
	if !metaByteCap.Truncated || metaByteCap.TruncatedReason != "max_bytes" || metaByteCap.Exported != 1 || metaByteCap.TotalMatched != 3 {
		t.Fatalf("byte-capped meta = %+v", metaByteCap)
	}
	if !docByteCap.Log.Truncated || docByteCap.Log.TruncatedReason != "max_bytes" || docByteCap.Log.TotalMatched != 3 {
		t.Fatalf("byte-capped log fields = %+v", docByteCap.Log)
	}
}

func TestHARTwoIdenticalExchangesRoundTripPreservesBoth(t *testing.T) {
	src, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()

	// Two distinct ARTEX exchanges recorded in the same second with identical
	// method, URL, status, headers, and bodies.
	for _, id := range []string{"dup-a", "dup-b"} {
		if _, err := src.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,1700000000,'same.example','POST','/ping','https://same.example/ping',200,'application/json',2,2,'')`, id); err != nil {
			t.Fatal(err)
		}
		if _, err := src.DB().Exec(`INSERT INTO exchange_bodies(id,req_head,req_body,resp_head,resp_body)
VALUES(?,'POST /ping HTTP/1.1\nHost: same.example\n',?,'HTTP/1.1 200 OK\n',?)`, id, []byte("{}"), []byte("{}")); err != nil {
			t.Fatal(err)
		}
	}

	exported, meta, err := src.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if meta.Exported != 2 || len(exported.Log.Entries) != 2 {
		t.Fatalf("export = %+v, want 2 entries", meta)
	}
	if exported.Log.Entries[0].ArtexExchangeID != "dup-a" || exported.Log.Entries[1].ArtexExchangeID != "dup-b" {
		t.Fatalf("exported _artexExchangeId = [%q %q], want [dup-a dup-b]",
			exported.Log.Entries[0].ArtexExchangeID, exported.Log.Entries[1].ArtexExchangeID)
	}
	raw, err := json.Marshal(exported)
	if err != nil {
		t.Fatal(err)
	}

	// Re-importing into src is idempotent (both skipped).
	reimpSrc, err := src.ImportHAR(raw, HARImportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if reimpSrc.Imported != 0 || reimpSrc.Skipped != 2 || reimpSrc.Failed != 0 {
		t.Fatalf("re-import into src = %+v, want 0/2/0", reimpSrc)
	}

	// Importing into a fresh store preserves BOTH dup-a and dup-b (no collapse!).
	dst, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()

	impDst, err := dst.ImportHAR(raw, HARImportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if impDst.Imported != 2 || impDst.Skipped != 0 || impDst.Failed != 0 {
		t.Fatalf("import into fresh dst = %+v, want 2/0/0", impDst)
	}
	if count, err := dst.Count(); err != nil || count != 2 {
		t.Fatalf("dst.Count() = (%d, %v), want 2", count, err)
	}
	if _, _, err := dst.Get("dup-a"); err != nil {
		t.Fatalf("dup-a missing in dst: %v", err)
	}
	if _, _, err := dst.Get("dup-b"); err != nil {
		t.Fatalf("dup-b missing in dst: %v", err)
	}
	// Re-importing into dst is idempotent.
	reimpDst, err := dst.ImportHAR(raw, HARImportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if reimpDst.Imported != 0 || reimpDst.Skipped != 2 || reimpDst.Failed != 0 {
		t.Fatalf("re-import into dst = %+v, want 0/2/0", reimpDst)
	}
}

func TestHARExportBinaryNearCapFitsUnderImportLimit(t *testing.T) {
	src, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()

	// Binary body near the 20 MiB raw export cap (~19.5 MiB). After base64
	// expansion (4/3x ≈ 26 MiB) plus headers and JSON envelope, it must still
	// marshal strictly under the 32 MiB HTTP import limit.
	const bodySize = 19*1024*1024 + 512*1024
	binBody := make([]byte, bodySize)
	for i := range binBody {
		binBody[i] = byte((i*31 + 0x80) & 0xff)
	}
	binBody[0] = 0x00 // guarantee binary/base64 encoding

	respB := src.spill(binBody, "application/octet-stream")
	reqHead := "GET /big.bin HTTP/1.1\nHost: cap.example\n" + strings.Repeat("X-Pad: 0123456789\n", 10)
	respHead := "HTTP/1.1 200 OK\nContent-Type: application/octet-stream\n"
	if err := src.insertExchange("bin-near-cap", 1700000100, "cap.example", "GET", "/big.bin",
		"https://cap.example/big.bin", 200, "application/octet-stream", 0, len(binBody), reqHead, storedBody{}, respHead, respB); err != nil {
		t.Fatal(err)
	}

	doc, meta, err := src.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{})
	if err != nil {
		t.Fatalf("ExportHAR near cap: %v", err)
	}
	if meta.Truncated || meta.Exported != 1 {
		t.Fatalf("near-cap export meta = %+v, want Truncated=false Exported=1", meta)
	}
	// Verify headers were counted in TotalBytes alongside the body.
	wantRaw := int64(len(reqHead) + len(respHead) + len(binBody))
	if meta.TotalBytes != wantRaw {
		t.Fatalf("meta.TotalBytes = %d, want %d (headers + body)", meta.TotalBytes, wantRaw)
	}

	rawJSON, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	const httpImportLimit = 32 << 20
	if len(rawJSON) >= httpImportLimit {
		t.Fatalf("marshaled near-cap binary HAR = %d bytes, exceeds 32 MiB import limit (%d)", len(rawJSON), httpImportLimit)
	}

	// Re-importing into a fresh store succeeds with exact bytes.
	dst, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()
	imp, err := dst.ImportHAR(rawJSON, HARImportOptions{})
	if err != nil || imp.Imported != 1 || imp.Failed != 0 || imp.Truncated {
		t.Fatalf("re-import near-cap binary HAR = (%+v, %v)", imp, err)
	}
	_, _, _, gotResp, err := dst.loadFullExchange("bin-near-cap", "")
	if err != nil || !bytes.Equal(gotResp, binBody) {
		t.Fatalf("near-cap binary round-trip mismatch: len=%d err=%v", len(gotResp), err)
	}
}

func TestHARImportPostDataParamsAndCookies(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	// Entry 0: form body ONLY in postData.params, cookies ONLY in cookies arrays.
	// Entry 1: Cookie and Set-Cookie already present in headers -> must NOT duplicate.
	harJSON := `{
		"log": {
			"version": "1.2",
			"entries": [
				{
					"startedDateTime": "2026-05-02T09:00:00Z",
					"request": {
						"method": "POST",
						"url": "https://form.example/login",
						"headers": [{"name": "Host", "value": "form.example"}],
						"cookies": [
							{"name": "sid", "value": "abc123"},
							{"name": "theme", "value": "dark"}
						],
						"postData": {
							"mimeType": "application/x-www-form-urlencoded",
							"params": [
								{"name": "user", "value": "alice"},
								{"name": "msg", "value": "hello world"}
							]
						}
					},
					"response": {
						"status": 302,
						"headers": [{"name": "Location", "value": "/home"}],
						"cookies": [
							{"name": "session", "value": "xyz", "path": "/", "httpOnly": true, "secure": true}
						],
						"content": {"size": 0, "mimeType": ""}
					}
				},
				{
					"startedDateTime": "2026-05-02T09:00:05Z",
					"request": {
						"method": "GET",
						"url": "https://form.example/home",
						"headers": [{"name": "Cookie", "value": "existing=1"}],
						"cookies": [{"name": "existing", "value": "1"}]
					},
					"response": {
						"status": 200,
						"headers": [{"name": "Set-Cookie", "value": "kept=2; Path=/"}],
						"cookies": [{"name": "kept", "value": "2", "path": "/"}],
						"content": {"size": 2, "mimeType": "text/plain", "text": "ok"}
					}
				}
			]
		}
	}`

	res, err := tr.ImportHAR([]byte(harJSON), HARImportOptions{})
	if err != nil || res.Imported != 2 || res.Failed != 0 {
		t.Fatalf("ImportHAR(params+cookies) = (%+v, %v)", res, err)
	}

	rows, _, err := tr.Page(PageQuery{Host: "form.example", RespMin: -1, RespMax: -1, Sort: "ts", Order: "asc"}, 0, 10)
	if err != nil || len(rows) != 2 {
		t.Fatalf("Page = (%d, %v)", len(rows), err)
	}
	req0, resp0, err := tr.Get(rows[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(req0, "Cookie: sid=abc123; theme=dark\n") {
		t.Fatalf("entry 0 missing synthesized Cookie header: %q", req0)
	}
	if !strings.Contains(req0, "user=alice&msg=hello+world") {
		t.Fatalf("entry 0 missing postData.params form body: %q", req0)
	}
	if !strings.Contains(resp0, "Set-Cookie: session=xyz; Path=/; Secure; HttpOnly\n") {
		t.Fatalf("entry 0 missing synthesized Set-Cookie header: %q", resp0)
	}

	req1, resp1, err := tr.Get(rows[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(req1, "Cookie:") != 1 {
		t.Fatalf("entry 1 duplicated Cookie header: %q", req1)
	}
	if strings.Count(resp1, "Set-Cookie:") != 1 {
		t.Fatalf("entry 1 duplicated Set-Cookie header: %q", resp1)
	}
}

func TestHARImportStripsAndRedactsURLUserinfo(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	harJSON := `{
		"log": {
			"version": "1.2",
			"entries": [
				{
					"startedDateTime": "2026-05-03T10:00:00Z",
					"request": {
						"method": "GET",
						"url": "https://alice:supersecret@api.example.com/v1/items?k=1",
						"headers": []
					},
					"response": {
						"status": 200,
						"headers": [],
						"content": {"mimeType": "text/plain", "text": "ok"}
					}
				},
				{
					"startedDateTime": "2026-05-03T10:00:01Z",
					"request": {
						"method": "BAD METHOD",
						"url": "https://bob:topsecret@bad.example.com/fail",
						"headers": []
					},
					"response": {"status": 200, "headers": [], "content": {}}
				},
				{
					"startedDateTime": "2026-05-03T10:00:02Z",
					"request": {
						"method": "GET",
						"url": "https://carol:hiddenpass@bad host/x",
						"headers": []
					},
					"response": {"status": 200, "headers": [], "content": {}}
				}
			]
		}
	}`

	res, err := tr.ImportHAR([]byte(harJSON), HARImportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Imported != 1 || res.Failed != 2 || len(res.Errors) != 2 {
		t.Fatalf("ImportHAR userinfo result = %+v, want 1 imported / 2 failed", res)
	}
	for _, e := range res.Errors {
		for _, secret := range []string{"bob", "topsecret", "carol", "hiddenpass"} {
			if strings.Contains(e.URL, secret) || strings.Contains(e.Reason, secret) {
				t.Fatalf("import error leaked userinfo %q: %+v", secret, e)
			}
		}
	}

	// Stored URL must have userinfo stripped.
	rows, total, err := tr.Page(PageQuery{RespMin: -1, RespMax: -1}, 0, 10)
	if err != nil || total != 1 || len(rows) != 1 {
		t.Fatalf("Page = (%d, %d, %v)", len(rows), total, err)
	}
	if rows[0].URL != "https://api.example.com/v1/items?k=1" {
		t.Fatalf("stored URL = %q, want userinfo stripped", rows[0].URL)
	}
	// FTS must NOT find the stripped password.
	if found, tot, err := tr.Page(PageQuery{Query: "supersecret", RespMin: -1, RespMax: -1}, 0, 10); err != nil || tot != 0 || len(found) != 0 {
		t.Fatalf("FTS leaked userinfo secret: %+v", found)
	}
	// Exported HAR must NOT contain the password.
	doc, _, err := tr.ExportHAR(PageQuery{RespMin: -1, RespMax: -1}, HARExportOptions{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(doc)
	if strings.Contains(string(raw), "supersecret") || strings.Contains(string(raw), "alice") {
		t.Fatalf("exported HAR leaked userinfo: %s", string(raw))
	}
}
