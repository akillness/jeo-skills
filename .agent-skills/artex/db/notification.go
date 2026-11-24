package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/Autumn-27/artex/notify"
)

// This file is the channel configuration and event layer for IM delivery. Claiming
// delivery jobs and their state transitions live in db/notification_delivery.go.
//
// Two invariants — preserve them when changing this file:
//
//  1. The transaction that writes a finding (RecordFindingTx) only calls
//     InsertNotificationEventTx for one blind insert; it reads no notification
//     tables and runs no filter matching. Any read introduced here could pollute
//     or even abort the finding-write transaction because of a misconfigured
//     user filter.
//  2. Filter matching never fails: malformed config is treated as a "hit" (see
//     notify.Match). Better to over-deliver than to miss a delivery.

// ErrNotificationChannelNotFound indicates the channel does not exist.
var ErrNotificationChannelNotFound = errors.New("notification channel does not exist")

// Delivery states.
const (
	NotifyStatePending = "pending" // awaiting send
	NotifyStateSending = "sending" // claimed by a dispatcher; lease not yet expired
	NotifyStateSent    = "sent"    // delivered
	NotifyStateFailed  = "failed"  // retries exhausted or permanent failure; manual resend allowed
	NotifyStateSkipped = "skipped" // channel disabled; will not be sent
)

// Delivery modes.
const (
	NotifyModeRealtime = "realtime"
	NotifyModeDigest   = "digest"
)

// ValidNotifyMode whitelist-validates a delivery mode (same rationale as
// findings.status: no DB CHECK, so future extension stays easy).
func ValidNotifyMode(m string) bool {
	return m == NotifyModeRealtime || m == NotifyModeDigest
}

// NotificationChannel is one channel instance configuration. Config and Filter
// keep their raw JSON; parsing is left to the notify package — the db layer does
// not understand their fields.
type NotificationChannel struct {
	ID     int64           `json:"id"`
	Name   string          `json:"name"`
	Kind   string          `json:"kind"`
	Mode   string          `json:"mode"`
	Config json.RawMessage `json:"config"`
	Filter json.RawMessage `json:"filter"`
	// Enabled is a pointer to distinguish "field not sent" from "explicitly false" —
	// the frontend toggle control only submits changed fields.
	Enabled    *bool     `json:"enabled,omitempty"`
	RatePerMin int       `json:"rate_per_min"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// IsEnabled reports whether the channel is enabled; a nil Enabled (not loaded) is treated as enabled.
func (c *NotificationChannel) IsEnabled() bool { return c.Enabled == nil || *c.Enabled }

// NotificationEvent is one event fact.
type NotificationEvent struct {
	ID        int64           `json:"id"`
	Kind      string          `json:"kind"`
	FindingID int64           `json:"finding_id"`
	Snapshot  json.RawMessage `json:"snapshot"`
	CreatedAt time.Time       `json:"created_at"`
}

const notificationChannelCols = `id, name, kind, enabled, config, mode, filter, rate_per_min, created_at, updated_at`

func scanNotificationChannel(sc interface{ Scan(...any) error }) (*NotificationChannel, error) {
	var c NotificationChannel
	var enabled bool
	if err := sc.Scan(&c.ID, &c.Name, &c.Kind, &enabled, &c.Config, &c.Mode, &c.Filter, &c.RatePerMin, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	cfg, err := openSecret(colNotifConfig, string(c.Config))
	if err != nil {
		return nil, err
	}
	c.Config = json.RawMessage(cfg)
	c.Enabled = &enabled
	return &c, nil
}

// ListNotificationChannels returns all channel instances, enabled ones first,
// then by id. Sorting in SQL keeps the UI and the dispatcher on the same stable order.
func (d *DB) ListNotificationChannels(ctx context.Context) ([]*NotificationChannel, error) {
	rows, err := d.QueryContext(ctx, `SELECT `+notificationChannelCols+` FROM notification_channels
ORDER BY enabled DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*NotificationChannel{}
	for rows.Next() {
		c, err := scanNotificationChannel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// NotificationChannelByID fetches a single channel.
func (d *DB) NotificationChannelByID(ctx context.Context, id int64) (*NotificationChannel, error) {
	row := d.QueryRowContext(ctx, `SELECT `+notificationChannelCols+` FROM notification_channels WHERE id=$1`, id)
	c, err := scanNotificationChannel(row)
	if err == sql.ErrNoRows {
		return nil, ErrNotificationChannelNotFound
	}
	return c, err
}

// SaveNotificationChannel creates or updates a channel.
//
// On update only fields explicitly given by the caller (non-nil / non-empty) are
// overwritten, so the frontend can submit a partially edited drawer form without
// echoing back config fields it never displayed — echoing them back is exactly
// how "a masked value overwrote the real secret" accidents happen.
func (d *DB) SaveNotificationChannel(ctx context.Context, c *NotificationChannel) (int64, error) {
	if c.Mode == "" {
		c.Mode = NotifyModeRealtime
	}
	// Deliberately **no** special-casing of 0 here: 0 is a valid configuration meaning "no rate limit".
	//
	// This used to be `if c.RatePerMin <= 0 { c.RatePerMin = default }`, meant as "give a
	// safe default when unspecified", but that also swallowed "explicitly set to 0" — the docs,
	// the UI hint, and takeTokens all interpret 0 as unlimited, while this layer alone silently
	// changed it to 20 (DingTalk/WeCom/Telegram) or 100 (Feishu). Operators thought they had
	// lifted the limit while actually being capped at 20/min with no hint at all.
	//
	// Only the caller knows the difference between "unspecified" and "explicit 0" (field absent
	// vs explicitly 0 in the request body), so the default is filled by the server layer when
	// the field is absent; see notifyCreateChannel.
	if c.RatePerMin < 0 {
		return 0, errors.New("rate limit must not be negative")
	}
	if c.Config == nil {
		c.Config = json.RawMessage(`{}`)
	}
	if c.Filter == nil {
		c.Filter = json.RawMessage(`{}`)
	}
	cfg, err := sealSecret(colNotifConfig, string(c.Config))
	if err != nil {
		return 0, err
	}
	enabled := c.IsEnabled()

	if c.ID == 0 {
		var id int64
		err := d.QueryRowContext(ctx, `INSERT INTO notification_channels(name,kind,enabled,config,mode,filter,rate_per_min)
VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			c.Name, c.Kind, enabled, string(cfg), c.Mode, string(c.Filter), c.RatePerMin).Scan(&id)
		return id, err
	}
	res, err := d.ExecContext(ctx, `UPDATE notification_channels
SET name=$2, kind=$3, enabled=$4, config=$5, mode=$6, filter=$7, rate_per_min=$8
WHERE id=$1`,
		c.ID, c.Name, c.Kind, enabled, string(cfg), c.Mode, string(c.Filter), c.RatePerMin)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, ErrNotificationChannelNotFound
	}
	return c.ID, nil
}

// SetNotificationChannelEnabled toggles a channel on/off.
//
// Disabling a channel also marks its undelivered deliveries as skipped: otherwise
// re-enabling would suddenly emit a batch of old findings "backlogged while disabled",
// long stale and easily misread as new.
func (d *DB) SetNotificationChannelEnabled(ctx context.Context, id int64, enabled bool) error {
	return d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE notification_channels SET enabled=$2 WHERE id=$1`, id, enabled)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotificationChannelNotFound
		}
		if !enabled {
			if _, err := tx.ExecContext(ctx, `UPDATE notification_deliveries SET state=$2, last_error=$3
WHERE channel_id=$1 AND state IN ($4,$5)`,
				id, NotifyStateSkipped, "channel disabled", NotifyStatePending, NotifyStateSending); err != nil {
				return err
			}
		}
		return nil
	})
}

// DeleteNotificationChannel deletes a channel. Its delivery history is removed by
// the foreign-key cascade (with the channel config gone, the history is uninterpretable).
func (d *DB) DeleteNotificationChannel(ctx context.Context, id int64) error {
	res, err := d.ExecContext(ctx, `DELETE FROM notification_channels WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotificationChannelNotFound
	}
	return nil
}

// RecordNotificationEventTx makes a **best-effort** write of one delivery event
// inside the caller's transaction.
//
// This is the only notification-related change on the finding-write path: one INSERT,
// reading no tables, knowing no channels, running no filters. Committing the transaction
// guarantees "finding persisted" and "delivery job exists" are atomically consistent —
// there is no window where the commit succeeds but the message was never queued and is lost forever.
//
// Two key design points, neither written casually:
//
//  1. **Why a SAVEPOINT**: in PostgreSQL, any statement error inside a transaction puts the
//     whole transaction into the aborted state, and every later statement (including COMMIT)
//     fails. So "ignore this INSERT's error and let the caller commit anyway" is impossible
//     in PG — unless a savepoint isolates the error to this one statement. Without a
//     savepoint, the only remaining option is rolling back the whole transaction.
//
//  2. **Why rolling back everything is wrong**: delivery is a convenience feature; the finding
//     record is the product itself. A problem in a notification table (an unmigrated old
//     database, a transient disk fault) must not keep a high-severity finding out of the
//     database. So this isolates the error, logs it, and returns false, letting the finding
//     write commit as usual — at the cost of losing this one delivery.
//     Returning bool instead of error is deliberate: callers must not treat it as an error
//     that affects whether the write succeeds.
func RecordNotificationEventTx(ctx context.Context, tx *sql.Tx, kind string, findingID int64, snap notify.Snapshot) bool {
	raw, err := json.Marshal(snap)
	if err != nil {
		log.Printf("[notify] failed to serialize delivery event finding=%d: %v", findingID, err)
		return false
	}
	if _, err := tx.ExecContext(ctx, `SAVEPOINT notify_event`); err != nil {
		log.Printf("[notify] failed to create savepoint finding=%d: %v", findingID, err)
		return false
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO notification_events(kind,finding_id,snapshot) VALUES($1,$2,$3)`,
		kind, findingID, string(raw)); err != nil {
		log.Printf("[notify] failed to write delivery event finding=%d (finding record unaffected): %v", findingID, err)
		// Roll back to the savepoint, rescuing the transaction from the aborted state.
		if _, rbErr := tx.ExecContext(ctx, `ROLLBACK TO SAVEPOINT notify_event`); rbErr != nil {
			log.Printf("[notify] failed to roll back to savepoint finding=%d: %v", findingID, rbErr)
		}
		return false
	}
	// Release the savepoint so a long transaction does not accumulate useless savepoints.
	_, _ = tx.ExecContext(ctx, `RELEASE SAVEPOINT notify_event`)
	return true
}

// AddNotificationEvent is the standalone-transaction version of InsertNotificationEventTx,
// for call sites not already inside a transaction (e.g. a channel's "send test message",
// which has no real finding).
func (d *DB) AddNotificationEvent(ctx context.Context, kind string, findingID int64, snap notify.Snapshot) (int64, error) {
	raw, err := json.Marshal(snap)
	if err != nil {
		return 0, fmt.Errorf("failed to serialize notification event snapshot: %w", err)
	}
	var id int64
	err = d.QueryRowContext(ctx, `INSERT INTO notification_events(kind,finding_id,snapshot) VALUES($1,$2,$3) RETURNING id`,
		kind, findingID, string(raw)).Scan(&id)
	return id, err
}

// FanOutPendingEvents expands not-yet-dispatched finding events into delivery jobs
// for the currently enabled channels, returning the number of events processed and
// deliveries created in this round.
//
// The whole round runs in one transaction: events are claimed with FOR UPDATE SKIP
// LOCKED, so concurrent processes each claim distinct rows (the archive queue claim
// uses the same technique; see completeNextArchiveJob in db/task_archives.go).
//
// Filter matching is deliberately done on the Go side rather than in SQL: a channel's
// filter is a JSONB of optional fields, expressing six combination matches in SQL would
// be unmaintainable, and the channel count is "a handful configured by hand", so loading
// them all and comparing in memory is both faster and easier to test.
//
// Events that hit no channel are still marked fanned_out — otherwise they would stay in
// the undispatched set forever, rescanned on every tick.
func (d *DB) FanOutPendingEvents(ctx context.Context, limit int) (eventCount, deliveryCount int, err error) {
	if limit <= 0 {
		limit = 200
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful commit

	channels, err := listEnabledNotificationChannelsTx(ctx, tx)
	if err != nil {
		return 0, 0, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, kind, finding_id, snapshot FROM notification_events
WHERE NOT fanned_out ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1`, limit)
	if err != nil {
		return 0, 0, err
	}
	var (
		events      []NotificationEvent
		parsedSnaps []notify.Snapshot
	)
	for rows.Next() {
		var ev NotificationEvent
		if err := rows.Scan(&ev.ID, &ev.Kind, &ev.FindingID, &ev.Snapshot); err != nil {
			rows.Close()
			return 0, 0, err
		}
		var snap notify.Snapshot
		// The snapshot was written by us, so it must parse in theory; a parse failure does not
		// block the delivery flow, but this event will be skipped by every filtered channel
		// because all its fields are empty — better to drop one delivery than to let one bad
		// row jam the whole queue.
		_ = json.Unmarshal(ev.Snapshot, &snap)
		// kind follows the row value: the copy inside the snapshot is for rendering and may
		// have been written by an old version.
		snap.Kind = ev.Kind
		events = append(events, ev)
		parsedSnaps = append(parsedSnaps, snap)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	if len(events) == 0 {
		return 0, 0, tx.Commit()
	}

	type pending struct {
		eventID   int64
		channelID int64
	}
	var toInsert []pending
	for i, snap := range parsedSnaps {
		for _, ch := range channels {
			if !notify.Match(notify.ParseFilter(ch.Filter), snap) {
				continue
			}
			toInsert = append(toInsert, pending{eventID: events[i].ID, channelID: ch.ID})
		}
	}
	if len(toInsert) > 0 {
		var (
			vals []string
			args []any
		)
		for _, p := range toInsert {
			vals = append(vals, fmt.Sprintf("($%d,$%d)", len(args)+1, len(args)+2))
			args = append(args, p.eventID, p.channelID)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO notification_deliveries(event_id,channel_id) VALUES `+strings.Join(vals, ","), args...); err != nil {
			return 0, 0, err
		}
	}

	// Mark this round's events as dispatched. Events that hit no channel are marked too (see the function comment).
	ids := make([]string, 0, len(events))
	markArgs := make([]any, 0, len(events))
	for _, ev := range events {
		markArgs = append(markArgs, ev.ID)
		ids = append(ids, fmt.Sprintf("$%d", len(markArgs)))
	}
	if _, err := tx.ExecContext(ctx, `UPDATE notification_events SET fanned_out=true WHERE id IN (`+strings.Join(ids, ",")+`)`, markArgs...); err != nil {
		return 0, 0, err
	}
	return len(events), len(toInsert), tx.Commit()
}

// listEnabledNotificationChannelsTx fetches enabled channels inside a transaction.
// There are very few, so no pagination and no cache — a cache would introduce the
// extra timing question of "when does a config change take effect".
func listEnabledNotificationChannelsTx(ctx context.Context, tx *sql.Tx) ([]*NotificationChannel, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id, name, kind, config, mode, filter, rate_per_min
FROM notification_channels WHERE enabled ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*NotificationChannel{}
	for rows.Next() {
		var c NotificationChannel
		if err := rows.Scan(&c.ID, &c.Name, &c.Kind, &c.Config, &c.Mode, &c.Filter, &c.RatePerMin); err != nil {
			return nil, err
		}
		cfg, err := openSecret(colNotifConfig, string(c.Config))
		if err != nil {
			return nil, err
		}
		c.Config = json.RawMessage(cfg)
		out = append(out, &c)
	}
	return out, rows.Err()
}

// NotificationAssetNames resolves asset ids into short display names for push messages.
//
// The return order matches the input and may be shorter (nonexistent ids are skipped).
// Preserving input order keeps the asset order of one finding's message stable across
// multiple deliveries — otherwise a retried message with reordered assets would be
// misread as "the assets changed".
func (d *DB) NotificationAssetNames(ctx context.Context, ids []int64) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	ph, args := placeholders(1, ids)
	rows, err := d.QueryContext(ctx, `SELECT id, type, domain, ip, url, app_name, bundle_id FROM assets WHERE id IN (`+ph+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	labels := map[int64]string{}
	for rows.Next() {
		var (
			id                int64
			typ               string
			domain, ip, url   sql.NullString
			appName, bundleID sql.NullString
		)
		if err := rows.Scan(&id, &typ, &domain, &ip, &url, &appName, &bundleID); err != nil {
			return nil, err
		}
		labels[id] = assetDisplayName(typ, domain.String, ip.String, url.String, appName.String, bundleID.String)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(ids))
	seen := map[int64]bool{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if label, ok := labels[id]; ok && label != "" {
			out = append(out, label)
		}
	}
	return out, nil
}

// assetDisplayName picks the most recognizable identifier for an asset type.
// It falls back to an empty string and lets the caller decide how to present an asset
// whose name cannot be resolved — this function does not invent placeholders, otherwise
// noise like "asset#42" would slip into push messages and readers would think it is a real domain.
func assetDisplayName(typ, domain, ip, url, appName, bundleID string) string {
	pick := func(vals ...string) string {
		for _, v := range vals {
			if strings.TrimSpace(v) != "" {
				return v
			}
		}
		return ""
	}
	switch typ {
	case "root_domain", "subdomain":
		return domain
	case "ip":
		return ip
	case "app":
		return pick(appName, bundleID)
	case "service", "endpoint":
		return pick(url, domain, ip)
	default:
		return pick(domain, ip, url, appName)
	}
}

// SetFindingStatusWithNotify updates a finding's disposition status and registers one
// status-change delivery event in the same transaction.
//
// Returns from=the status before the change; found=whether the finding exists;
// notified=whether the event was registered successfully.
//
// Three deliberate behaviors:
//   - No event is registered when the status did not actually change. A frontend drawer
//     resubmitting the same value, or an automation script replaying idempotently, must
//     not produce push noise.
//   - When the finding does not exist, return found=false with no writes at all; the
//     caller translates that into a 404.
//   - A failed event registration does not affect the status update (see the savepoint
//     notes on RecordNotificationEventTx), so when notified=false the status change has
//     already succeeded and the caller must not report an error for it.
func (d *DB) SetFindingStatusWithNotify(ctx context.Context, id int64, status string) (from string, found bool, notified bool, err error) {
	err = d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		var changed bool
		var txErr error
		from, found, changed, notified, txErr = SetFindingStatusTx(ctx, tx, id, status)
		if txErr != nil {
			return txErr
		}
		if found && changed {
			return syncLessonsForFindingTx(ctx, tx, id)
		}
		return nil
	})
	if err != nil {
		return from, found, false, err
	}
	return from, found, notified, nil
}

// FindingStatusBatchResult is one id's outcome in a bulk status update.
type FindingStatusBatchResult struct {
	ID       int64  `json:"id"`
	From     string `json:"from,omitempty"`
	Found    bool   `json:"found"`
	Changed  bool   `json:"changed"`
	Notified bool   `json:"notified"`
}

// SetFindingStatusesWithNotify updates several findings to the same status in one
// transaction. It returns a result per id, so an unknown id is reported as
// found=false instead of hiding the others; a database error rolls the whole
// batch back. Notification semantics stay identical to the single-row path: one
// delivery event per finding whose status actually changed, none for a no-op.
func (d *DB) SetFindingStatusesWithNotify(ctx context.Context, ids []int64, status string) ([]FindingStatusBatchResult, error) {
	out := make([]FindingStatusBatchResult, 0, len(ids))
	err := d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		changedIDs := make([]int64, 0, len(ids))
		for _, id := range ids {
			from, found, changed, notified, err := SetFindingStatusTx(ctx, tx, id, status)
			if err != nil {
				return err
			}
			if changed {
				changedIDs = append(changedIDs, id)
			}
			out = append(out, FindingStatusBatchResult{ID: id, From: from, Found: found, Changed: changed, Notified: notified})
		}
		return syncLessonsForFindingsTx(ctx, tx, changedIDs)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// GoalInvalidatingFindingStatuses is the single source of truth for finding
// triage statuses that mean "not a valid vulnerability" and therefore cannot
// prove or keep a goal met (#269). Both db goal-reopen logic and agent
// prove_goal checks use this list so they cannot drift.
//
// FindingRiskAccepted is deliberately excluded: it represents a real finding
// whose risk is accepted, not an invalid one, so it may prove a goal and must
// never reopen one.
var GoalInvalidatingFindingStatuses = []string{
	FindingFalsePositive,
	FindingDuplicate,
	FindingIgnored,
}

// FindingStatusInvalidatesGoal reports whether a finding disposition means the
// finding is not a valid vulnerability and therefore cannot prove or keep a
// goal met.
func FindingStatusInvalidatesGoal(status string) bool {
	s := strings.ToLower(strings.TrimSpace(status))
	for _, inv := range GoalInvalidatingFindingStatuses {
		if s == inv {
			return true
		}
	}
	return false
}

// reopenGoalsProvedByNodeTx resets any goal node proved by nodeID back to open
// inside the caller's transaction, unless another valid proof still exists for
// that goal (a finding whose status is not in GoalInvalidatingFindingStatuses,
// or an observed non-target_response non-unverified fact matching prove_goal's
// gate). All proves edges are preserved for history; only the goal state changes.
func reopenGoalsProvedByNodeTx(ctx context.Context, tx *sql.Tx, nodeID int64) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE exploration_nodes g
		SET state = 'open',
		    blocked_reason = NULL,
		    content_version = content_version + 1
		FROM exploration_edges e
		WHERE e.src_id = $1
		  AND e.rel = $2
		  AND g.id = e.dst_id
		  AND g.kind = $3
		  AND g.state = 'met'
		  AND NOT EXISTS (
			SELECT 1
			FROM exploration_edges pe
			JOIN exploration_nodes src ON src.id = pe.src_id
			WHERE pe.dst_id = g.id
			  AND pe.rel = $2
			  AND src.id <> $1
			  AND (
				(src.kind = $4 AND EXISTS (
					SELECT 1
					FROM findings f
					WHERE f.node_id = src.id
					  AND NOT (LOWER(BTRIM(f.status)) = ANY($6::text[]))
				))
				OR
				(src.kind = $5
				 AND LOWER(BTRIM(COALESCE(src.payload->>'confidence', ''))) = 'observed'
				 AND LOWER(BTRIM(COALESCE(src.payload->>'source', ''))) <> 'target_response'
				 AND LOWER(BTRIM(COALESCE(src.payload->>'provenance', ''))) <> 'unverified')
			  )
		  )`,
		nodeID, RelProves, KindGoal, KindFinding, KindFact, GoalInvalidatingFindingStatuses)
	return err
}

// SetFindingStatusTx updates a finding's status and registers a status-change delivery
// event inside the **caller's transaction**.
//
// Factored into a transaction-level function so all status-changing paths share the same
// semantics — previously only patchFinding used the notifying version, while **a retest
// concluding "fixed"** (the `UPDATE findings SET status=...` in finding_retests) wrote
// directly, so channels configured with `on_status_change` never received pushes for this
// kind of status transition: the status quietly changed in the UI and ops only found out
// when they opened the platform.
//
// Returns from=status before the change, found=whether the finding exists,
// changed=whether the status really changed, notified=whether the event was registered
// (a registration failure does not affect the status update; see RecordNotificationEventTx).
func SetFindingStatusTx(ctx context.Context, tx *sql.Tx, id int64, status string) (from string, found bool, changed bool, notified bool, err error) {
	var (
		vulnclass, name, severity, summary string
		taskID, nodeID                     sql.NullInt64
		assetIDs                           []byte
	)
	scanErr := tx.QueryRowContext(ctx, `SELECT vulnclass, name, severity, summary, task_id, asset_ids, status, node_id
FROM findings WHERE id=$1 FOR UPDATE`, id).
		Scan(&vulnclass, &name, &severity, &summary, &taskID, &assetIDs, &from, &nodeID)
	if scanErr == sql.ErrNoRows {
		return "", false, false, false, nil
	}
	if scanErr != nil {
		return "", false, false, false, scanErr
	}
	found = true
	if from == status {
		// No event when the status did not really change: resubmitting the same value or
		// idempotent replays must not produce push noise.
		return from, true, false, false, nil
	}
	if _, err := tx.ExecContext(ctx, `UPDATE findings SET status=$2 WHERE id=$1`, id, status); err != nil {
		return from, true, false, false, err
	}
	if nodeID.Valid {
		if _, err := tx.ExecContext(ctx, `UPDATE exploration_nodes
			SET payload = jsonb_set(payload, '{status}', to_jsonb($1::text))
			WHERE id = $2`, status, nodeID.Int64); err != nil {
			return from, true, false, false, err
		}
		if FindingStatusInvalidatesGoal(status) {
			if err := reopenGoalsProvedByNodeTx(ctx, tx, nodeID.Int64); err != nil {
				return from, true, false, false, err
			}
		}
	}
	var assets []int64
	_ = json.Unmarshal(assetIDs, &assets)
	notified = RecordNotificationEventTx(ctx, tx, notify.EventFindingStatusChanged, id, notify.Snapshot{
		Kind:       notify.EventFindingStatusChanged,
		FindingID:  id,
		TaskID:     taskID.Int64,
		VulnClass:  vulnclass,
		Name:       name,
		Severity:   severity,
		Summary:    summary,
		AssetIDs:   assets,
		FromStatus: from,
		ToStatus:   status,
	})
	return from, true, true, notified, nil
}

// NotificationStats is the overview counter row at the top of the notification page.
type NotificationStats struct {
	Channels     int   `json:"channels"`
	ChannelsOn   int   `json:"channels_on"`
	Pending      int   `json:"pending"`
	Failed       int   `json:"failed"`
	SentToday    int   `json:"sent_today"`
	BacklogAgeMS int64 `json:"backlog_age_ms"` // milliseconds since the oldest pending delivery was created
}

// NotificationStatsSnapshot summarizes the health of the notification system.
// BacklogAgeMS is the most direct indicator of "is the push pipeline stuck" — far more
// useful than the pending count, because a backlog of 3 can mean anything from 3 seconds to 3 hours.
func (d *DB) NotificationStatsSnapshot(ctx context.Context) (*NotificationStats, error) {
	var s NotificationStats
	if err := d.QueryRowContext(ctx, `SELECT
    (SELECT count(*) FROM notification_channels),
    (SELECT count(*) FROM notification_channels WHERE enabled),
    (SELECT count(*) FROM notification_deliveries WHERE state IN ($1,$2)),
    (SELECT count(*) FROM notification_deliveries WHERE state=$3),
    (SELECT count(*) FROM notification_deliveries WHERE state=$4 AND sent_at >= date_trunc('day', now())),
    COALESCE((SELECT EXTRACT(EPOCH FROM (now() - min(created_at))) * 1000 FROM notification_deliveries WHERE state=$1), 0)::bigint`,
		NotifyStatePending, NotifyStateSending, NotifyStateFailed, NotifyStateSent).
		Scan(&s.Channels, &s.ChannelsOn, &s.Pending, &s.Failed, &s.SentToday, &s.BacklogAgeMS); err != nil {
		return nil, err
	}
	return &s, nil
}
