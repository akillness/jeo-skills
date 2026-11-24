package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/notify"
)

var (
	ErrEvidenceConflict = errors.New("traffic evidence has changed, please refresh and retry")
	ErrFindingNotFound  = errors.New("finding does not exist")
	ErrEvidenceNotFound = errors.New("traffic evidence does not exist")
)

// This lock covers the evidence filesystem as well as its SQL references. All
// processes sharing the database use it, including readers, exports and GC.
const findingEvidenceLockKey int64 = 7337741004

func (d *DB) WithEvidenceTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, findingEvidenceLockKey); err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

type TrafficRef struct {
	TrafficID string `json:"traffic_id"`
	Role      string `json:"role"`
	Note      string `json:"note"`
}

func NormalizeTrafficRefs(refs []TrafficRef) ([]TrafficRef, error) {
	out := make([]TrafficRef, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		ref.TrafficID = strings.TrimSpace(ref.TrafficID)
		if ref.TrafficID == "" {
			return nil, errors.New("traffic_id must not be empty")
		}
		if ref.Role == "" {
			ref.Role = "supporting"
		}
		if !ValidTrafficRole(ref.Role) {
			return nil, fmt.Errorf("invalid traffic role %q", ref.Role)
		}
		if !seen[ref.TrafficID] {
			out = append(out, ref)
			seen[ref.TrafficID] = true
		}
	}
	return out, nil
}

func ValidTrafficRole(role string) bool {
	return role == "baseline" || role == "proof" || role == "verification" || role == "supporting"
}

type TrafficEvidenceSnapshot struct {
	ID              string    `json:"id"`
	SourceTrafficID string    `json:"source_traffic_id"`
	CapturedAt      int64     `json:"captured_at"`
	URL             string    `json:"url"`
	Method          string    `json:"method"`
	Status          int       `json:"status"`
	ContentType     string    `json:"content_type"`
	ReqHead         string    `json:"req_head,omitempty"`
	RespHead        string    `json:"resp_head,omitempty"`
	ReqHash         string    `json:"req_hash"`
	RespHash        string    `json:"resp_hash"`
	ReqLen          int64     `json:"req_len"`
	RespLen         int64     `json:"resp_len"`
	Rewritten       bool      `json:"rewritten,omitempty"`
	RewriteRuleIDs  []int64   `json:"rewrite_rule_ids,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

type FindingTrafficBinding struct {
	ID         int64                   `json:"id,string"`
	FindingID  int64                   `json:"finding_id,string"`
	SnapshotID string                  `json:"snapshot_id"`
	Role       string                  `json:"role"`
	Note       string                  `json:"note"`
	Position   int                     `json:"position"`
	CreatedAt  time.Time               `json:"created_at"`
	Snapshot   TrafficEvidenceSnapshot `json:"snapshot"`
}

type FindingTraffic struct {
	FindingID     int64                   `json:"finding_id,string"`
	Version       int64                   `json:"version"`
	ReportVersion int64                   `json:"report_version"`
	Bindings      []FindingTrafficBinding `json:"bindings"`
}

type PreparedTrafficEvidence struct {
	Ref      TrafficRef
	Snapshot TrafficEvidenceSnapshot
}

// Normalize makes the snapshot's text columns safe for PostgreSQL. URL and the
// head blocks come straight off the wire, so a target answering with a non-UTF-8
// header (a GBK `Content-Disposition: filename=…`, a NUL byte) would otherwise
// abort the INSERT and roll back the whole finding — losing a confirmed finding
// over a malformed response header. Applied before hashing so the ID always
// matches the bytes that actually land in the table.
func (s TrafficEvidenceSnapshot) Normalize() TrafficEvidenceSnapshot {
	s.SourceTrafficID = utf8Clean(s.SourceTrafficID)
	s.URL = utf8Clean(s.URL)
	s.Method = utf8Clean(s.Method)
	s.ContentType = utf8Clean(s.ContentType)
	s.ReqHead = utf8Clean(s.ReqHead)
	s.RespHead = utf8Clean(s.RespHead)
	return s
}

func TrafficSnapshotID(snapshot TrafficEvidenceSnapshot) string {
	snapshot = snapshot.Normalize()
	snapshot.ID = ""
	snapshot.CreatedAt = time.Time{}
	snapshot.Rewritten = false
	snapshot.RewriteRuleIDs = nil
	raw, _ := json.Marshal(snapshot)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func sortedUniqueInt64(ids []int64) []int64 {
	if len(ids) == 0 {
		return nil
	}
	out := slices.Clone(ids)
	slices.Sort(out)
	return slices.Compact(out)
}

func formatBigintArray(ids []int64) string {
	ids = sortedUniqueInt64(ids)
	if len(ids) == 0 {
		return "{}"
	}
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = strconv.FormatInt(id, 10)
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// LockTaskEvidenceTx serializes writes with archive queueing (which locks the
// same task row). Once queued, its snapshot must not acquire new evidence.
func LockTaskEvidenceTx(tx *sql.Tx, taskID int64) error {
	if taskID == 0 {
		return nil
	}
	var deleted sql.NullTime
	if err := tx.QueryRow(`SELECT deleted_at FROM tasks WHERE id=$1 FOR UPDATE`, taskID).Scan(&deleted); err != nil {
		return err
	}
	if deleted.Valid {
		return ErrTaskArchiveState
	}
	var state string
	err := tx.QueryRow(`SELECT state FROM task_archives WHERE task_id=$1`, taskID).Scan(&state)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil && state != ArchiveFailed {
		return ErrTaskArchiveState
	}
	return nil
}

func LockFindingEvidenceTx(tx *sql.Tx, findingID int64, version *int64) error {
	var taskID sql.NullInt64
	if err := tx.QueryRow(`SELECT task_id FROM findings WHERE id=$1`, findingID).Scan(&taskID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrFindingNotFound
		}
		return err
	}
	if err := LockTaskEvidenceTx(tx, taskID.Int64); err != nil {
		return err
	}
	var current int64
	if err := tx.QueryRow(`SELECT evidence_version FROM findings WHERE id=$1 FOR UPDATE`, findingID).Scan(&current); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrFindingNotFound
		}
		return err
	}
	if version != nil && *version != current {
		return ErrEvidenceConflict
	}
	return nil
}

func InsertEvidenceSnapshotTx(tx *sql.Tx, s TrafficEvidenceSnapshot) error {
	if s.ID != TrafficSnapshotID(s) {
		return errors.New("evidence snapshot metadata hash mismatch")
	}
	// The ID was computed over the normalized form; store those same bytes.
	id := s.ID
	s = s.Normalize()
	s.ID = id
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now().UTC()
	}
	// The ID hashes the clear heads; only the stored heads are sealed.
	reqHead, err := sealSecret(colEvReqHead, s.ReqHead)
	if err != nil {
		return err
	}
	respHead, err := sealSecret(colEvRespHead, s.RespHead)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO traffic_evidence_snapshots
(id,source_traffic_id,captured_at,url,method,status,content_type,req_head,resp_head,req_hash,resp_hash,req_len,resp_len,created_at,rewritten,rewrite_rule_ids)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::bigint[]) ON CONFLICT(id) DO NOTHING`,
		s.ID, s.SourceTrafficID, s.CapturedAt, s.URL, s.Method, s.Status, s.ContentType, reqHead, respHead, s.ReqHash, s.RespHash, s.ReqLen, s.RespLen, s.CreatedAt, s.Rewritten, formatBigintArray(s.RewriteRuleIDs))
	return err
}

// openHeads decrypts the heads of a snapshot read from the table or an archive.
// Clear legacy values pass through; a value that fails to decrypt is an error.
func (s *TrafficEvidenceSnapshot) openHeads() (err error) {
	if s.ReqHead, err = openSecret(colEvReqHead, s.ReqHead); err != nil {
		return err
	}
	s.RespHead, err = openSecret(colEvRespHead, s.RespHead)
	return err
}

func AddFindingTrafficTx(tx *sql.Tx, findingID int64, prepared []PreparedTrafficEvidence) error {
	var position int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position)+1,0) FROM finding_traffic_bindings WHERE finding_id=$1`, findingID).Scan(&position); err != nil {
		return err
	}
	changed := false
	for _, item := range prepared {
		if err := InsertEvidenceSnapshotTx(tx, item.Snapshot); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE traffic_evidence_snapshots SET unreferenced_at=NULL WHERE id=$1`, item.Snapshot.ID); err != nil {
			return err
		}
		res, err := tx.Exec(`INSERT INTO finding_traffic_bindings(finding_id,snapshot_id,role,note,position)
VALUES($1,$2,$3,$4,$5) ON CONFLICT(finding_id,snapshot_id) DO NOTHING`, findingID, item.Snapshot.ID, item.Ref.Role, item.Ref.Note, position)
		if err != nil {
			return err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if n > 0 {
			changed = true
			position++
		}
	}
	if changed {
		return bumpEvidenceVersionTx(tx, findingID)
	}
	return nil
}

func bumpEvidenceVersionTx(tx *sql.Tx, findingID int64) error {
	_, err := tx.Exec(`UPDATE findings SET evidence_version=evidence_version+1 WHERE id=$1`, findingID)
	return err
}

func FindingTrafficTx(tx *sql.Tx, findingID int64) (*FindingTraffic, error) {
	out := &FindingTraffic{FindingID: findingID, Bindings: []FindingTrafficBinding{}}
	if err := tx.QueryRow(`SELECT evidence_version,report_evidence_version FROM findings WHERE id=$1`, findingID).Scan(&out.Version, &out.ReportVersion); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrFindingNotFound
		}
		return nil, err
	}
	rows, err := tx.Query(`SELECT b.id,b.finding_id,b.snapshot_id,b.role,b.note,b.position,b.created_at,to_jsonb(s)
FROM finding_traffic_bindings b JOIN traffic_evidence_snapshots s ON s.id=b.snapshot_id WHERE b.finding_id=$1 ORDER BY b.position,b.id`, findingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b FindingTrafficBinding
		var raw []byte
		if err := rows.Scan(&b.ID, &b.FindingID, &b.SnapshotID, &b.Role, &b.Note, &b.Position, &b.CreatedAt, &raw); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &b.Snapshot); err != nil {
			return nil, err
		}
		if err := b.Snapshot.openHeads(); err != nil {
			return nil, err
		}
		out.Bindings = append(out.Bindings, b)
	}
	return out, rows.Err()
}

func (d *DB) GetFindingTraffic(ctx context.Context, findingID int64) (out *FindingTraffic, err error) {
	err = d.WithEvidenceTx(ctx, func(tx *sql.Tx) error { var e error; out, e = FindingTrafficTx(tx, findingID); return e })
	return
}

func (d *DB) EditFindingTraffic(ctx context.Context, findingID, bindingID, version int64, role, note *string, remove bool, order []int64) error {
	if role != nil && !ValidTrafficRole(*role) {
		return errors.New("invalid traffic role")
	}
	return d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		if err := LockFindingEvidenceTx(tx, findingID, &version); err != nil {
			return err
		}
		if order != nil {
			current, err := FindingTrafficTx(tx, findingID)
			if err != nil {
				return err
			}
			if len(order) != len(current.Bindings) {
				return ErrEvidenceConflict
			}
			ids := map[int64]bool{}
			for _, b := range current.Bindings {
				ids[b.ID] = true
			}
			for position, id := range order {
				if !ids[id] {
					return ErrEvidenceConflict
				}
				delete(ids, id)
				if _, err := tx.Exec(`UPDATE finding_traffic_bindings SET position=$1 WHERE finding_id=$2 AND id=$3`, position, findingID, id); err != nil {
					return err
				}
			}
		} else {
			var res sql.Result
			var err error
			if remove {
				res, err = tx.Exec(`DELETE FROM finding_traffic_bindings WHERE finding_id=$1 AND id=$2`, findingID, bindingID)
			} else {
				res, err = tx.Exec(`UPDATE finding_traffic_bindings SET role=COALESCE($3,role),note=COALESCE($4,note) WHERE finding_id=$1 AND id=$2`, findingID, bindingID, role, note)
			}
			if err != nil {
				return err
			}
			n, err := res.RowsAffected()
			if err != nil {
				return err
			}
			if n == 0 {
				return ErrEvidenceNotFound
			}
		}
		return bumpEvidenceVersionTx(tx, findingID)
	})
}

type RecordFindingInput struct {
	TaskID, ExplorationID, IntentID                      int64
	VulnClass, Name, Severity, Summary, Evidence, Worker string
	Counterevidence, ConfidenceRationale                 string // optional; "" = not given
	AssetIDs                                             []int64
}

type RecordedFinding struct {
	FindingID int64           `json:"finding_id,string"`
	NodeID    int64           `json:"finding_node_id,string"`
	Traffic   *FindingTraffic `json:"traffic"`
}

// ctx is passed in by the caller for this transaction (rather than taking
// context.Background internally): the push-event writes added inside the
// transaction should likewise be subject to the caller's cancellation and
// timeout constraints.
func RecordFindingTx(ctx context.Context, tx *sql.Tx, in RecordFindingInput, prepared []PreparedTrafficEvidence) (*RecordedFinding, error) {
	if err := LockTaskEvidenceTx(tx, in.TaskID); err != nil {
		return nil, err
	}
	if in.TaskID > 0 {
		var expID int64
		if err := tx.QueryRow(`SELECT exploration_id FROM tasks WHERE id=$1`, in.TaskID).Scan(&expID); err != nil {
			return nil, err
		}
		if expID != in.ExplorationID {
			return nil, errors.New("the finding's task does not match the exploration record")
		}
	}
	if in.IntentID > 0 {
		var ok bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM exploration_nodes WHERE id=$1 AND exploration_id=$2 AND kind='intent')`, in.IntentID, in.ExplorationID).Scan(&ok); err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("intent_id must be an intent of this task (intents of associated tasks are read-only)")
		}
	}
	payload, _ := json.Marshal(map[string]any{"vulnclass": in.VulnClass, "name": in.Name, "severity": in.Severity, "summary": in.Summary, "evidence": map[string]any{"by": in.Worker, "poc": in.Evidence}})
	out := &RecordedFinding{}
	if err := tx.QueryRow(`INSERT INTO exploration_nodes(exploration_id,kind,payload,priority,state,origin)
VALUES($1,'finding',$2,9,'confirmed',$3) RETURNING id`, in.ExplorationID, string(payload), in.Worker).Scan(&out.NodeID); err != nil {
		return nil, err
	}
	for _, asset := range in.AssetIDs {
		if _, err := tx.Exec(`INSERT INTO exploration_anchors(node_id,asset_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, out.NodeID, asset); err != nil {
			return nil, err
		}
	}
	if in.IntentID > 0 {
		if _, err := tx.Exec(`INSERT INTO exploration_edges(exploration_id,src_id,rel,dst_id) VALUES($1,$2,$3,$4)`, in.ExplorationID, in.IntentID, RelYields, out.NodeID); err != nil {
			return nil, err
		}
	}
	assets := in.AssetIDs
	if assets == nil {
		assets = []int64{}
	}
	raw, _ := json.Marshal(assets)
	if err := tx.QueryRow(`INSERT INTO findings(task_id,node_id,vulnclass,name,severity,summary,evidence,worker,asset_ids,counterevidence,confidence_rationale)
VALUES(NULLIF($1,0),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, in.TaskID, out.NodeID, in.VulnClass, in.Name, in.Severity, in.Summary, in.Evidence, in.Worker, string(raw), in.Counterevidence, in.ConfidenceRationale).Scan(&out.FindingID); err != nil {
		return nil, err
	}
	// Register a push event in the **same transaction**: committing guarantees
	// "finding persisted" and "push task exists" are atomic — there is no window
	// where the commit succeeded but the event was never enqueued and the
	// message is lost forever.
	// A failure here is isolated on a savepoint and does not affect the finding
	// write (see the function comment), so the return value is ignored.
	RecordNotificationEventTx(ctx, tx, notify.EventFindingCreated, out.FindingID, notify.Snapshot{
		Kind:      notify.EventFindingCreated,
		FindingID: out.FindingID,
		TaskID:    in.TaskID,
		VulnClass: in.VulnClass,
		Name:      in.Name,
		Severity:  in.Severity,
		Summary:   in.Summary,
		AssetIDs:  assets,
	})
	if err := AddFindingTrafficTx(tx, out.FindingID, prepared); err != nil {
		return nil, err
	}
	var err error
	out.Traffic, err = FindingTrafficTx(tx, out.FindingID)
	return out, err
}

// RecordFinding is the atomic legacy/no-recorder path used by tools and tests.
func (s *ExplorationStore) RecordFinding(ctx context.Context, in RecordFindingInput) (out *RecordedFinding, err error) {
	in.ExplorationID = s.expID
	err = s.db.WithEvidenceTx(ctx, func(tx *sql.Tx) error { var e error; out, e = RecordFindingTx(ctx, tx, in, nil); return e })
	return
}

func (d *DB) FindingIDByNodeID(nodeID int64) (id int64, err error) {
	err = d.QueryRow(`SELECT id FROM findings WHERE node_id=$1`, nodeID).Scan(&id)
	return
}

// PopulateFindingTrafficIDs only enriches already-visible nodes. It performs no
// discovery or ID guessing, and leaves the legacy node ID unchanged.
func (s *ExplorationStore) PopulateFindingTrafficIDs(nodes []*Node) error {
	byID := map[int64]*Node{}
	var args []any
	var placeholders []string
	for _, n := range nodes {
		if n == nil || n.Kind != KindFinding || byID[n.ID] != nil {
			continue
		}
		byID[n.ID] = n
		args = append(args, n.ID)
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)))
	}
	if len(args) == 0 {
		return nil
	}
	rows, err := s.db.Query(`SELECT f.id,f.node_id,(SELECT count(*) FROM finding_traffic_bindings b WHERE b.finding_id=f.id) FROM findings f WHERE f.node_id IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var findingID, nodeID int64
		var count int
		if err := rows.Scan(&findingID, &nodeID, &count); err != nil {
			return err
		}
		n := byID[nodeID]
		n.FindingID, n.FindingNodeID, n.TrafficCount = findingID, nodeID, count
	}
	return rows.Err()
}

// FindingProofCheck is the server-side verification result for prove_goal when
// the evidence node is a finding (#124, P4.3).
type FindingProofCheck struct {
	Proven            bool
	FindingID         int64
	MatchedTrafficIDs []string
	Reason            string
}

// VerifyFindingProofForNode recomputes from current finding_traffic_bindings
// whether the finding for nodeID has at least one real bound traffic_ref whose
// host matches the finding's linked assets. A finding without linked assets (or
// whose assets carry no host) is never proven.
// Each bound traffic_ref's source_traffic_id must also exist in the live
// capture store according to exchangeExists. A nil exchangeExists or any
// lookup error fails closed by returning an error.
func (s *ExplorationStore) VerifyFindingProofForNode(
	ctx context.Context,
	nodeID int64,
	exchangeExists func(ctx context.Context, trafficID string) (bool, error),
) (*FindingProofCheck, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("exploration store is unavailable")
	}
	var (
		findingID int64
		assetRaw  []byte
	)
	err := s.db.QueryRowContext(ctx, `SELECT id, COALESCE(asset_ids,'[]'::jsonb) FROM findings WHERE node_id=$1`, nodeID).Scan(&findingID, &assetRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return &FindingProofCheck{
			Proven: false,
			Reason: "no finding record or bound traffic evidence exists for this node",
		}, nil
	}
	if err != nil {
		return nil, err
	}
	var assetIDs []int64
	_ = json.Unmarshal(assetRaw, &assetIDs)

	rows, err := s.db.QueryContext(ctx, `
SELECT COALESCE(s.source_traffic_id,''), COALESCE(s.url,'')
FROM finding_traffic_bindings b
JOIN traffic_evidence_snapshots s ON s.id = b.snapshot_id
WHERE b.finding_id = $1
ORDER BY b.position, b.id`, findingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type boundSnap struct {
		trafficID string
		rawURL    string
	}
	var snaps []boundSnap
	for rows.Next() {
		var bs boundSnap
		if err := rows.Scan(&bs.trafficID, &bs.rawURL); err != nil {
			return nil, err
		}
		snaps = append(snaps, bs)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(snaps) == 0 {
		return &FindingProofCheck{
			Proven:    false,
			FindingID: findingID,
			Reason:    "finding has no bound traffic_ref",
		}, nil
	}
	// Without a linked asset there is no target to match the bound traffic
	// against, so any traffic would prove the finding. Fail closed: the finding
	// stays recorded and visible but cannot close a goal.
	if len(assetIDs) == 0 {
		return &FindingProofCheck{
			Proven:    false,
			FindingID: findingID,
			Reason:    "finding has no linked asset (asset_ids is empty), so its bound traffic cannot be matched to a target",
		}, nil
	}

	var assetHosts []string
	var assetRootDomains []string
	if len(assetIDs) > 0 {
		assets, err := s.db.Assets().GetByIDs(assetIDs)
		if err != nil {
			return nil, fmt.Errorf("load finding assets: %w", err)
		}
		for _, a := range assets {
			addHost := func(h string) {
				h = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(h), "."))
				if h != "" {
					assetHosts = append(assetHosts, h)
				}
			}
			if a.Type == "root_domain" && strings.TrimSpace(a.Domain) != "" {
				assetRootDomains = append(assetRootDomains, strings.ToLower(strings.TrimSuffix(strings.TrimSpace(a.Domain), ".")))
			}
			addHost(a.Domain)
			addHost(a.IP)
			for _, bd := range a.BoundDomains {
				addHost(bd)
			}
			if a.URL != "" {
				if u, err := url.Parse(a.URL); err == nil {
					addHost(u.Hostname())
				}
			}
		}
	}
	if len(assetHosts) == 0 && len(assetRootDomains) == 0 {
		return &FindingProofCheck{
			Proven:    false,
			FindingID: findingID,
			Reason:    "finding's linked assets have no host to match its bound traffic against",
		}, nil
	}

	hostMatchesFinding := func(snapHost string) bool {
		for _, h := range assetHosts {
			if snapHost == h {
				return true
			}
		}
		for _, rd := range assetRootDomains {
			if snapHost == rd || strings.HasSuffix(snapHost, "."+rd) {
				return true
			}
		}
		return false
	}

	var matched []string
	missingInCapture := false
	hostMismatch := false
	for _, sn := range snaps {
		tid := strings.TrimSpace(sn.trafficID)
		if tid == "" {
			missingInCapture = true
			continue
		}
		// Without a capture checker the ref cannot be verified: fail closed.
		if exchangeExists == nil {
			return nil, errors.New("traffic capture verification is unavailable")
		}
		ok, err := exchangeExists(ctx, tid)
		if err != nil {
			return nil, fmt.Errorf("traffic capture lookup failed for %q: %w", tid, err)
		}
		if !ok {
			missingInCapture = true
			continue
		}
		u, err := url.Parse(strings.TrimSpace(sn.rawURL))
		if err != nil {
			hostMismatch = true
			continue
		}
		snapHost := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(u.Hostname()), "."))
		if snapHost == "" || !hostMatchesFinding(snapHost) {
			hostMismatch = true
			continue
		}
		matched = append(matched, tid)
	}
	if len(matched) > 0 {
		return &FindingProofCheck{
			Proven:            true,
			FindingID:         findingID,
			MatchedTrafficIDs: matched,
		}, nil
	}
	reason := "finding has no verified bound traffic_ref"
	if hostMismatch && !missingInCapture {
		reason = "bound traffic host does not match any asset of the finding"
	} else if missingInCapture {
		reason = "bound traffic_ref does not exist in this task's capture"
	}
	return &FindingProofCheck{
		Proven:    false,
		FindingID: findingID,
		Reason:    reason,
	}, nil
}

func (d *DB) SetFindingReportVersionByNodeID(ctx context.Context, nodeID int64, report string, version *int64) (n int64, err error) {
	err = d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		var id int64
		if err := tx.QueryRow(`SELECT id FROM findings WHERE node_id=$1`, nodeID).Scan(&id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if err := LockFindingEvidenceTx(tx, id, version); err != nil {
			return err
		}
		res, err := tx.Exec(`UPDATE findings SET report=$2,report_evidence_version=COALESCE($3::bigint,CASE WHEN evidence_version=0 THEN 0 ELSE -1 END) WHERE id=$1`, id, report, version)
		if err != nil {
			return err
		}
		n, err = res.RowsAffected()
		return err
	})
	return
}
