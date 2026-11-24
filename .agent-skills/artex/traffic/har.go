package traffic

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

const (
	// HARVersion is the HAR specification version produced and accepted.
	HARVersion = "1.2"

	// DefaultHARMaxImportEntries caps how many entries a single HAR import accepts.
	DefaultHARMaxImportEntries = 2000
	// DefaultHARMaxImportBytes caps total decoded request+response body bytes
	// imported in a single HAR document.
	DefaultHARMaxImportBytes int64 = 32 << 20

	// DefaultHARMaxExportEntries caps how many exchanges a single HAR export emits.
	DefaultHARMaxExportEntries = 1000
	// DefaultHARMaxExportBytes caps total raw header + body bytes emitted in a
	// single HAR export. At 20 MiB raw, even pure binary payloads expand via
	// base64 (4/3x ≈ 26.7 MiB) plus HAR JSON overhead safely below the 32 MiB
	// HTTP import limit.
	DefaultHARMaxExportBytes int64 = 20 << 20
	// DefaultHARMaxExportJSONBytes backstops the marshaled JSON size of an export
	// (31 MiB, leaving 1 MiB margin below the 32 MiB import HTTP body cap) so
	// even pathological JSON-escaped control-character payloads cannot exceed
	// the import limit.
	DefaultHARMaxExportJSONBytes int64 = 31 << 20

	maxHARImportErrors = 50
	maxArtexIDLen      = 128
)

// ErrInvalidHAR marks a malformed or unsupported HAR document (mapped to HTTP 400).
var ErrInvalidHAR = errors.New("invalid HAR")

// HAR is a HAR 1.2 envelope. Required HAR 1.2 fields that the traffic store
// does not record use explicit unknown placeholders (time: 0, cache: {},
// timings: {send:-1, wait:-1, receive:-1}, cookies: [], queryString: [],
// headersSize: -1, redirectURL: "") rather than fabricated measurements.
type HAR struct {
	Log *HARLog `json:"log"`
}

type HARLog struct {
	Version         string     `json:"version"`
	Creator         HARCreator `json:"creator"`
	Entries         []HAREntry `json:"entries"`
	Truncated       bool       `json:"_truncated,omitempty"`
	TruncatedReason string     `json:"_truncatedReason,omitempty"`
	TotalMatched    int        `json:"_totalMatched,omitempty"`
}

type HARCreator struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type HARCache struct{}

type HARTimings struct {
	Send    float64 `json:"send"`
	Wait    float64 `json:"wait"`
	Receive float64 `json:"receive"`
}

type HAREntry struct {
	StartedDateTime string      `json:"startedDateTime"`
	Time            float64     `json:"time"`
	Request         HARRequest  `json:"request"`
	Response        HARResponse `json:"response"`
	Cache           HARCache    `json:"cache"`
	Timings         HARTimings  `json:"timings"`
	ArtexExchangeID string      `json:"_artexExchangeId,omitempty"`
}

type HARRequest struct {
	Method      string       `json:"method"`
	URL         string       `json:"url"`
	HTTPVersion string       `json:"httpVersion"`
	Cookies     []HARCookie  `json:"cookies"`
	Headers     []HARHeader  `json:"headers"`
	QueryString []HARParam   `json:"queryString"`
	PostData    *HARPostData `json:"postData,omitempty"`
	HeadersSize int          `json:"headersSize"`
	BodySize    int          `json:"bodySize"`
}

type HARPostData struct {
	MimeType string     `json:"mimeType,omitempty"`
	Params   []HARParam `json:"params,omitempty"`
	Text     string     `json:"text,omitempty"`
	Encoding string     `json:"encoding,omitempty"`
}

type HARParam struct {
	Name        string `json:"name"`
	Value       string `json:"value"`
	FileName    string `json:"fileName,omitempty"`
	ContentType string `json:"contentType,omitempty"`
}

type HARCookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Path     string `json:"path,omitempty"`
	Domain   string `json:"domain,omitempty"`
	Expires  string `json:"expires,omitempty"`
	HTTPOnly bool   `json:"httpOnly,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
}

type HARResponse struct {
	Status      int         `json:"status"`
	StatusText  string      `json:"statusText"`
	HTTPVersion string      `json:"httpVersion"`
	Cookies     []HARCookie `json:"cookies"`
	Headers     []HARHeader `json:"headers"`
	Content     HARContent  `json:"content"`
	RedirectURL string      `json:"redirectURL"`
	HeadersSize int         `json:"headersSize"`
	BodySize    int         `json:"bodySize"`
}

type HARContent struct {
	Size     int    `json:"size"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text,omitempty"`
	Encoding string `json:"encoding,omitempty"`
}

type HARHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// HARImportOptions configures safety caps for ImportHAR. Zero values use the
// package defaults.
type HARImportOptions struct {
	MaxEntries    int
	MaxTotalBytes int64
}

// HARImportError describes one entry that could not be imported.
type HARImportError struct {
	Index  int    `json:"index"`
	URL    string `json:"url,omitempty"`
	Reason string `json:"reason"`
}

// HARImportResult summarizes one ImportHAR run.
type HARImportResult struct {
	Imported  int              `json:"imported"`
	Skipped   int              `json:"skipped"`
	Failed    int              `json:"failed"`
	Truncated bool             `json:"truncated,omitempty"`
	Errors    []HARImportError `json:"errors,omitempty"`
}

// HARExportOptions configures ExportHAR. Zero caps use package defaults.
type HARExportOptions struct {
	CreatorVersion string
	MaxEntries     int
	MaxTotalBytes  int64 // raw header + body bytes cap
	MaxJSONBytes   int64 // marshaled JSON cap (defaults to DefaultHARMaxExportJSONBytes)
}

// HARExportMeta reports export counts and whether a cap stopped the export.
type HARExportMeta struct {
	Exported        int
	TotalMatched    int
	TotalBytes      int64 // total raw header + body bytes exported
	Truncated       bool
	TruncatedReason string // "" | "max_entries" | "max_bytes"
}

// ImportHAR parses a HAR 1.2 JSON document and inserts valid entries into the
// traffic store. ARTEX-exported entries carrying a valid _artexExchangeId
// preserve that ID so distinct exchanges within the same second round-trip
// cleanly; external HAR entries receive a deterministic content-based har- ID
// so re-importing the same HAR is idempotent and skips existing rows. URL
// userinfo is stripped before storing, indexing, or reporting errors. Imported
// traffic never passes through capture rewrite rules and never gains
// exchange_rewrites rows.
func (t *Traffic) ImportHAR(raw []byte, opts HARImportOptions) (HARImportResult, error) {
	if t == nil {
		return HARImportResult{}, errors.New("traffic store is not available")
	}
	if opts.MaxEntries <= 0 {
		opts.MaxEntries = DefaultHARMaxImportEntries
	}
	if opts.MaxTotalBytes <= 0 {
		opts.MaxTotalBytes = DefaultHARMaxImportBytes
	}

	doc, err := decodeHARDocument(raw)
	if err != nil {
		return HARImportResult{}, err
	}
	if len(doc.Log.Entries) > opts.MaxEntries {
		return HARImportResult{}, fmt.Errorf("%w: HAR contains %d entries, exceeding limit of %d", ErrInvalidHAR, len(doc.Log.Entries), opts.MaxEntries)
	}

	var res HARImportResult
	addErr := func(idx int, rawURL, reason string) {
		if len(res.Errors) < maxHARImportErrors {
			res.Errors = append(res.Errors, HARImportError{
				Index:  idx,
				URL:    redactURLUserinfo(rawURL),
				Reason: reason,
			})
		}
	}

	var totalBytes int64
	for i, entry := range doc.Log.Entries {
		parsed, err := parseHAREntry(entry)
		if err != nil {
			res.Failed++
			addErr(i, entry.Request.URL, err.Error())
			continue
		}
		entryBytes := int64(len(parsed.reqBody) + len(parsed.respBody))
		if totalBytes+entryBytes > opts.MaxTotalBytes {
			remaining := len(doc.Log.Entries) - i
			res.Truncated = true
			res.Skipped += remaining
			addErr(i, entry.Request.URL, fmt.Sprintf("decoded body byte cap (%d bytes) reached; %d remaining entries skipped", opts.MaxTotalBytes, remaining))
			break
		}

		inserted, err := t.insertHARExchange(parsed)
		if err != nil {
			res.Failed++
			addErr(i, entry.Request.URL, err.Error())
			continue
		}
		if !inserted {
			res.Skipped++
			continue
		}
		totalBytes += entryBytes
		res.Imported++
	}
	return res, nil
}

func decodeHARDocument(raw []byte) (HAR, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return HAR{}, fmt.Errorf("%w: empty HAR document", ErrInvalidHAR)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	var doc HAR
	if err := dec.Decode(&doc); err != nil {
		return HAR{}, fmt.Errorf("%w: malformed JSON: %v", ErrInvalidHAR, err)
	}
	// Reject trailing non-whitespace tokens after the root object.
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return HAR{}, fmt.Errorf("%w: malformed JSON: trailing content after HAR object", ErrInvalidHAR)
	}
	if doc.Log == nil {
		return HAR{}, fmt.Errorf("%w: missing log object", ErrInvalidHAR)
	}
	if strings.TrimSpace(doc.Log.Version) != HARVersion {
		return HAR{}, fmt.Errorf("%w: unsupported HAR version %q (expected %s)", ErrInvalidHAR, doc.Log.Version, HARVersion)
	}
	if doc.Log.Entries == nil {
		return HAR{}, fmt.Errorf("%w: missing log.entries", ErrInvalidHAR)
	}
	return doc, nil
}

type parsedHARExchange struct {
	id          string
	ts          int64
	host        string
	method      string
	urlTemplate string
	rawURL      string
	status      int
	reqCT       string
	respCT      string
	reqHead     string
	reqBody     []byte
	respHead    string
	respBody    []byte
}

func parseHAREntry(entry HAREntry) (parsedHARExchange, error) {
	tsStr := strings.TrimSpace(entry.StartedDateTime)
	if tsStr == "" {
		return parsedHARExchange{}, errors.New("missing startedDateTime")
	}
	parsedTS, err := time.Parse(time.RFC3339Nano, tsStr)
	if err != nil {
		return parsedHARExchange{}, fmt.Errorf("invalid startedDateTime %q", entry.StartedDateTime)
	}
	ts := parsedTS.UTC().Unix()

	rawURL := strings.TrimSpace(entry.Request.URL)
	u, err := url.Parse(rawURL)
	if err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return parsedHARExchange{}, fmt.Errorf("invalid request url %q", redactURLUserinfo(entry.Request.URL))
	}
	// Strip URL userinfo (user:pass@) before storing, indexing, or exporting,
	// matching the asset store.
	u.User = nil

	method := strings.ToUpper(strings.TrimSpace(entry.Request.Method))
	if method == "" || !validHeaderName(method) {
		return parsedHARExchange{}, fmt.Errorf("invalid request method %q", entry.Request.Method)
	}
	if entry.Response.Status < 0 || entry.Response.Status > 999 {
		return parsedHARExchange{}, fmt.Errorf("invalid response status %d", entry.Response.Status)
	}

	reqHeaderText, reqCT, hasReqCookie, err := formatHARHeaders(entry.Request.Headers, "Cookie")
	if err != nil {
		return parsedHARExchange{}, fmt.Errorf("invalid request headers: %w", err)
	}
	if !hasReqCookie && len(entry.Request.Cookies) > 0 {
		cookieHeader, err := formatHARRequestCookies(entry.Request.Cookies)
		if err != nil {
			return parsedHARExchange{}, fmt.Errorf("invalid request cookies: %w", err)
		}
		reqHeaderText += cookieHeader
	}

	respHeaderText, respHeaderCT, hasRespSetCookie, err := formatHARHeaders(entry.Response.Headers, "Set-Cookie")
	if err != nil {
		return parsedHARExchange{}, fmt.Errorf("invalid response headers: %w", err)
	}
	if !hasRespSetCookie && len(entry.Response.Cookies) > 0 {
		setCookies, err := formatHARResponseCookies(entry.Response.Cookies)
		if err != nil {
			return parsedHARExchange{}, fmt.Errorf("invalid response cookies: %w", err)
		}
		respHeaderText += setCookies
	}

	var reqBody []byte
	if entry.Request.PostData != nil {
		if entry.Request.PostData.Text != "" || len(entry.Request.PostData.Params) == 0 {
			reqBody, err = decodeHARBody(entry.Request.PostData.Text, entry.Request.PostData.Encoding)
			if err != nil {
				return parsedHARExchange{}, fmt.Errorf("invalid request postData: %w", err)
			}
			if reqCT == "" {
				reqCT = strings.TrimSpace(entry.Request.PostData.MimeType)
			}
		} else {
			reqBody = encodeHARFormParams(entry.Request.PostData.Params)
			if reqCT == "" {
				reqCT = strings.TrimSpace(entry.Request.PostData.MimeType)
				if reqCT == "" {
					reqCT = "application/x-www-form-urlencoded"
				}
			}
		}
	}
	respBody, err := decodeHARBody(entry.Response.Content.Text, entry.Response.Content.Encoding)
	if err != nil {
		return parsedHARExchange{}, fmt.Errorf("invalid response content: %w", err)
	}

	respCT := strings.TrimSpace(entry.Response.Content.MimeType)
	if respCT == "" {
		respCT = respHeaderCT
	}

	reqProto := sanitizeHARProto(entry.Request.HTTPVersion)
	respProto := sanitizeHARProto(entry.Response.HTTPVersion)
	reqHead := fmt.Sprintf("%s %s %s\n%s", method, u.RequestURI(), reqProto, reqHeaderText)

	statusText := strings.TrimSpace(entry.Response.StatusText)
	if strings.ContainsAny(statusText, "\r\n\x00") {
		return parsedHARExchange{}, errors.New("response statusText contains control characters")
	}
	respHead := fmt.Sprintf("%s %d\n%s", respProto, entry.Response.Status, respHeaderText)
	if statusText != "" {
		respHead = fmt.Sprintf("%s %d %s\n%s", respProto, entry.Response.Status, statusText, respHeaderText)
	}

	canonicalURL := u.String()
	id := harExchangeID(ts, method, canonicalURL, entry.Response.Status, reqBody, respBody)
	if preserved := strings.TrimSpace(entry.ArtexExchangeID); validArtexExchangeID(preserved) {
		id = preserved
	}
	return parsedHARExchange{
		id:          id,
		ts:          ts,
		host:        u.Hostname(),
		method:      method,
		urlTemplate: db.TemplatePath(u.EscapedPath()),
		rawURL:      canonicalURL,
		status:      entry.Response.Status,
		reqCT:       reqCT,
		respCT:      respCT,
		reqHead:     reqHead,
		reqBody:     reqBody,
		respHead:    respHead,
		respBody:    respBody,
	}, nil
}

// harExchangeID derives a deterministic ID from the exchange's timestamp (Unix
// seconds), method, canonical URL, status code, and SHA-256 digests of both
// bodies. Using Unix seconds matches exchanges.ts so export -> re-import
// produces the exact same ID for external HARs.
func harExchangeID(ts int64, method, rawURL string, status int, reqBody, respBody []byte) string {
	reqSum := sha256.Sum256(reqBody)
	respSum := sha256.Sum256(respBody)
	h := sha256.New()
	fmt.Fprintf(h, "%d\x00%s\x00%s\x00%d\x00%x\x00%x", ts, method, rawURL, status, reqSum, respSum)
	return "har-" + hex.EncodeToString(h.Sum(nil))
}

func validArtexExchangeID(id string) bool {
	if id == "" || len(id) > maxArtexIDLen {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == ':' {
			continue
		}
		return false
	}
	return true
}

// redactURLUserinfo strips user:pass@ from both parseable and malformed URLs so
// credentials never leak into stored URLs or import error details.
func redactURLUserinfo(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if u, err := url.Parse(s); err == nil && u.User != nil {
		u.User = nil
		return u.String()
	}
	schemeEnd := strings.Index(s, "://")
	if schemeEnd < 0 {
		return s
	}
	rest := s[schemeEnd+3:]
	authEnd := strings.IndexAny(rest, "/?#")
	auth := rest
	tail := ""
	if authEnd >= 0 {
		auth = rest[:authEnd]
		tail = rest[authEnd:]
	}
	if at := strings.LastIndexByte(auth, '@'); at >= 0 {
		return s[:schemeEnd+3] + auth[at+1:] + tail
	}
	return s
}

func formatHARHeaders(headers []HARHeader, checkHeader string) (formatted string, contentType string, hasChecked bool, err error) {
	var b strings.Builder
	for _, h := range headers {
		name := strings.TrimSpace(h.Name)
		if name == "" {
			return "", "", false, errors.New("empty header name")
		}
		// Skip HTTP/2 pseudo-headers (:method, :authority, :scheme, :path, :status)
		// emitted by browser DevTools HAR exports; their semantics live in the
		// request/status line.
		if strings.HasPrefix(name, ":") {
			continue
		}
		if !validHeaderName(name) {
			return "", "", false, fmt.Errorf("invalid header name %q", h.Name)
		}
		if strings.ContainsAny(h.Value, "\r\n\x00") {
			return "", "", false, fmt.Errorf("header %s contains a line break or NUL byte", name)
		}
		if contentType == "" && strings.EqualFold(name, "Content-Type") {
			contentType = strings.TrimSpace(h.Value)
		}
		if checkHeader != "" && strings.EqualFold(name, checkHeader) {
			hasChecked = true
		}
		b.WriteString(name)
		b.WriteString(": ")
		b.WriteString(h.Value)
		b.WriteByte('\n')
	}
	return b.String(), contentType, hasChecked, nil
}

func formatHARRequestCookies(cookies []HARCookie) (string, error) {
	parts := make([]string, 0, len(cookies))
	for _, c := range cookies {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			return "", errors.New("empty cookie name")
		}
		if strings.ContainsAny(name, " \t;=\r\n\x00") || strings.ContainsAny(c.Value, "\r\n\x00") {
			return "", fmt.Errorf("invalid cookie %q", name)
		}
		parts = append(parts, name+"="+c.Value)
	}
	if len(parts) == 0 {
		return "", nil
	}
	return "Cookie: " + strings.Join(parts, "; ") + "\n", nil
}

func formatHARResponseCookies(cookies []HARCookie) (string, error) {
	var b strings.Builder
	for _, c := range cookies {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			return "", errors.New("empty cookie name")
		}
		if strings.ContainsAny(name, " \t;=\r\n\x00") ||
			strings.ContainsAny(c.Value, "\r\n\x00") ||
			strings.ContainsAny(c.Path, ";\r\n\x00") ||
			strings.ContainsAny(c.Domain, ";\r\n\x00") ||
			strings.ContainsAny(c.Expires, ";\r\n\x00") {
			return "", fmt.Errorf("invalid response cookie %q", name)
		}
		b.WriteString("Set-Cookie: ")
		b.WriteString(name)
		b.WriteByte('=')
		b.WriteString(c.Value)
		if c.Path != "" {
			b.WriteString("; Path=")
			b.WriteString(c.Path)
		}
		if c.Domain != "" {
			b.WriteString("; Domain=")
			b.WriteString(c.Domain)
		}
		if c.Expires != "" {
			b.WriteString("; Expires=")
			b.WriteString(c.Expires)
		}
		if c.Secure {
			b.WriteString("; Secure")
		}
		if c.HTTPOnly {
			b.WriteString("; HttpOnly")
		}
		b.WriteByte('\n')
	}
	return b.String(), nil
}

func encodeHARFormParams(params []HARParam) []byte {
	parts := make([]string, 0, len(params))
	for _, p := range params {
		parts = append(parts, url.QueryEscape(p.Name)+"="+url.QueryEscape(p.Value))
	}
	return []byte(strings.Join(parts, "&"))
}

func decodeHARBody(text, encoding string) ([]byte, error) {
	enc := strings.ToLower(strings.TrimSpace(encoding))
	switch enc {
	case "":
		if text == "" {
			return nil, nil
		}
		return []byte(text), nil
	case "base64":
		if text == "" {
			return nil, nil
		}
		decoded, err := base64.StdEncoding.DecodeString(text)
		if err != nil {
			return nil, fmt.Errorf("invalid base64 body: %w", err)
		}
		return decoded, nil
	default:
		return nil, fmt.Errorf("unsupported body encoding %q", encoding)
	}
}

func sanitizeHARProto(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || strings.ContainsAny(v, " \t\r\n\x00") || !strings.HasPrefix(strings.ToUpper(v), "HTTP/") {
		return "HTTP/1.1"
	}
	return v
}

// insertHARExchange inserts one HAR exchange idempotently (INSERT OR IGNORE)
// through the same spill/blob_refs/FTS path as the recorder and ImportArchive.
// It never writes to exchange_rewrites.
func (t *Traffic) insertHARExchange(ex parsedHARExchange) (bool, error) {
	t.wmu.Lock()
	defer t.wmu.Unlock()

	var exists int
	if err := t.db.QueryRow(`SELECT 1 FROM exchanges WHERE id=?`, ex.id).Scan(&exists); err == nil {
		return false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}

	reqB := t.spill(ex.reqBody, ex.reqCT)
	respB := t.spill(ex.respBody, ex.respCT)

	tx, err := t.db.Begin()
	if err != nil {
		return false, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	res, err := tx.Exec(`INSERT OR IGNORE INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,'')`,
		ex.id, ex.ts, ex.host, ex.method, ex.urlTemplate, ex.rawURL, ex.status, ex.respCT, len(ex.reqBody), len(ex.respBody))
	if err != nil {
		return false, fmt.Errorf("writing index: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return false, nil
	}
	var rowid int64
	if err := tx.QueryRow(`SELECT rowid FROM exchanges WHERE id=?`, ex.id).Scan(&rowid); err != nil {
		return false, fmt.Errorf("fetching rowid: %w", err)
	}
	if _, err := tx.Exec(`INSERT INTO exchange_bodies(id,req_head,req_body,req_blob,resp_head,resp_body,resp_blob)
VALUES(?,?,?,?,?,?,?)`,
		ex.id, ex.reqHead, reqB.inline, nullIfEmpty(reqB.hash), ex.respHead, respB.inline, nullIfEmpty(respB.hash)); err != nil {
		return false, fmt.Errorf("writing body: %w", err)
	}
	for _, h := range []string{reqB.hash, respB.hash} {
		if h == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash,exchange_id) VALUES(?,?)`, h, ex.id); err != nil {
			return false, fmt.Errorf("registering blob reference: %w", err)
		}
	}
	if t.fts {
		idx := strings.Join([]string{ex.rawURL, ex.reqHead, reqB.index, ex.respHead, respB.index}, "\n")
		if _, err := tx.Exec(`INSERT INTO ex_fts(rowid,content) VALUES(?,?)`, rowid, idx); err != nil {
			return false, fmt.Errorf("writing full-text index: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("committing: %w", err)
	}
	return true, nil
}

// ExportHAR exports exchanges matching f as a valid HAR 1.2 document in stable
// chronological order (ts ASC, id ASC), capped by opts.MaxEntries,
// opts.MaxTotalBytes (raw headers + bodies), and opts.MaxJSONBytes (marshaled
// JSON size). Truncation is reported in both HARExportMeta and the HAR 1.2
// custom fields _truncated / _truncatedReason / _totalMatched.
func (t *Traffic) ExportHAR(f PageQuery, opts HARExportOptions) (HAR, HARExportMeta, error) {
	if t == nil {
		return HAR{}, HARExportMeta{}, errors.New("traffic store is not available")
	}
	if opts.MaxEntries <= 0 {
		opts.MaxEntries = DefaultHARMaxExportEntries
	}
	if opts.MaxTotalBytes <= 0 {
		opts.MaxTotalBytes = DefaultHARMaxExportBytes
	}
	if opts.MaxJSONBytes <= 0 {
		opts.MaxJSONBytes = DefaultHARMaxExportJSONBytes
	}
	creatorVer := strings.TrimSpace(opts.CreatorVersion)
	if creatorVer == "" {
		creatorVer = "dev"
	}

	where, args := t.pageWhere(f)
	var totalMatched int
	if err := t.db.QueryRow(`SELECT COUNT(*) FROM exchanges`+where, args...).Scan(&totalMatched); err != nil {
		return HAR{}, HARExportMeta{}, err
	}

	type exRow struct {
		id          string
		ts          int64
		host        string
		method      string
		rawURL      string
		status      int
		contentType string
		legacyPath  string
	}

	// Fetch at most MaxEntries+1 rows so we know whether the entry cap fired.
	sel := `SELECT id,ts,host,method,url,status,content_type,path FROM exchanges` +
		where + ` ORDER BY ts ASC, id ASC LIMIT ?`
	qargs := append(append([]any{}, args...), opts.MaxEntries+1)
	rows, err := t.db.Query(sel, qargs...)
	if err != nil {
		return HAR{}, HARExportMeta{}, err
	}
	var matched []exRow
	for rows.Next() {
		var r exRow
		if err := rows.Scan(&r.id, &r.ts, &r.host, &r.method, &r.rawURL, &r.status, &r.contentType, &r.legacyPath); err != nil {
			rows.Close()
			return HAR{}, HARExportMeta{}, err
		}
		matched = append(matched, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return HAR{}, HARExportMeta{}, err
	}
	rows.Close()

	meta := HARExportMeta{TotalMatched: totalMatched}
	hitEntryCap := len(matched) > opts.MaxEntries
	if hitEntryCap {
		matched = matched[:opts.MaxEntries]
	}

	// Reserve envelope overhead (~512 bytes) for the outer log object + metadata.
	const harEnvelopeMargin int64 = 512
	var encodedJSONBytes int64 = harEnvelopeMargin

	entries := make([]HAREntry, 0, len(matched))
	for _, r := range matched {
		reqHead, reqBytes, respHead, respBytes, err := t.loadFullExchange(r.id, r.legacyPath)
		if err != nil {
			return HAR{}, HARExportMeta{}, err
		}
		entryRawBytes := int64(len(reqHead) + len(reqBytes) + len(respHead) + len(respBytes))
		if meta.TotalBytes+entryRawBytes > opts.MaxTotalBytes {
			meta.Truncated = true
			meta.TruncatedReason = "max_bytes"
			break
		}

		reqProto, reqHeaders := parseStoredRequestHead(reqHead)
		respProto, respStatusText, respHeaders := parseStoredResponseHead(respHead)

		harReq := HARRequest{
			Method:      r.method,
			URL:         redactURLUserinfo(r.rawURL),
			HTTPVersion: reqProto,
			Cookies:     []HARCookie{},
			Headers:     reqHeaders,
			QueryString: []HARParam{},
			HeadersSize: -1,
			BodySize:    len(reqBytes),
		}
		if len(reqBytes) > 0 {
			text, enc := encodeHARBody(reqBytes)
			harReq.PostData = &HARPostData{
				MimeType: findHeaderValue(reqHeaders, "Content-Type"),
				Text:     text,
				Encoding: enc,
			}
		}

		harContent := HARContent{
			Size:     len(respBytes),
			MimeType: r.contentType,
		}
		if len(respBytes) > 0 {
			harContent.Text, harContent.Encoding = encodeHARBody(respBytes)
		}

		harResp := HARResponse{
			Status:      r.status,
			StatusText:  respStatusText,
			HTTPVersion: respProto,
			Cookies:     []HARCookie{},
			Headers:     respHeaders,
			Content:     harContent,
			RedirectURL: "",
			HeadersSize: -1,
			BodySize:    len(respBytes),
		}

		entry := HAREntry{
			StartedDateTime: time.Unix(r.ts, 0).UTC().Format(time.RFC3339),
			Time:            0,
			Request:         harReq,
			Response:        harResp,
			Cache:           HARCache{},
			Timings:         HARTimings{Send: -1, Wait: -1, Receive: -1},
			ArtexExchangeID: r.id,
		}

		entryJSON, err := json.Marshal(entry)
		if err != nil {
			return HAR{}, HARExportMeta{}, err
		}
		// +1 for the separating comma inside the JSON array.
		if encodedJSONBytes+int64(len(entryJSON))+1 > opts.MaxJSONBytes {
			meta.Truncated = true
			meta.TruncatedReason = "max_bytes"
			break
		}
		encodedJSONBytes += int64(len(entryJSON)) + 1
		meta.TotalBytes += entryRawBytes
		entries = append(entries, entry)
	}

	if !meta.Truncated && hitEntryCap {
		meta.Truncated = true
		meta.TruncatedReason = "max_entries"
	}
	meta.Exported = len(entries)

	doc := HAR{
		Log: &HARLog{
			Version:         HARVersion,
			Creator:         HARCreator{Name: "ARTEX", Version: creatorVer},
			Entries:         entries,
			Truncated:       meta.Truncated,
			TruncatedReason: meta.TruncatedReason,
		},
	}
	if meta.Truncated {
		doc.Log.TotalMatched = meta.TotalMatched
	}
	return doc, meta, nil
}

func (t *Traffic) loadFullExchange(id, legacyPath string) (reqHead string, reqBody []byte, respHead string, respBody []byte, err error) {
	var reqBlob, respBlob sql.NullString
	err = t.db.QueryRow(`SELECT req_head,req_body,req_blob,resp_head,resp_body,resp_blob
FROM exchange_bodies WHERE id=?`, id).Scan(&reqHead, &reqBody, &reqBlob, &respHead, &respBody, &respBlob)
	if errors.Is(err, sql.ErrNoRows) && strings.TrimSpace(legacyPath) != "" {
		rb, readErr := os.ReadFile(filepath.Join(t.dir, legacyPath, "request.http"))
		if readErr != nil && !os.IsNotExist(readErr) {
			return "", nil, "", nil, readErr
		}
		pb, readErr := os.ReadFile(filepath.Join(t.dir, legacyPath, "response.http"))
		if readErr != nil && !os.IsNotExist(readErr) {
			return "", nil, "", nil, readErr
		}
		reqHead, reqBody = splitLegacyHTTP(rb)
		respHead, respBody = splitLegacyHTTP(pb)
		return reqHead, reqBody, respHead, respBody, nil
	}
	if err != nil {
		return "", nil, "", nil, err
	}
	if reqBlob.Valid && reqBlob.String != "" {
		p, err := t.blobPath(reqBlob.String)
		if err != nil {
			return "", nil, "", nil, err
		}
		reqBody, err = os.ReadFile(p)
		if err != nil {
			return "", nil, "", nil, err
		}
	}
	if respBlob.Valid && respBlob.String != "" {
		p, err := t.blobPath(respBlob.String)
		if err != nil {
			return "", nil, "", nil, err
		}
		respBody, err = os.ReadFile(p)
		if err != nil {
			return "", nil, "", nil, err
		}
	}
	return reqHead, reqBody, respHead, respBody, nil
}

func splitLegacyHTTP(raw []byte) (string, []byte) {
	if idx := bytes.Index(raw, []byte("\r\n\r\n")); idx >= 0 {
		return string(raw[:idx]), raw[idx+4:]
	}
	if idx := bytes.Index(raw, []byte("\n\n")); idx >= 0 {
		return string(raw[:idx]), raw[idx+2:]
	}
	return string(raw), nil
}

// encodeHARBody returns plain text for valid NUL-free UTF-8 bodies, and base64
// otherwise so binary payloads survive export and re-import bit-for-bit.
func encodeHARBody(body []byte) (text, encoding string) {
	if utf8.Valid(body) && bytes.IndexByte(body, 0) < 0 {
		return string(body), ""
	}
	return base64.StdEncoding.EncodeToString(body), "base64"
}

func parseStoredRequestHead(raw string) (httpVersion string, headers []HARHeader) {
	headers = []HARHeader{}
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	if len(lines) == 0 {
		return "", headers
	}
	first := strings.TrimSpace(lines[0])
	if parts := strings.SplitN(first, " ", 3); len(parts) == 3 && strings.HasPrefix(strings.ToUpper(parts[2]), "HTTP/") {
		httpVersion = strings.TrimSpace(parts[2])
	}
	headers = appendParsedHeaders(headers, lines[1:])
	return httpVersion, headers
}

func parseStoredResponseHead(raw string) (httpVersion, statusText string, headers []HARHeader) {
	headers = []HARHeader{}
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	if len(lines) == 0 {
		return "", "", headers
	}
	first := strings.TrimSpace(lines[0])
	if parts := strings.SplitN(first, " ", 3); len(parts) >= 2 && strings.HasPrefix(strings.ToUpper(parts[0]), "HTTP") {
		if strings.HasPrefix(strings.ToUpper(parts[0]), "HTTP/") {
			httpVersion = strings.TrimSpace(parts[0])
		}
		if len(parts) == 3 {
			statusText = strings.TrimSpace(parts[2])
		}
	}
	headers = appendParsedHeaders(headers, lines[1:])
	return httpVersion, statusText, headers
}

func appendParsedHeaders(dst []HARHeader, lines []string) []HARHeader {
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		colon := strings.IndexByte(line, ':')
		if colon <= 0 {
			continue
		}
		name := strings.TrimSpace(line[:colon])
		if name == "" || !validHeaderName(name) {
			continue
		}
		val := strings.TrimSpace(line[colon+1:])
		dst = append(dst, HARHeader{Name: name, Value: val})
	}
	return dst
}

func findHeaderValue(headers []HARHeader, name string) string {
	for _, h := range headers {
		if strings.EqualFold(h.Name, name) {
			return h.Value
		}
	}
	return ""
}
