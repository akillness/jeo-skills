package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// Limits on the capture proxy's rewrite rules.
const (
	MaxTrafficRewriteRules        = 100
	MaxEnabledTrafficRewriteRules = 50
)

var (
	ErrTrafficRewriteRuleLimit    = errors.New("the limit of 100 rewrite rules is reached")
	ErrTrafficRewriteEnabledLimit = errors.New("the limit of 50 enabled rewrite rules is reached")
)

// TrafficRewriteRule is one row of traffic_rewrite_rules. Matchers and Actions
// are the JSON documents of traffic/rewrite, sealed at rest and in clear here:
// they may hold secrets, so a handler must never return this struct as is.
// This layer stores rules; validation belongs to the caller.
type TrafficRewriteRule struct {
	ID        int64
	Name      string
	Enabled   bool
	Phase     string // request | response
	Priority  int
	Matchers  json.RawMessage
	Actions   json.RawMessage
	Note      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

const trafficRewriteRuleCols = `id, name, enabled, phase, priority, matchers::text, actions::text, note, created_at, updated_at`

func scanTrafficRewriteRule(row interface{ Scan(...any) error }) (TrafficRewriteRule, error) {
	var r TrafficRewriteRule
	var matchers, actions string
	err := row.Scan(&r.ID, &r.Name, &r.Enabled, &r.Phase, &r.Priority, &matchers, &actions, &r.Note, &r.CreatedAt, &r.UpdatedAt)
	if err == nil {
		matchers, err = openSecret(colRewriteMatchers, matchers)
	}
	if err == nil {
		actions, err = openSecret(colRewriteActions, actions)
	}
	r.Matchers, r.Actions = json.RawMessage(matchers), json.RawMessage(actions)
	return r, err
}

func sealTrafficRewriteRule(r TrafficRewriteRule) (matchers, actions string, err error) {
	if matchers, err = sealSecret(colRewriteMatchers, string(r.Matchers)); err != nil {
		return "", "", err
	}
	actions, err = sealSecret(colRewriteActions, string(r.Actions))
	return matchers, actions, err
}

// ListTrafficRewriteRules returns every rule in execution order: priority
// ascending, then id ascending.
func (d *DB) ListTrafficRewriteRules() ([]TrafficRewriteRule, error) {
	rows, err := d.Query(`SELECT ` + trafficRewriteRuleCols + ` FROM traffic_rewrite_rules ORDER BY priority, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrafficRewriteRule
	for rows.Next() {
		r, err := scanTrafficRewriteRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetTrafficRewriteRule returns one rule, sql.ErrNoRows when it does not exist.
func (d *DB) GetTrafficRewriteRule(id int64) (TrafficRewriteRule, error) {
	return scanTrafficRewriteRule(d.QueryRow(`SELECT `+trafficRewriteRuleCols+` FROM traffic_rewrite_rules WHERE id=$1`, id))
}

// trafficRewriteTx runs fn with the table locked against concurrent writers, so
// the limit counts and the row fn reads cannot change before it commits.
func (d *DB) trafficRewriteTx(fn func(tx *sql.Tx) error) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op after Commit
	if _, err := tx.Exec(`LOCK TABLE traffic_rewrite_rules IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// trafficRewriteEnabledRoom fails when enabling rule id (0: a new rule) would
// exceed the limit of enabled rules.
func trafficRewriteEnabledRoom(tx *sql.Tx, id int64) error {
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM traffic_rewrite_rules WHERE enabled AND id<>$1`, id).Scan(&n); err != nil {
		return err
	}
	if n >= MaxEnabledTrafficRewriteRules {
		return ErrTrafficRewriteEnabledLimit
	}
	return nil
}

// CreateTrafficRewriteRule inserts a rule. It fails with
// ErrTrafficRewriteRuleLimit or ErrTrafficRewriteEnabledLimit at a limit.
func (d *DB) CreateTrafficRewriteRule(r TrafficRewriteRule) (out TrafficRewriteRule, err error) {
	matchers, actions, err := sealTrafficRewriteRule(r)
	if err != nil {
		return out, err
	}
	err = d.trafficRewriteTx(func(tx *sql.Tx) error {
		var n int
		if err := tx.QueryRow(`SELECT count(*) FROM traffic_rewrite_rules`).Scan(&n); err != nil {
			return err
		}
		if n >= MaxTrafficRewriteRules {
			return ErrTrafficRewriteRuleLimit
		}
		if r.Enabled {
			if err := trafficRewriteEnabledRoom(tx, 0); err != nil {
				return err
			}
		}
		out, err = scanTrafficRewriteRule(tx.QueryRow(`
INSERT INTO traffic_rewrite_rules(name, enabled, phase, priority, matchers, actions, note)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
RETURNING `+trafficRewriteRuleCols, r.Name, r.Enabled, r.Phase, r.Priority, matchers, actions, r.Note))
		return err
	})
	return out, err
}

// UpdateTrafficRewriteRule replaces the editable fields of rule id with what
// edit returns for the stored rule. edit runs inside the transaction, so it can
// keep a stored value the caller did not send; its error aborts the update and
// is returned as is. sql.ErrNoRows when the rule does not exist.
func (d *DB) UpdateTrafficRewriteRule(id int64, edit func(stored TrafficRewriteRule) (TrafficRewriteRule, error)) (out TrafficRewriteRule, err error) {
	err = d.trafficRewriteTx(func(tx *sql.Tx) error {
		stored, err := scanTrafficRewriteRule(tx.QueryRow(`SELECT `+trafficRewriteRuleCols+` FROM traffic_rewrite_rules WHERE id=$1`, id))
		if err != nil {
			return err
		}
		next, err := edit(stored)
		if err != nil {
			return err
		}
		if next.Enabled && !stored.Enabled {
			if err := trafficRewriteEnabledRoom(tx, id); err != nil {
				return err
			}
		}
		matchers, actions, err := sealTrafficRewriteRule(next)
		if err != nil {
			return err
		}
		out, err = scanTrafficRewriteRule(tx.QueryRow(`
UPDATE traffic_rewrite_rules
   SET name=$2, enabled=$3, phase=$4, priority=$5, matchers=$6::jsonb, actions=$7::jsonb, note=$8
 WHERE id=$1
RETURNING `+trafficRewriteRuleCols, id, next.Name, next.Enabled, next.Phase, next.Priority, matchers, actions, next.Note))
		return err
	})
	return out, err
}

// ToggleTrafficRewriteRule sets the enabled state of a rule. sql.ErrNoRows when
// it does not exist, ErrTrafficRewriteEnabledLimit at the limit.
func (d *DB) ToggleTrafficRewriteRule(id int64, enabled bool) error {
	return d.trafficRewriteTx(func(tx *sql.Tx) error {
		if enabled {
			if err := trafficRewriteEnabledRoom(tx, id); err != nil {
				return err
			}
		}
		return oneRow(tx.Exec(`UPDATE traffic_rewrite_rules SET enabled=$2 WHERE id=$1`, id, enabled))
	})
}

// DeleteTrafficRewriteRule removes a rule, sql.ErrNoRows when it does not exist.
func (d *DB) DeleteTrafficRewriteRule(id int64) error {
	return oneRow(d.Exec(`DELETE FROM traffic_rewrite_rules WHERE id=$1`, id))
}

func oneRow(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
