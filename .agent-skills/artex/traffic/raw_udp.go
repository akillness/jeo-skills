package traffic

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// RawUDPDatagram is one recorded UDP datagram relayed by opt-in SOCKS5 UDP
// ASSOCIATE (P4.1c). It never creates an HTTP exchanges row.
type RawUDPDatagram struct {
	ID            string `json:"id"`
	AssociationID string `json:"association_id"`
	Protocol      string `json:"protocol"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	Direction     string `json:"direction"` // "c2s" | "s2c"
	Timestamp     int64  `json:"ts"`        // unix milliseconds
	Size          int64  `json:"size"`
	Preview       []byte `json:"preview,omitempty"`
	Blob          string `json:"blob,omitempty"`
}

// RawUDPFilter narrows ListRawUDPDatagrams queries.
type RawUDPFilter struct {
	AssociationID string
	Host          string
	Port          int
	Direction     string
	Limit         int
	Offset        int
}

func (t *Traffic) newRawUDPDatagramID(ts time.Time) string {
	n := t.seq.Add(1)
	return fmt.Sprintf("udp-%d-%04d", ts.UnixMilli(), n%10000)
}

// RecordRawUDPDatagram persists one forwarded UDP datagram into
// raw_udp_datagrams and registers any spilled payload blob in blob_refs.
// Payloads above previewBytes are spilled atomically via spillRawDir.
// It never writes to the HTTP exchanges table.
func (t *Traffic) RecordRawUDPDatagram(rec RawUDPCapture, previewBytes int) (string, error) {
	if t == nil || t.db == nil {
		return "", fmt.Errorf("traffic store unavailable")
	}
	dir := strings.ToLower(strings.TrimSpace(rec.Direction))
	if dir != "c2s" && dir != "s2c" {
		return "", fmt.Errorf("invalid raw udp direction %q", rec.Direction)
	}
	ts := rec.Timestamp.UTC()
	if ts.IsZero() {
		ts = time.Now().UTC()
	}

	preview, blobHash := t.spillRawDir(rec.Payload, previewBytes)

	t.wmu.Lock()
	defer t.wmu.Unlock()

	id := t.newRawUDPDatagramID(ts)

	tx, err := t.db.Begin()
	if err != nil {
		return "", fmt.Errorf("begin raw udp tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(`
INSERT INTO raw_udp_datagrams(
  id, association_id, protocol, host, port, direction, ts, size, preview, blob
) VALUES(?, ?, 'udp', ?, ?, ?, ?, ?, ?, ?)`,
		id, strings.TrimSpace(rec.AssociationID),
		strings.ToLower(strings.TrimSpace(rec.Host)), rec.Port,
		dir, ts.UnixMilli(), int64(len(rec.Payload)),
		preview, nullIfEmpty(blobHash),
	); err != nil {
		return "", fmt.Errorf("insert raw_udp_datagrams: %w", err)
	}

	if blobHash != "" {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash, exchange_id) VALUES(?, ?)`, blobHash, id); err != nil {
			return "", fmt.Errorf("register raw udp blob ref: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit raw udp tx: %w", err)
	}
	return id, nil
}

// GetRawUDPDatagram fetches one recorded UDP datagram by ID. Returns nil, nil
// when not found.
func (t *Traffic) GetRawUDPDatagram(id string) (*RawUDPDatagram, error) {
	if t == nil || t.db == nil {
		return nil, fmt.Errorf("traffic store unavailable")
	}
	var d RawUDPDatagram
	var blob sql.NullString
	err := t.db.QueryRow(`
SELECT id, association_id, protocol, host, port, direction, ts, size, preview, blob
FROM raw_udp_datagrams WHERE id = ?`, id).Scan(
		&d.ID, &d.AssociationID, &d.Protocol, &d.Host, &d.Port,
		&d.Direction, &d.Timestamp, &d.Size, &d.Preview, &blob,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	d.Blob = blob.String
	return &d, nil
}

// ListRawUDPDatagrams returns recorded UDP datagrams newest-first along with
// the total count matching the filter.
func (t *Traffic) ListRawUDPDatagrams(f RawUDPFilter) ([]RawUDPDatagram, int, error) {
	if t == nil || t.db == nil {
		return nil, 0, fmt.Errorf("traffic store unavailable")
	}
	var conds []string
	var args []any
	if a := strings.TrimSpace(f.AssociationID); a != "" {
		conds = append(conds, "association_id = ?")
		args = append(args, a)
	}
	if h := strings.ToLower(strings.TrimSpace(f.Host)); h != "" {
		conds = append(conds, "host = ?")
		args = append(args, h)
	}
	if f.Port > 0 {
		conds = append(conds, "port = ?")
		args = append(args, f.Port)
	}
	if dir := strings.ToLower(strings.TrimSpace(f.Direction)); dir != "" {
		conds = append(conds, "direction = ?")
		args = append(args, dir)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := t.db.QueryRow(`SELECT COUNT(*) FROM raw_udp_datagrams`+where, args...).Scan(&total); err != nil {
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
SELECT id, association_id, protocol, host, port, direction, ts, size, preview, blob
FROM raw_udp_datagrams`+where+`
ORDER BY ts DESC, id DESC
LIMIT ? OFFSET ?`, qArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []RawUDPDatagram{}
	for rows.Next() {
		var d RawUDPDatagram
		var blob sql.NullString
		if err := rows.Scan(
			&d.ID, &d.AssociationID, &d.Protocol, &d.Host, &d.Port,
			&d.Direction, &d.Timestamp, &d.Size, &d.Preview, &blob,
		); err != nil {
			return nil, 0, err
		}
		d.Blob = blob.String
		out = append(out, d)
	}
	return out, total, rows.Err()
}

// CountRawUDPDatagrams returns the number of recorded raw UDP datagrams
// optionally filtered by association_id and/or exact host.
func (t *Traffic) CountRawUDPDatagrams(assocID, host string) (int, error) {
	if t == nil || t.db == nil {
		return 0, fmt.Errorf("traffic store unavailable")
	}
	var conds []string
	var args []any
	if a := strings.TrimSpace(assocID); a != "" {
		conds = append(conds, "association_id = ?")
		args = append(args, a)
	}
	if h := strings.ToLower(strings.TrimSpace(host)); h != "" {
		conds = append(conds, "host = ?")
		args = append(args, h)
	}
	q := `SELECT COUNT(*) FROM raw_udp_datagrams`
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	var n int
	err := t.db.QueryRow(q, args...).Scan(&n)
	return n, err
}
