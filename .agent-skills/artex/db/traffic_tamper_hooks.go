package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

// Limits on capture-proxy tampering hooks (P4.2).
const (
	MaxTrafficTamperHooks        = 50
	MaxEnabledTrafficTamperHooks = 20
	MaxTamperHookVersions        = 20
)

var (
	ErrTrafficTamperHookLimit        = errors.New("the limit of 50 tampering hooks is reached")
	ErrTrafficTamperHookEnabledLimit = errors.New("the limit of 20 enabled tampering hooks is reached")
)

// TrafficTamperHook is one row of traffic_tamper_hooks. Source and Matchers
// are sealed at rest with db/secrets.go and decrypted here.
type TrafficTamperHook struct {
	ID           int64
	Name         string
	Enabled      bool
	Phase        string // request | response
	Priority     int
	Matchers     json.RawMessage
	Source       string
	SourceSHA256 string
	Version      int
	Note         string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TrafficTamperHookVersion is one immutable historical revision in
// traffic_tamper_hook_versions. Source and Matchers are sealed at rest.
type TrafficTamperHookVersion struct {
	ID           int64
	HookID       int64
	Version      int
	Name         string
	Phase        string
	Priority     int
	Matchers     json.RawMessage
	Source       string
	SourceSHA256 string
	Note         string
	CreatedAt    time.Time
}

const (
	tamperHookCols    = `id, name, enabled, phase, priority, matchers::text, source, source_sha256, version, note, created_at, updated_at`
	tamperHookVerCols = `id, hook_id, version, name, phase, priority, matchers::text, source, source_sha256, note, created_at`
)

func hookSourceSHA256(src string) string {
	sum := sha256.Sum256([]byte(src))
	return hex.EncodeToString(sum[:])
}

func normalizeMatchersJSON(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "{}"
	}
	return string(raw)
}

func scanTamperHook(row interface{ Scan(...any) error }) (TrafficTamperHook, error) {
	var h TrafficTamperHook
	var matchers, source string
	err := row.Scan(&h.ID, &h.Name, &h.Enabled, &h.Phase, &h.Priority, &matchers, &source, &h.SourceSHA256, &h.Version, &h.Note, &h.CreatedAt, &h.UpdatedAt)
	if err == nil {
		matchers, err = openSecret(colHookMatchers, matchers)
	}
	if err == nil {
		source, err = openSecret(colHookSource, source)
	}
	h.Matchers, h.Source = json.RawMessage(matchers), source
	return h, err
}

func scanTamperHookVersion(row interface{ Scan(...any) error }) (TrafficTamperHookVersion, error) {
	var v TrafficTamperHookVersion
	var matchers, source string
	err := row.Scan(&v.ID, &v.HookID, &v.Version, &v.Name, &v.Phase, &v.Priority, &matchers, &source, &v.SourceSHA256, &v.Note, &v.CreatedAt)
	if err == nil {
		matchers, err = openSecret(colHookVerMatchers, matchers)
	}
	if err == nil {
		source, err = openSecret(colHookVerSource, source)
	}
	v.Matchers, v.Source = json.RawMessage(matchers), source
	return v, err
}

func sealTamperHook(h TrafficTamperHook) (matchers, source string, err error) {
	if matchers, err = sealSecret(colHookMatchers, normalizeMatchersJSON(h.Matchers)); err != nil {
		return "", "", err
	}
	source, err = sealSecret(colHookSource, h.Source)
	return matchers, source, err
}

func sealTamperHookVersion(h TrafficTamperHook) (matchers, source string, err error) {
	if matchers, err = sealSecret(colHookVerMatchers, normalizeMatchersJSON(h.Matchers)); err != nil {
		return "", "", err
	}
	source, err = sealSecret(colHookVerSource, h.Source)
	return matchers, source, err
}

func (d *DB) tamperHookTx(fn func(tx *sql.Tx) error) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.Exec(`LOCK TABLE traffic_tamper_hooks IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func tamperHookEnabledRoom(tx *sql.Tx, id int64) error {
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM traffic_tamper_hooks WHERE enabled AND id<>$1`, id).Scan(&n); err != nil {
		return err
	}
	if n >= MaxEnabledTrafficTamperHooks {
		return ErrTrafficTamperHookEnabledLimit
	}
	return nil
}

func recordTamperHookVersionTx(tx *sql.Tx, h TrafficTamperHook) error {
	matchers, source, err := sealTamperHookVersion(h)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`
INSERT INTO traffic_tamper_hook_versions(hook_id, version, name, phase, priority, matchers, source, source_sha256, note)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
		h.ID, h.Version, h.Name, h.Phase, h.Priority, matchers, source, h.SourceSHA256, h.Note); err != nil {
		return err
	}
	// Retain at most MaxTamperHookVersions newest revisions per hook.
	_, err = tx.Exec(`
DELETE FROM traffic_tamper_hook_versions
 WHERE hook_id=$1 AND id NOT IN (
   SELECT id FROM traffic_tamper_hook_versions WHERE hook_id=$1 ORDER BY version DESC LIMIT $2
 )`, h.ID, MaxTamperHookVersions)
	return err
}

// ListTrafficTamperHooks returns all hooks in execution order (priority ASC, id ASC).
func (d *DB) ListTrafficTamperHooks() ([]TrafficTamperHook, error) {
	rows, err := d.Query(`SELECT ` + tamperHookCols + ` FROM traffic_tamper_hooks ORDER BY priority, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrafficTamperHook
	for rows.Next() {
		h, err := scanTamperHook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// GetTrafficTamperHook returns one hook, or sql.ErrNoRows when absent.
func (d *DB) GetTrafficTamperHook(id int64) (TrafficTamperHook, error) {
	return scanTamperHook(d.QueryRow(`SELECT `+tamperHookCols+` FROM traffic_tamper_hooks WHERE id=$1`, id))
}

// CreateTrafficTamperHook inserts a new hook (always disabled, version 1) and
// records version 1 in traffic_tamper_hook_versions.
func (d *DB) CreateTrafficTamperHook(h TrafficTamperHook) (out TrafficTamperHook, err error) {
	h.Enabled = false
	h.Version = 1
	h.SourceSHA256 = hookSourceSHA256(h.Source)
	matchers, source, err := sealTamperHook(h)
	if err != nil {
		return out, err
	}
	err = d.tamperHookTx(func(tx *sql.Tx) error {
		var n int
		if err := tx.QueryRow(`SELECT count(*) FROM traffic_tamper_hooks`).Scan(&n); err != nil {
			return err
		}
		if n >= MaxTrafficTamperHooks {
			return ErrTrafficTamperHookLimit
		}
		out, err = scanTamperHook(tx.QueryRow(`
INSERT INTO traffic_tamper_hooks(name, enabled, phase, priority, matchers, source, source_sha256, version, note)
VALUES ($1, false, $2, $3, $4::jsonb, $5, $6, 1, $7)
RETURNING `+tamperHookCols, h.Name, h.Phase, h.Priority, matchers, source, h.SourceSHA256, h.Note))
		if err != nil {
			return err
		}
		return recordTamperHookVersionTx(tx, out)
	})
	return out, err
}

// UpdateTrafficTamperHook updates a hook, increments its version, and appends
// the new revision to traffic_tamper_hook_versions.
func (d *DB) UpdateTrafficTamperHook(id int64, edit func(stored TrafficTamperHook) (TrafficTamperHook, error)) (out TrafficTamperHook, err error) {
	err = d.tamperHookTx(func(tx *sql.Tx) error {
		stored, err := scanTamperHook(tx.QueryRow(`SELECT `+tamperHookCols+` FROM traffic_tamper_hooks WHERE id=$1`, id))
		if err != nil {
			return err
		}
		next, err := edit(stored)
		if err != nil {
			return err
		}
		if next.Enabled && !stored.Enabled {
			if err := tamperHookEnabledRoom(tx, id); err != nil {
				return err
			}
		}
		next.Version = stored.Version + 1
		next.SourceSHA256 = hookSourceSHA256(next.Source)
		matchers, source, err := sealTamperHook(next)
		if err != nil {
			return err
		}
		out, err = scanTamperHook(tx.QueryRow(`
UPDATE traffic_tamper_hooks
   SET name=$2, enabled=$3, phase=$4, priority=$5, matchers=$6::jsonb, source=$7, source_sha256=$8, version=$9, note=$10
 WHERE id=$1
RETURNING `+tamperHookCols, id, next.Name, next.Enabled, next.Phase, next.Priority, matchers, source, next.SourceSHA256, next.Version, next.Note))
		if err != nil {
			return err
		}
		return recordTamperHookVersionTx(tx, out)
	})
	return out, err
}

// ToggleTrafficTamperHook sets the enabled state of a hook without creating a
// new source version.
func (d *DB) ToggleTrafficTamperHook(id int64, enabled bool) error {
	return d.tamperHookTx(func(tx *sql.Tx) error {
		if enabled {
			if err := tamperHookEnabledRoom(tx, id); err != nil {
				return err
			}
		}
		return oneRow(tx.Exec(`UPDATE traffic_tamper_hooks SET enabled=$2 WHERE id=$1`, id, enabled))
	})
}

// DeleteTrafficTamperHook removes a hook and cascades its version history.
func (d *DB) DeleteTrafficTamperHook(id int64) error {
	return oneRow(d.Exec(`DELETE FROM traffic_tamper_hooks WHERE id=$1`, id))
}

// ListTrafficTamperHookVersions returns stored revisions of hookID newest-first.
func (d *DB) ListTrafficTamperHookVersions(hookID int64) ([]TrafficTamperHookVersion, error) {
	rows, err := d.Query(`SELECT `+tamperHookVerCols+` FROM traffic_tamper_hook_versions WHERE hook_id=$1 ORDER BY version DESC`, hookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrafficTamperHookVersion
	for rows.Next() {
		v, err := scanTamperHookVersion(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// RollbackTrafficTamperHook restores hookID to targetVersion's code, matchers,
// phase, priority, name, and note as a new monotonic version (preserving full
// append-only version history and keeping the current enabled flag).
func (d *DB) RollbackTrafficTamperHook(hookID int64, targetVersion int) (out TrafficTamperHook, err error) {
	err = d.tamperHookTx(func(tx *sql.Tx) error {
		stored, err := scanTamperHook(tx.QueryRow(`SELECT `+tamperHookCols+` FROM traffic_tamper_hooks WHERE id=$1`, hookID))
		if err != nil {
			return err
		}
		rev, err := scanTamperHookVersion(tx.QueryRow(`SELECT `+tamperHookVerCols+` FROM traffic_tamper_hook_versions WHERE hook_id=$1 AND version=$2`, hookID, targetVersion))
		if err != nil {
			return err
		}
		next := TrafficTamperHook{
			ID:           hookID,
			Name:         rev.Name,
			Enabled:      stored.Enabled,
			Phase:        rev.Phase,
			Priority:     rev.Priority,
			Matchers:     rev.Matchers,
			Source:       rev.Source,
			SourceSHA256: hookSourceSHA256(rev.Source),
			Version:      stored.Version + 1,
			Note:         rev.Note,
		}
		matchers, source, err := sealTamperHook(next)
		if err != nil {
			return err
		}
		out, err = scanTamperHook(tx.QueryRow(`
UPDATE traffic_tamper_hooks
   SET name=$2, phase=$3, priority=$4, matchers=$5::jsonb, source=$6, source_sha256=$7, version=$8, note=$9
 WHERE id=$1
RETURNING `+tamperHookCols, hookID, next.Name, next.Phase, next.Priority, matchers, source, next.SourceSHA256, next.Version, next.Note))
		if err != nil {
			return err
		}
		return recordTamperHookVersionTx(tx, out)
	})
	return out, err
}
