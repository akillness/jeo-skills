package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"

	"github.com/Autumn-27/artex/traffic"
)

func parseTrafficPageQuery(q url.Values) traffic.PageQuery {
	return traffic.PageQuery{
		Host:      q.Get("host"),
		Method:    q.Get("method"),
		Query:     q.Get("q"),
		Body:      q.Get("body"),
		Path:      q.Get("path"),
		Status:    q.Get("status"),
		Rewritten: q.Get("rewritten"),
		RespMin:   int64(atoiDefault(q.Get("resp_min"), -1)),
		RespMax:   int64(atoiDefault(q.Get("resp_max"), -1)),
		Sort:      q.Get("sort"),
		Order:     q.Get("order"),
	}
}

// importTrafficHAR accepts a raw HAR 1.2 JSON document (capped at decodeMaxBytes,
// 32 MiB) and imports valid entries into the traffic store with deterministic
// IDs. Imported traffic never passes through capture rewrite rules.
func (s *Server) importTrafficHAR(w http.ResponseWriter, r *http.Request) {
	tr := s.m.Traffic()
	if tr == nil {
		writeErr(w, http.StatusServiceUnavailable, "traffic store is not available")
		return
	}
	body := r.Body
	if _, already := body.(*limitedBody); !already {
		body = http.MaxBytesReader(w, body, decodeMaxBytes)
	}
	raw, err := io.ReadAll(body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, http.StatusRequestEntityTooLarge, "HAR payload exceeds 32 MiB limit")
			return
		}
		writeErr(w, http.StatusBadRequest, "failed to read HAR body: "+err.Error())
		return
	}
	res, err := tr.ImportHAR(raw, traffic.HARImportOptions{})
	if err != nil {
		if errors.Is(err, traffic.ErrInvalidHAR) {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// exportTrafficHAR exports recorded traffic matching the query filters as an
// application/json HAR 1.2 document in stable chronological order. Entry and
// total-byte caps are enforced and reported via both X-ARTEX-HAR-* headers and
// HAR 1.2 custom fields (_truncated, _truncatedReason, _totalMatched).
func (s *Server) exportTrafficHAR(w http.ResponseWriter, r *http.Request) {
	tr := s.m.Traffic()
	if tr == nil {
		writeErr(w, http.StatusServiceUnavailable, "traffic store is not available")
		return
	}
	pq := parseTrafficPageQuery(r.URL.Query())
	doc, meta, err := tr.ExportHAR(pq, traffic.HARExportOptions{CreatorVersion: BuildVersion})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	payload, err := json.Marshal(doc)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="artex-traffic.har"`)
	w.Header().Set("X-ARTEX-HAR-Truncated", strconv.FormatBool(meta.Truncated))
	w.Header().Set("X-ARTEX-HAR-Exported", strconv.Itoa(meta.Exported))
	w.Header().Set("X-ARTEX-HAR-Matched", strconv.Itoa(meta.TotalMatched))
	if meta.Truncated {
		w.Header().Set("X-ARTEX-HAR-Truncated-Reason", meta.TruncatedReason)
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}
