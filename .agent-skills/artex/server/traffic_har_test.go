package server

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/traffic"
)

func TestTrafficHAREndpointsRoundTripFilterAndErrors(t *testing.T) {
	s, request := ingestServer(t)

	binPayload := []byte{0x00, 0x01, 0x89, 0x50, 0xfe, 0xff}
	harIn := traffic.HAR{
		Log: &traffic.HARLog{
			Version: "1.2",
			Creator: traffic.HARCreator{Name: "TestSuite", Version: "1.0"},
			Entries: []traffic.HAREntry{
				{
					StartedDateTime: "2026-06-01T08:00:00Z",
					Request: traffic.HARRequest{
						Method:  "POST",
						URL:     "https://har-a.example/api/login",
						Headers: []traffic.HARHeader{{Name: "Content-Type", Value: "application/json"}},
						PostData: &traffic.HARPostData{
							MimeType: "application/json",
							Text:     `{"user":"alice"}`,
						},
					},
					Response: traffic.HARResponse{
						Status:  200,
						Headers: []traffic.HARHeader{{Name: "Content-Type", Value: "application/json"}},
						Content: traffic.HARContent{
							MimeType: "application/json",
							Text:     `{"ok":true}`,
						},
					},
				},
				{
					StartedDateTime: "2026-06-01T08:00:10Z",
					Request: traffic.HARRequest{
						Method:  "GET",
						URL:     "https://har-b.example/blob.bin",
						Headers: []traffic.HARHeader{},
					},
					Response: traffic.HARResponse{
						Status:  200,
						Headers: []traffic.HARHeader{{Name: "Content-Type", Value: "application/octet-stream"}},
						Content: traffic.HARContent{
							MimeType: "application/octet-stream",
							Text:     base64.StdEncoding.EncodeToString(binPayload),
							Encoding: "base64",
						},
					},
				},
			},
		},
	}
	rawIn, err := json.Marshal(harIn)
	if err != nil {
		t.Fatal(err)
	}

	// Import via HTTP endpoint.
	w := request(http.MethodPost, "/api/traffic/import/har", string(rawIn))
	if w.Code != http.StatusOK {
		t.Fatalf("POST /api/traffic/import/har status=%d body=%s", w.Code, w.Body.String())
	}
	var importRes traffic.HARImportResult
	if err := json.Unmarshal(w.Body.Bytes(), &importRes); err != nil {
		t.Fatal(err)
	}
	if importRes.Imported != 2 || importRes.Skipped != 0 || importRes.Failed != 0 {
		t.Fatalf("importRes = %+v, want 2/0/0", importRes)
	}

	// Re-import is idempotent.
	w2 := request(http.MethodPost, "/api/traffic/import/har", string(rawIn))
	if w2.Code != http.StatusOK {
		t.Fatalf("re-import status=%d body=%s", w2.Code, w2.Body.String())
	}
	var importRes2 traffic.HARImportResult
	if err := json.Unmarshal(w2.Body.Bytes(), &importRes2); err != nil {
		t.Fatal(err)
	}
	if importRes2.Imported != 0 || importRes2.Skipped != 2 || importRes2.Failed != 0 {
		t.Fatalf("re-import res = %+v, want 0/2/0", importRes2)
	}

	// Imported rows are listed on GET /api/traffic with rewritten=false and zero exchange_rewrites rows.
	wList := request(http.MethodGet, "/api/traffic?host=har-", "")
	if wList.Code != http.StatusOK {
		t.Fatalf("GET /api/traffic status=%d body=%s", wList.Code, wList.Body.String())
	}
	var listResp struct {
		Total     int                  `json:"total"`
		Exchanges []TrafficExchangeDTO `json:"exchanges"`
	}
	if err := json.Unmarshal(wList.Body.Bytes(), &listResp); err != nil {
		t.Fatal(err)
	}
	if listResp.Total != 2 || len(listResp.Exchanges) != 2 {
		t.Fatalf("listResp = %+v, want 2 exchanges", listResp)
	}
	for _, row := range listResp.Exchanges {
		if row.Rewritten {
			t.Fatalf("imported row %s marked rewritten", row.ID)
		}
	}
	var rwCount int
	if err := s.m.Traffic().DB().QueryRow(`SELECT COUNT(*) FROM exchange_rewrites`).Scan(&rwCount); err != nil || rwCount != 0 {
		t.Fatalf("exchange_rewrites count after HTTP HAR import = %d err=%v, want 0", rwCount, err)
	}

	// Filtered export by host returns only har-b.example with binary payload preserved as base64.
	wExp := request(http.MethodGet, "/api/traffic/export/har?host=har-b.example", "")
	if wExp.Code != http.StatusOK {
		t.Fatalf("GET /api/traffic/export/har status=%d body=%s", wExp.Code, wExp.Body.String())
	}
	if ct := wExp.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("export Content-Type = %q, want application/json", ct)
	}
	if wExp.Header().Get("X-ARTEX-HAR-Truncated") != "false" || wExp.Header().Get("X-ARTEX-HAR-Exported") != "1" || wExp.Header().Get("X-ARTEX-HAR-Matched") != "1" {
		t.Fatalf("unexpected export headers: %+v", wExp.Header())
	}
	var exported traffic.HAR
	if err := json.Unmarshal(wExp.Body.Bytes(), &exported); err != nil {
		t.Fatal(err)
	}
	if exported.Log == nil || exported.Log.Version != "1.2" || len(exported.Log.Entries) != 1 {
		t.Fatalf("filtered export = %+v", exported.Log)
	}
	entry := exported.Log.Entries[0]
	if entry.Request.URL != "https://har-b.example/blob.bin" || entry.Response.Content.Encoding != "base64" {
		t.Fatalf("exported binary entry = %+v", entry)
	}
	decoded, err := base64.StdEncoding.DecodeString(entry.Response.Content.Text)
	if err != nil || !bytes.Equal(decoded, binPayload) {
		t.Fatalf("exported binary bytes mismatch: got=%x err=%v", decoded, err)
	}

	// Re-importing the exported HAR via HTTP is idempotent.
	wReimp := request(http.MethodPost, "/api/traffic/import/har", wExp.Body.String())
	if wReimp.Code != http.StatusOK || !strings.Contains(wReimp.Body.String(), `"imported":0`) || !strings.Contains(wReimp.Body.String(), `"skipped":1`) {
		t.Fatalf("re-import exported HAR status=%d body=%s", wReimp.Code, wReimp.Body.String())
	}

	// Error cases -> 400 naming the reason.
	for _, tc := range []struct {
		name string
		body string
		want string
	}{
		{"malformed", `{"log":`, "malformed JSON"},
		{"missing entries", `{"log":{"version":"1.2"}}`, "missing log.entries"},
		{"unsupported version", `{"log":{"version":"2.0","entries":[]}}`, "unsupported HAR version"},
	} {
		wErr := request(http.MethodPost, "/api/traffic/import/har", tc.body)
		if wErr.Code != http.StatusBadRequest || !strings.Contains(wErr.Body.String(), tc.want) {
			t.Fatalf("%s: status=%d body=%s, want 400 containing %q", tc.name, wErr.Code, wErr.Body.String(), tc.want)
		}
	}

	// Traffic store unavailable -> 503 on both import and export.
	sOff := &Server{m: &Manager{}}
	wOffImp := httptest.NewRecorder()
	sOff.importTrafficHAR(wOffImp, httptest.NewRequest(http.MethodPost, "/api/traffic/import/har", strings.NewReader(`{}`)))
	if wOffImp.Code != http.StatusServiceUnavailable {
		t.Fatalf("import with traffic off status=%d, want 503", wOffImp.Code)
	}
	wOffExp := httptest.NewRecorder()
	sOff.exportTrafficHAR(wOffExp, httptest.NewRequest(http.MethodGet, "/api/traffic/export/har", nil))
	if wOffExp.Code != http.StatusServiceUnavailable {
		t.Fatalf("export with traffic off status=%d, want 503", wOffExp.Code)
	}
}

func TestTrafficHAREndpointsRequireAuth(t *testing.T) {
	s, _ := ingestServer(t)

	rImp := httptest.NewRequest(http.MethodPost, "/api/traffic/import/har", strings.NewReader(`{"log":{"version":"1.2","entries":[]}}`))
	wImp := httptest.NewRecorder()
	s.Handler().ServeHTTP(wImp, rImp)
	if wImp.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated HAR import status=%d, want 401", wImp.Code)
	}

	rExp := httptest.NewRequest(http.MethodGet, "/api/traffic/export/har", nil)
	wExp := httptest.NewRecorder()
	s.Handler().ServeHTTP(wExp, rExp)
	if wExp.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated HAR export status=%d, want 401", wExp.Code)
	}
}

func TestTrafficHARExportNearCapReimportsThroughHTTPHandler(t *testing.T) {
	s, request := ingestServer(t)
	tr := s.m.Traffic()

	// Seed a binary exchange near the 20 MiB export raw cap (~19.5 MiB).
	const bodySize = 19*1024*1024 + 512*1024
	binBody := make([]byte, bodySize)
	for i := range binBody {
		binBody[i] = byte((i*17 + 0x81) & 0xff)
	}
	binBody[0] = 0x00

	rawSeed, err := json.Marshal(traffic.HAR{
		Log: &traffic.HARLog{
			Version: "1.2",
			Entries: []traffic.HAREntry{{
				StartedDateTime: "2026-06-02T00:00:00Z",
				Request:         traffic.HARRequest{Method: "GET", URL: "https://nearcap.example/bin", Headers: []traffic.HARHeader{}},
				Response: traffic.HARResponse{
					Status:  200,
					Headers: []traffic.HARHeader{{Name: "Content-Type", Value: "application/octet-stream"}},
					Content: traffic.HARContent{
						Size:     len(binBody),
						MimeType: "application/octet-stream",
						Text:     base64.StdEncoding.EncodeToString(binBody),
						Encoding: "base64",
					},
				},
			}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tr.ImportHAR(rawSeed, traffic.HARImportOptions{}); err != nil {
		t.Fatal(err)
	}

	wExp := request(http.MethodGet, "/api/traffic/export/har?host=nearcap.example", "")
	if wExp.Code != http.StatusOK {
		t.Fatalf("export status=%d", wExp.Code)
	}
	if wExp.Header().Get("X-ARTEX-HAR-Truncated") != "false" {
		t.Fatalf("expected non-truncated export, headers=%+v", wExp.Header())
	}
	if wExp.Body.Len() >= decodeMaxBytes {
		t.Fatalf("exported HAR size=%d exceeds decodeMaxBytes=%d", wExp.Body.Len(), decodeMaxBytes)
	}

	// Re-import the exact exported bytes through the HTTP handler (including
	// limitRequestBody 32 MiB middleware) — must answer 200, never 413.
	wImp := request(http.MethodPost, "/api/traffic/import/har", wExp.Body.String())
	if wImp.Code != http.StatusOK {
		t.Fatalf("re-import near-cap export via HTTP status=%d body=%s, want 200", wImp.Code, wImp.Body.String())
	}
}
