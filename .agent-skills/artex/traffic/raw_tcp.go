package traffic

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// RawTCPStream is one recorded raw TCP connection relayed by the opt-in SOCKS5
// listener. It never creates an HTTP exchanges row.
type RawTCPStream struct {
	ID         string `json:"id"`
	Protocol   string `json:"protocol"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	StartedAt  int64  `json:"started_at"`  // unix milliseconds
	EndedAt    int64  `json:"ended_at"`    // unix milliseconds
	DurationMs int64  `json:"duration_ms"` // non-negative duration in milliseconds
	C2SBytes   int64  `json:"c2s_bytes"`
	S2CBytes   int64  `json:"s2c_bytes"`
	Truncated  bool   `json:"truncated"`
	C2SPreview []byte `json:"c2s_preview,omitempty"`
	C2SBlob    string `json:"c2s_blob,omitempty"`
	S2CPreview []byte `json:"s2c_preview,omitempty"`
	S2CBlob    string `json:"s2c_blob,omitempty"`
}

// RawTCPFilter narrows ListRawTCPStreams queries.
type RawTCPFilter struct {
	Host   string
	Port   int
	Limit  int
	Offset int
}

func (t *Traffic) newRawTCPStreamID(started time.Time) string {
	n := t.seq.Add(1)
	return fmt.Sprintf("tcp-%d-%04d", started.UnixMilli(), n%10000)
}

// spillRawDir stores one direction's captured bytes: up to previewCap stays
// inline in preview with no blob; beyond previewCap, the full captured bytes
// are written to the content-addressed _blobs store and preview holds the
// leading previewCap bytes.
func (t *Traffic) spillRawDir(data []byte, previewCap int) (preview []byte, blobHash string) {
	if len(data) == 0 {
		return nil, ""
	}
	if previewCap <= 0 {
		previewCap = DefaultSOCKS5PreviewBytes
	}
	if len(data) <= previewCap {
		cp := make([]byte, len(data))
		copy(cp, data)
		return cp, ""
	}
	sum := sha256.Sum256(data)
	h := hex.EncodeToString(sum[:])
	blobDir := filepath.Join(t.dir, "_blobs", "sha256", h[:2])
	if err := os.MkdirAll(blobDir, 0o700); err != nil {
		slog.Error("[traffic/socks5] failed to create blob directory", "err", err)
		return append([]byte(nil), data[:previewCap]...), ""
	}
	blobPath := filepath.Join(blobDir, h+".bin")
	if _, err := os.Stat(blobPath); os.IsNotExist(err) {
		if err := writeBlobAtomic(blobDir, blobPath, h, data); err != nil {
			slog.Error("[traffic/socks5] failed to write blob", "hash", h, "err", err)
			return append([]byte(nil), data[:previewCap]...), ""
		}
	}
	return append([]byte(nil), data[:previewCap]...), h
}

// writeBlobAtomic writes data to a temporary file inside blobDir and renames it
// into place at blobPath so a crash mid-write cannot leave a partial file under
// a content-addressed SHA-256 hash.
func writeBlobAtomic(blobDir, blobPath, hash string, data []byte) error {
	tmp, err := os.CreateTemp(blobDir, hash+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, blobPath); err != nil {
		// Another goroutine may have won the race writing the same
		// content-addressed hash (notably on Windows where Rename can fail
		// if the destination already exists).
		if _, statErr := os.Stat(blobPath); statErr == nil {
			return nil
		}
		return err
	}
	cleanup = false
	return nil
}

// RecordRawTCPStream persists one raw TCP connection into raw_tcp_streams and
// registers any spilled directional blobs in blob_refs. It never writes to the
// HTTP exchanges table.
func (t *Traffic) RecordRawTCPStream(rec RawTCPCapture, previewBytes int) (string, error) {
	if t == nil || t.db == nil {
		return "", fmt.Errorf("traffic store unavailable")
	}
	started := rec.StartedAt.UTC()
	if started.IsZero() {
		started = time.Now().UTC()
	}
	ended := rec.EndedAt.UTC()
	if ended.IsZero() || ended.Before(started) {
		ended = started
	}
	durMs := ended.Sub(started).Milliseconds()
	if durMs < 0 {
		durMs = 0
	}

	c2sPrev, c2sBlob := t.spillRawDir(rec.C2SData, previewBytes)
	s2cPrev, s2cBlob := t.spillRawDir(rec.S2CData, previewBytes)

	t.wmu.Lock()
	defer t.wmu.Unlock()

	id := t.newRawTCPStreamID(started)
	trunc := 0
	if rec.Truncated {
		trunc = 1
	}

	tx, err := t.db.Begin()
	if err != nil {
		return "", fmt.Errorf("begin raw tcp tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(`
INSERT INTO raw_tcp_streams(
  id, protocol, host, port, started_at, ended_at, duration_ms,
  c2s_bytes, s2c_bytes, truncated, c2s_preview, c2s_blob, s2c_preview, s2c_blob
) VALUES(?, 'tcp', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, strings.ToLower(strings.TrimSpace(rec.Host)), rec.Port,
		started.UnixMilli(), ended.UnixMilli(), durMs,
		rec.C2SBytes, rec.S2CBytes, trunc,
		c2sPrev, nullIfEmpty(c2sBlob), s2cPrev, nullIfEmpty(s2cBlob),
	); err != nil {
		return "", fmt.Errorf("insert raw_tcp_streams: %w", err)
	}

	for _, h := range []string{c2sBlob, s2cBlob} {
		if h == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash, exchange_id) VALUES(?, ?)`, h, id); err != nil {
			return "", fmt.Errorf("register raw tcp blob ref: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit raw tcp tx: %w", err)
	}
	return id, nil
}

// GetRawTCPStream fetches a single recorded raw TCP stream by ID. Returns nil, nil
// when not found.
func (t *Traffic) GetRawTCPStream(id string) (*RawTCPStream, error) {
	if t == nil || t.db == nil {
		return nil, fmt.Errorf("traffic store unavailable")
	}
	var s RawTCPStream
	var trunc int
	var c2sBlob, s2cBlob sql.NullString
	err := t.db.QueryRow(`
SELECT id, protocol, host, port, started_at, ended_at, duration_ms,
       c2s_bytes, s2c_bytes, truncated, c2s_preview, c2s_blob, s2c_preview, s2c_blob
FROM raw_tcp_streams WHERE id = ?`, id).Scan(
		&s.ID, &s.Protocol, &s.Host, &s.Port, &s.StartedAt, &s.EndedAt, &s.DurationMs,
		&s.C2SBytes, &s.S2CBytes, &trunc, &s.C2SPreview, &c2sBlob, &s.S2CPreview, &s2cBlob,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.Truncated = trunc != 0
	s.C2SBlob = c2sBlob.String
	s.S2CBlob = s2cBlob.String
	return &s, nil
}

// ListRawTCPStreams returns raw TCP streams newest-first along with the total
// count matching the filter.
func (t *Traffic) ListRawTCPStreams(f RawTCPFilter) ([]RawTCPStream, int, error) {
	if t == nil || t.db == nil {
		return nil, 0, fmt.Errorf("traffic store unavailable")
	}
	var conds []string
	var args []any
	if h := strings.ToLower(strings.TrimSpace(f.Host)); h != "" {
		conds = append(conds, "host = ?")
		args = append(args, h)
	}
	if f.Port > 0 {
		conds = append(conds, "port = ?")
		args = append(args, f.Port)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := t.db.QueryRow(`SELECT COUNT(*) FROM raw_tcp_streams`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	qArgs := append(append([]any{}, args...), limit, offset)
	rows, err := t.db.Query(`
SELECT id, protocol, host, port, started_at, ended_at, duration_ms,
       c2s_bytes, s2c_bytes, truncated, c2s_preview, c2s_blob, s2c_preview, s2c_blob
FROM raw_tcp_streams`+where+`
ORDER BY started_at DESC, id DESC
LIMIT ? OFFSET ?`, qArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []RawTCPStream{}
	for rows.Next() {
		var s RawTCPStream
		var trunc int
		var c2sBlob, s2cBlob sql.NullString
		if err := rows.Scan(
			&s.ID, &s.Protocol, &s.Host, &s.Port, &s.StartedAt, &s.EndedAt, &s.DurationMs,
			&s.C2SBytes, &s.S2CBytes, &trunc, &s.C2SPreview, &c2sBlob, &s.S2CPreview, &s2cBlob,
		); err != nil {
			return nil, 0, err
		}
		s.Truncated = trunc != 0
		s.C2SBlob = c2sBlob.String
		s.S2CBlob = s2cBlob.String
		out = append(out, s)
	}
	return out, total, rows.Err()
}

// CountRawTCPStreams returns the number of recorded raw TCP streams (all hosts
// when host is empty, or filtered to one exact host).
func (t *Traffic) CountRawTCPStreams(host string) (int, error) {
	if t == nil || t.db == nil {
		return 0, fmt.Errorf("traffic store unavailable")
	}
	var n int
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" {
		err := t.db.QueryRow(`SELECT COUNT(*) FROM raw_tcp_streams`).Scan(&n)
		return n, err
	}
	err := t.db.QueryRow(`SELECT COUNT(*) FROM raw_tcp_streams WHERE host = ?`, h).Scan(&n)
	return n, err
}
