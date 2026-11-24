package server

import (
	"encoding/json"
	"net/http"

	"github.com/Autumn-27/artex/traffic"
)

// Ingest caps: a browser tab can produce a burst of entries, but the ingest
// path is meant for deliberate operator captures, not bulk sync. Bodies are
// truncated server-side as a second line of defense behind the extension's
// own caps.
const (
	maxIngestBatch    = 50
	maxIngestBodySize = 256 << 10 // 256 KiB per body
)

// ingestTraffic accepts exchanges captured outside the MITM proxy (currently
// the browser extension) into the global traffic store, so operator-driven
// authenticated browsing becomes evidence the same way proxy traffic is.
func (s *Server) ingestTraffic(w http.ResponseWriter, r *http.Request) {
	tr := s.m.Traffic()
	if tr == nil {
		writeErr(w, 503, "traffic store is not available")
		return
	}
	var req struct {
		Exchanges []traffic.ExternalExchange `json:"exchanges"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<20)).Decode(&req); err != nil {
		writeErr(w, 400, "bad json: "+err.Error())
		return
	}
	if len(req.Exchanges) == 0 {
		writeErr(w, 400, "empty exchanges")
		return
	}
	if len(req.Exchanges) > maxIngestBatch {
		writeErr(w, 400, "too many exchanges in one batch")
		return
	}

	ingested, failed := 0, 0
	for _, e := range req.Exchanges {
		e.RequestBody = truncateBody(e.RequestBody)
		e.ResponseBody = truncateBody(e.ResponseBody)
		if err := tr.RecordExternal(e); err != nil {
			failed++
			continue
		}
		ingested++
	}
	writeJSON(w, 200, map[string]any{"ingested": ingested, "failed": failed})
}

func truncateBody(s string) string {
	if len(s) <= maxIngestBodySize {
		return s
	}
	return s[:maxIngestBodySize] + "\n... [truncated by ingest]"
}
