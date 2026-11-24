package traffic

import (
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// ExternalExchange is one captured request/response pair handed in from
// outside the MITM proxy (currently the browser-extension ingest endpoint).
// Header maps are lowercased-name oriented on the extension side but any
// casing is accepted; bodies are raw text (binary capture is skipped by the
// extension, not handled here).
type ExternalExchange struct {
	Method          string            `json:"method"`
	URL             string            `json:"url"`
	Status          int               `json:"status"`
	RequestHeaders  map[string]string `json:"requestHeaders"`
	RequestBody     string            `json:"requestBody"`
	ResponseHeaders map[string]string `json:"responseHeaders"`
	ResponseBody    string            `json:"responseBody"`
}

// RecordExternal stores an externally captured exchange through the same
// spill/blob/index path as proxy traffic, so ingested entries are
// indistinguishable from proxy-captured ones on the Traffic page and in
// full-text search.
func (t *Traffic) RecordExternal(e ExternalExchange) error {
	u, err := url.Parse(e.URL)
	if err != nil || u.Host == "" {
		return fmt.Errorf("invalid url %q", e.URL)
	}
	method := strings.ToUpper(strings.TrimSpace(e.Method))
	if method == "" {
		return fmt.Errorf("empty method for %q", e.URL)
	}
	if !validHeaderName(method) {
		return fmt.Errorf("invalid method %q", e.Method)
	}
	if err := validateExternalHeaders(e.RequestHeaders); err != nil {
		return err
	}
	if err := validateExternalHeaders(e.ResponseHeaders); err != nil {
		return err
	}
	status := e.Status
	if status == 0 {
		status = 200
	}

	host := u.Hostname()
	reqHead := fmt.Sprintf("%s %s %s\n%s", method, u.RequestURI(), "HTTP/1.1", headerLines(toHeaderMap(e.RequestHeaders)))
	respHead := fmt.Sprintf("HTTP %d\n%s", status, headerLines(toHeaderMap(e.ResponseHeaders)))
	respCT := e.ResponseHeaders["content-type"]

	t.wmu.Lock()
	defer t.wmu.Unlock()

	// Bodies are spilled before the transaction opens, matching record().
	reqB := t.spill([]byte(e.RequestBody), e.RequestHeaders["content-type"])
	respB := t.spill([]byte(e.ResponseBody), respCT)

	n := t.seq.Add(1)
	now := time.Now()
	id := fmt.Sprintf("%d-%04d", now.Unix(), n%10000)

	if err := t.insertExchange(id, now.Unix(), host, method, db.TemplatePath(u.EscapedPath()), u.String(), status, respCT, len(e.RequestBody), len(e.ResponseBody), reqHead, reqB, respHead, respB); err != nil {
		slog.Error("[traffic] failed to ingest external exchange", "url", u.String(), "err", err)
		return err
	}
	return nil
}

// insertExchange writes the index row, the body row, blob references and the
// FTS entry inside one transaction. record() and RecordExternal share it so
// both capture paths stay byte-identical in storage layout.
func (t *Traffic) insertExchange(id string, ts int64, host, method, urlTemplate, rawURL string, status int, contentType string, reqLen, respLen int, reqHead string, reqB storedBody, respHead string, respB storedBody) error {
	tx, err := t.db.Begin()
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	// An id can repeat (seconds plus a rolling counter); the trace of the
	// exchange it replaces must not stay attached to this one.
	if _, err := tx.Exec(`DELETE FROM exchange_rewrites WHERE exchange_id=?`, id); err != nil {
		return fmt.Errorf("clearing rewrite trace: %w", err)
	}
	res, err := tx.Exec(`INSERT OR REPLACE INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,'')`,
		id, ts, host, method, urlTemplate, rawURL, status, contentType, reqLen, respLen)
	if err != nil {
		return fmt.Errorf("writing index: %w", err)
	}
	rowid, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("fetching rowid: %w", err)
	}

	if _, err := tx.Exec(`INSERT OR REPLACE INTO exchange_bodies(id,req_head,req_body,req_blob,resp_head,resp_body,resp_blob)
VALUES(?,?,?,?,?,?,?)`,
		id, reqHead, reqB.inline, nullIfEmpty(reqB.hash), respHead, respB.inline, nullIfEmpty(respB.hash)); err != nil {
		return fmt.Errorf("writing body: %w", err)
	}

	for _, h := range []string{reqB.hash, respB.hash} {
		if h == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash,exchange_id) VALUES(?,?)`, h, id); err != nil {
			return fmt.Errorf("registering blob reference: %w", err)
		}
	}

	if t.fts {
		idx := strings.Join([]string{rawURL, reqHead, reqB.index, respHead, respB.index}, "\n")
		if _, err := tx.Exec(`INSERT INTO ex_fts(rowid,content) VALUES(?,?)`, rowid, idx); err != nil {
			return fmt.Errorf("writing full-text index: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing: %w", err)
	}
	return nil
}

func validateExternalHeaders(h map[string]string) error {
	for k, v := range h {
		if !validHeaderName(k) {
			return fmt.Errorf("invalid header name %q", k)
		}
		if strings.ContainsAny(v, "\r\n\x00") {
			return fmt.Errorf("header %s contains a line break", k)
		}
	}
	return nil
}

func toHeaderMap(flat map[string]string) map[string][]string {
	m := make(map[string][]string, len(flat))
	for k, v := range flat {
		m[k] = []string{v}
	}
	return m
}
