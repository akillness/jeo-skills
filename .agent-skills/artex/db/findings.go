package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// DBFinding is a row in the standalone findings table. It persists across task
// deletion unless the caller explicitly requests related finding cleanup.
type DBFinding struct {
	TrafficCount          int
	EvidenceVersion       int64
	ReportEvidenceVersion int64
	TrafficBindings       []FindingTrafficBinding // populated only for export

	ID                 int64
	TaskID             *int64
	NodeID             *int64
	VulnClass          string
	Name               string // vulnerability name (readable title); when empty the frontend falls back to VulnClass
	Severity           string
	Summary            string
	Evidence           string
	Worker             string
	AssetIDs           []int64
	Status             string
	ReportState        string // none / submitted / accepted / rejected / duplicate; separate from Status
	PoELevel           int    // proof-of-exploitation level 0-4 (S1); 0 = none declared
	VerificationStatus string // verified / unverified / blocked / not_assessed / false_positive
	VerificationNote   string // why the status was reached; empty when verified
	Report             string // detailed report (Markdown); only populated by GetFinding, not by list queries
	CreatedAt          time.Time
	TaskDescription    string // populated via LEFT JOIN on tasks

	Counterevidence     string // what was tested and did not work; optional, "" = not given
	ConfidenceRationale string // why the conclusion holds; optional, "" = not given
}

// Finding triage states (findings.status).
const (
	FindingPending       = "pending"        // Pending
	FindingInProgress    = "in_progress"    // In progress
	FindingConfirmed     = "confirmed"      // Confirmed (a real vulnerability, not yet fixed)
	FindingResolved      = "resolved"       // Resolved
	FindingFixed         = "fixed"          // Fixed
	FindingFalsePositive = "false_positive" // False positive
	FindingIgnored       = "ignored"        // Ignored
	FindingDuplicate     = "duplicate"      // Duplicate
	FindingRiskAccepted  = "risk_accepted"  // Risk accepted
)

// ValidFindingStatus reports whether s is a known triage state.
func ValidFindingStatus(s string) bool {
	switch s {
	case FindingPending, FindingInProgress, FindingConfirmed, FindingResolved, FindingFixed,
		FindingFalsePositive, FindingIgnored, FindingDuplicate, FindingRiskAccepted:
		return true
	}
	return false
}

// Finding report stages (findings.report_state). A workflow stage after triage,
// not a verdict: a finding can be confirmed and submitted at the same time.
// RSI lesson extraction still reads findings.status.
const (
	FindingReportNone      = "none"
	FindingReportSubmitted = "submitted"
	FindingReportAccepted  = "accepted"
	FindingReportRejected  = "rejected"
	FindingReportDuplicate = "duplicate"
)

// ValidFindingReportState reports whether s is a known report stage.
func ValidFindingReportState(s string) bool {
	switch s {
	case FindingReportNone, FindingReportSubmitted, FindingReportAccepted,
		FindingReportRejected, FindingReportDuplicate:
		return true
	}
	return false
}

// Finding severity levels (findings.severity).
const (
	SeverityCritical = "critical" // Critical
	SeverityHigh     = "high"     // High
	SeverityMedium   = "medium"   // Medium
	SeverityLow      = "low"      // Low
)

// ValidSeverity reports whether s is a known severity level.
func ValidSeverity(s string) bool {
	switch s {
	case SeverityCritical, SeverityHigh, SeverityMedium, SeverityLow:
		return true
	}
	return false
}

// AddFinding inserts a finding into the standalone findings table. taskID and
// nodeID may be 0 (stored as NULL). name may be "" (frontend falls back to
// vulnclass). Returns the new finding id.
func (d *DB) AddFinding(taskID, nodeID int64, vulnclass, name, severity, summary, evidence, worker string, assetIDs []int64) (int64, error) {
	aidsJSON, _ := json.Marshal(assetIDs)
	if assetIDs == nil {
		aidsJSON = []byte("[]")
	}
	var tid, nid *int64
	if taskID > 0 {
		tid = &taskID
	}
	if nodeID > 0 {
		nid = &nodeID
	}
	var id int64
	err := d.QueryRow(
		`INSERT INTO findings (task_id, node_id, vulnclass, name, severity, summary, evidence, worker, asset_ids)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		tid, nid, vulnclass, name, severity, summary, evidence, worker, string(aidsJSON),
	).Scan(&id)
	return id, err
}

// findingSelectCols is the column list (with task_description join) every finding
// list query selects, so scanFinding stays in sync across callers.
const findingSelectCols = `f.id, f.task_id, f.node_id, f.vulnclass, COALESCE(f.name, ''), f.severity, f.summary,
	       f.evidence, f.worker, f.asset_ids, COALESCE(f.status, 'pending'), COALESCE(f.report_state, 'none'), f.created_at,
	       COALESCE(t.description, '') AS task_description, f.evidence_version, f.report_evidence_version,
	       f.poe_level, COALESCE(f.verification_status, 'unverified'), COALESCE(f.verification_note, ''),
	       f.counterevidence, f.confidence_rationale,
 (SELECT count(*) FROM finding_traffic_bindings b WHERE b.finding_id=f.id)`

// scanFindings materializes rows selected via findingSelectCols.
func scanFindings(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]*DBFinding, error) {
	var out []*DBFinding
	for rows.Next() {
		f := &DBFinding{}
		var aidsJSON string
		if err := rows.Scan(&f.ID, &f.TaskID, &f.NodeID, &f.VulnClass, &f.Name, &f.Severity,
			&f.Summary, &f.Evidence, &f.Worker, &aidsJSON, &f.Status, &f.ReportState, &f.CreatedAt, &f.TaskDescription, &f.EvidenceVersion, &f.ReportEvidenceVersion, &f.PoELevel, &f.VerificationStatus, &f.VerificationNote, &f.Counterevidence, &f.ConfidenceRationale, &f.TrafficCount); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(aidsJSON), &f.AssetIDs)
		out = append(out, f)
	}
	return out, rows.Err()
}

// ListFindings returns all findings (newest first), joined with task description.
// Kept for the dashboard's summary; the paginated findings page uses ListFindingsPage.
func (d *DB) ListFindings(limit int) ([]*DBFinding, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := d.Query(`
		SELECT `+findingSelectCols+`
		FROM findings f
		LEFT JOIN tasks t ON f.task_id = t.id
		ORDER BY f.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFindings(rows)
}

// FindingFilter narrows a paginated findings query. Empty-string fields mean "no
// filter on that column". Sort is "severity" (severity desc, then newest) or
// anything else (newest first).
type FindingFilter struct {
	Severity           string // high | medium | low
	Status             string // pending | false_positive | ignored | resolved
	ReportState        string // none | submitted | accepted | rejected | duplicate
	VerificationStatus string // verified | unverified | blocked | not_assessed | false_positive
	VulnClass          string
	TaskID             string // task id (in string form; empty/invalid = do not filter by task)
	Query              string // fuzzy search keyword over name/class/summary/evidence/report body
	Sort               string // "severity" | "time"
	// AssetScope is a node key of the asset tree (a:<id> / c:<id> / r:<domain> /
	// __none__); selecting a node means selecting its whole subtree.
	// Empty = do not filter by asset.
	AssetScope string
	// Company narrows to one company (the sidebar switcher), independent of
	// AssetScope so the asset tree keeps it. A finding belongs to company C when
	// one of its live assets has company_id = C, or, when it has no live asset,
	// when its task has a task_scope row of kind 'company' for C. A finding with
	// no live asset and no such task scope shows only under "all companies".
	// A company id that does not exist, or is not a number, matches nothing.
	// Empty = do not filter by company. An AssetScope of c:<id> means the same.
	Company string

	// The three below are resolved from AssetScope by applyAssetScope; callers
	// do not set them.
	assetIDs  []int64 // all asset ids in the subtree
	assetNone bool    // only findings with "unlinked assets"
	assetMiss bool    // the selected node does not exist under the current filter → result is always empty

	// The three below are resolved from Company by resolveCompany.
	companyID       int64   // > 0 once resolved to an existing company
	companyAssetIDs []int64 // the assets that company owns
	companyMiss     bool    // unknown or non-numeric company → result is always empty
}

// FindingUnassignedTask is the task filter sentinel for findings whose task is
// absent. That includes rows created without a task and rows retained after their
// originating task was deleted (the findings FK is ON DELETE SET NULL).
const FindingUnassignedTask = "__unassigned__"

// where builds the WHERE clause (shared by the page and count queries) plus its
// positional args. All values are parameterized; Query also escapes ILIKE
// wildcards so user input is always matched literally.
func (f FindingFilter) where() (string, []any) {
	var conds []string
	var args []any
	add := func(col, val string) {
		if val == "" {
			return
		}
		args = append(args, val)
		conds = append(conds, fmt.Sprintf("f.%s = $%d", col, len(args)))
	}
	add("severity", f.Severity)
	add("status", f.Status)
	add("report_state", f.ReportState)
	add("verification_status", f.VerificationStatus)
	add("vulnclass", f.VulnClass)
	// task_id is a bigint column, compared as an integer (it cannot go through
	// the text add above); empty/invalid values are ignored.
	if f.TaskID == FindingUnassignedTask {
		conds = append(conds, "(f.task_id IS NULL OR t.id IS NULL)")
	} else if tid, err := strconv.ParseInt(f.TaskID, 10, 64); err == nil && tid > 0 {
		args = append(args, tid)
		conds = append(conds, fmt.Sprintf("f.task_id = $%d", len(args)))
	}
	// Asset filter: asset_ids is a jsonb array; @> ANY(...) can use
	// idx_findings_asset_ids.
	switch {
	case f.assetMiss:
		conds = append(conds, "FALSE")
	case f.assetNone:
		// "Unlinked assets" = asset_ids is empty, or none of the ids inside it
		// exist in the assets table anymore (the assets were deleted). Both go
		// into the asset tree's unlinked bucket, and must be matched here too,
		// otherwise the bucket's count would exceed the rows found after
		// clicking through.
		conds = append(conds, `(
			jsonb_array_length(COALESCE(f.asset_ids, '[]'::jsonb)) = 0
			OR NOT EXISTS (
				SELECT 1 FROM jsonb_array_elements_text(f.asset_ids) e(v)
				JOIN assets a ON a.id = e.v::bigint
			)
		)`)
	case len(f.assetIDs) > 0:
		args = append(args, assetIDContainments(f.assetIDs))
		conds = append(conds, fmt.Sprintf("f.asset_ids @> ANY($%d::jsonb[])", len(args)))
	}
	// Company filter, ANDed with the asset filter above.
	switch {
	case f.companyMiss:
		conds = append(conds, "FALSE")
	case f.companyID > 0:
		anchored := "FALSE" // a company that owns no asset yet
		if len(f.companyAssetIDs) > 0 {
			args = append(args, assetIDContainments(f.companyAssetIDs))
			anchored = fmt.Sprintf("f.asset_ids @> ANY($%d::jsonb[])", len(args))
		}
		// No live asset: attributed through the task's company scope only.
		args = append(args, f.companyID)
		conds = append(conds, fmt.Sprintf(`(%s
			OR ((
				jsonb_array_length(COALESCE(f.asset_ids, '[]'::jsonb)) = 0
				OR NOT EXISTS (
					SELECT 1 FROM jsonb_array_elements_text(f.asset_ids) e(v)
					JOIN assets a ON a.id = e.v::bigint
				)
			) AND EXISTS (
				SELECT 1 FROM task_scope ts
				WHERE ts.task_id = f.task_id AND ts.kind = 'company' AND ts.company_id = $%d
			)))`, anchored, len(args)))
	}
	if query := strings.TrimSpace(f.Query); query != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
		args = append(args, "%"+escaped+"%")
		placeholder := fmt.Sprintf("$%d", len(args))
		conds = append(conds, fmt.Sprintf(`(
			COALESCE(f.name, '') ILIKE %s ESCAPE '\' OR
			f.vulnclass ILIKE %s ESCAPE '\' OR
			f.summary ILIKE %s ESCAPE '\' OR
			f.evidence ILIKE %s ESCAPE '\' OR
			COALESCE(f.report, '') ILIKE %s ESCAPE '\'
		)`, placeholder, placeholder, placeholder, placeholder, placeholder))
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// ListFindingsPage returns one page of findings matching the filter, plus the
// total count of matching rows (for the frontend pager). page is 1-based.
func (d *DB) ListFindingsPage(f FindingFilter, page, pageSize int) ([]*DBFinding, int, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	f, err := d.applyAssetScope(f)
	if err != nil {
		return nil, 0, err
	}
	where, args := f.where()

	var total int
	if err := d.QueryRow(`SELECT COUNT(*) FROM findings f LEFT JOIN tasks t ON f.task_id=t.id`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	// Avoid overflowing (page-1)*pageSize for an arbitrarily large page number.
	// Once the requested page is beyond the exact count, no data query is needed.
	if total == 0 || page > (total-1)/pageSize+1 {
		return []*DBFinding{}, total, nil
	}

	order := f.orderBy()
	pageArgs := append(append([]any{}, args...), pageSize, (page-1)*pageSize)
	q := fmt.Sprintf(`
		SELECT %s
		FROM findings f
		LEFT JOIN tasks t ON f.task_id = t.id%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d`, findingSelectCols, where, order, len(args)+1, len(args)+2)
	rows, err := d.Query(q, pageArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out, err := scanFindings(rows)
	return out, total, err
}

// ListFindingsFiltered returns up to limit findings matching f, newest first,
// without the total count. The dashboard aggregates from it and needs no count.
func (d *DB) ListFindingsFiltered(f FindingFilter, limit int) ([]*DBFinding, error) {
	if limit <= 0 {
		limit = 500
	}
	f, err := d.applyAssetScope(f)
	if err != nil {
		return nil, err
	}
	where, args := f.where()
	q := fmt.Sprintf(`
		SELECT %s
		FROM findings f
		LEFT JOIN tasks t ON f.task_id = t.id%s
		ORDER BY %s
		LIMIT $%d`, findingSelectCols, where, f.orderBy(), len(args)+1)
	rows, err := d.Query(q, append(args, limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFindings(rows)
}

// orderBy is the list order: severity first when asked, newest first otherwise.
func (f FindingFilter) orderBy() string {
	if f.Sort == "severity" {
		// critical > high > medium > low > others, then newest first.
		return `CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, f.created_at DESC, f.id DESC`
	}
	return "f.created_at DESC, f.id DESC"
}

// FindingGroup is one task-level bucket in the global findings view. TaskID is
// nil for both findings that never had a task and findings retained after task
// deletion; those records intentionally share one "unassigned/deleted" bucket.
type FindingGroup struct {
	TaskID          *int64    `json:"task_id"`
	TaskName        string    `json:"task_name"` // optional task name; empty = unnamed
	TaskDescription string    `json:"task_description"`
	TaskStatus      string    `json:"task_status"`
	Count           int       `json:"count"`
	Critical        int       `json:"critical"`
	High            int       `json:"high"`
	Medium          int       `json:"medium"`
	Low             int       `json:"low"`
	LastFoundAt     time.Time `json:"last_found_at"`
}

// ListFindingGroups returns a page of task groups matching the same filters as
// ListFindingsPage. The group count and finding count are independent totals so
// clients can page groups without losing the exact export/selection count.
func (d *DB) ListFindingGroups(f FindingFilter, page, pageSize int) ([]FindingGroup, int, int, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	f, err := d.applyAssetScope(f)
	if err != nil {
		return nil, 0, 0, err
	}
	where, args := f.where()
	grouped := ` FROM findings f LEFT JOIN tasks t ON f.task_id=t.id` + where +
		` GROUP BY t.id, t.name, t.description, t.status, t.paused, t.queued`

	var groupTotal, findingTotal int
	countQuery := `SELECT COUNT(*), COALESCE(SUM(finding_count),0) FROM (` +
		`SELECT COUNT(*) AS finding_count` + grouped + `) grouped_findings`
	if err := d.QueryRow(countQuery, args...).Scan(&groupTotal, &findingTotal); err != nil {
		return nil, 0, 0, err
	}
	if groupTotal == 0 || page > (groupTotal-1)/pageSize+1 {
		return []FindingGroup{}, groupTotal, findingTotal, nil
	}

	order := "MAX(f.created_at) DESC, t.id DESC NULLS LAST"
	if f.Sort == "severity" {
		order = `MAX(CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END) DESC, MAX(f.created_at) DESC, t.id DESC NULLS LAST`
	}
	pageArgs := append(append([]any{}, args...), pageSize, (page-1)*pageSize)
	query := fmt.Sprintf(`SELECT t.id, COALESCE(t.name,''), COALESCE(t.description,''), COALESCE(
		CASE
			WHEN t.status IN ('done','failed','timeout') THEN t.status
			WHEN t.queued THEN 'queued'
			WHEN t.paused THEN 'paused'
			ELSE t.status
		END, ''),
		COUNT(*),
		COUNT(*) FILTER (WHERE f.severity='critical'),
		COUNT(*) FILTER (WHERE f.severity='high'),
		COUNT(*) FILTER (WHERE f.severity='medium'),
		COUNT(*) FILTER (WHERE f.severity='low'),
		MAX(f.created_at)%s
		ORDER BY %s LIMIT $%d OFFSET $%d`, grouped, order, len(args)+1, len(args)+2)
	rows, err := d.Query(query, pageArgs...)
	if err != nil {
		return nil, 0, 0, err
	}
	defer rows.Close()
	groups := []FindingGroup{}
	for rows.Next() {
		var group FindingGroup
		var taskID sql.NullInt64
		if err := rows.Scan(&taskID, &group.TaskName, &group.TaskDescription, &group.TaskStatus, &group.Count,
			&group.Critical, &group.High, &group.Medium, &group.Low, &group.LastFoundAt); err != nil {
			return nil, 0, 0, err
		}
		if taskID.Valid {
			id := taskID.Int64
			group.TaskID = &id
		}
		groups = append(groups, group)
	}
	return groups, groupTotal, findingTotal, rows.Err()
}

// ErrFindingOriginUnavailable means a retained finding no longer has a live
// owning task and finding node from which a follow-up intent can be derived.
var ErrFindingOriginUnavailable = errors.New("finding origin is no longer available")

// AddFindingFollowUpIntent atomically creates a priority-10 human intent from a
// live finding node, copies that finding's asset anchors, records the
// finding --derived_from--> intent lineage edge, and persists its audit activity.
// The returned activity is the committed row and can be broadcast as-is without
// calling AppendActivity again.
func (s *ExplorationStore) AddFindingFollowUpIntent(findingID, findingNodeID int64, description string, audit Activity) (int64, Activity, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, Activity{}, err
	}
	defer tx.Rollback()

	var liveNodeID int64
	err = tx.QueryRow(`SELECT n.id
		FROM findings f
		JOIN tasks t ON t.id=f.task_id
		JOIN exploration_nodes n ON n.id=f.node_id AND n.exploration_id=t.exploration_id
		WHERE f.id=$1 AND f.node_id=$2 AND t.exploration_id=$3 AND n.kind='finding'
		FOR SHARE OF f, t, n`, findingID, findingNodeID, s.expID).Scan(&liveNodeID)
	if err == sql.ErrNoRows {
		return 0, Activity{}, ErrFindingOriginUnavailable
	}
	if err != nil {
		return 0, Activity{}, err
	}

	anchors := []int64{}
	anchorRows, err := tx.Query(`SELECT asset_id FROM exploration_anchors WHERE node_id=$1 ORDER BY asset_id`, liveNodeID)
	if err != nil {
		return 0, Activity{}, err
	}
	for anchorRows.Next() {
		var assetID int64
		if err := anchorRows.Scan(&assetID); err != nil {
			anchorRows.Close()
			return 0, Activity{}, err
		}
		anchors = append(anchors, assetID)
	}
	if err := anchorRows.Err(); err != nil {
		anchorRows.Close()
		return 0, Activity{}, err
	}
	if err := anchorRows.Close(); err != nil {
		return 0, Activity{}, err
	}

	payload := map[string]any{
		"summary":                description,
		"source_finding_id":      findingID,
		"source_finding_node_id": liveNodeID,
	}
	if len(anchors) > 0 {
		payload["asset_ids"] = anchors
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return 0, Activity{}, err
	}
	var intentID int64
	if err := tx.QueryRow(`INSERT INTO exploration_nodes(exploration_id,kind,payload,priority,state,origin)
		VALUES ($1,'intent',$2,10,'open','human') RETURNING id`, s.expID, raw).Scan(&intentID); err != nil {
		return 0, Activity{}, err
	}
	if _, err := tx.Exec(`INSERT INTO exploration_anchors(node_id,asset_id)
		SELECT $1, asset_id FROM exploration_anchors WHERE node_id=$2
		ON CONFLICT DO NOTHING`, intentID, liveNodeID); err != nil {
		return 0, Activity{}, err
	}
	if _, err := tx.Exec(`INSERT INTO exploration_edges(exploration_id,src_id,rel,dst_id)
		VALUES ($1,$2,$3,$4)`, s.expID, liveNodeID, RelDerivedFrom, intentID); err != nil {
		return 0, Activity{}, err
	}

	audit.NodeID = &intentID
	if summary := strings.TrimSpace(audit.Summary); summary != "" {
		audit.Summary = fmt.Sprintf("%s #%d", summary, intentID)
	} else {
		audit.Summary = ""
	}
	metadata := audit.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	if err := tx.QueryRow(`
INSERT INTO activity(exploration_id, node_id, worker, kind, tool, tool_use_id, is_error, summary, detail, metadata, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),$7,NULLIF($8,''),NULLIF($9,''),$10,$11,$12,$13,$14)
RETURNING id, created_at`, s.expID, audit.NodeID, utf8Clean(audit.Worker), utf8Clean(audit.Kind), utf8Clean(audit.Tool), utf8Clean(audit.ToolUseID), audit.IsError,
		utf8Clean(audit.Summary), utf8Clean(audit.Detail), metadata, audit.InputTokens, audit.OutputTokens, audit.CacheReadTokens, audit.CacheWriteTokens).
		Scan(&audit.ID, &audit.CreatedAt); err != nil {
		return 0, Activity{}, err
	}
	audit.Metadata = metadata
	if err := tx.Commit(); err != nil {
		return 0, Activity{}, err
	}
	return intentID, audit, nil
}

// ListFindingsForExport returns findings for the findings page's export
// function, carrying the full report field and unpaginated. When ids is
// non-empty it exports exactly that set of finding ids (selected export),
// ignoring filter; when ids is empty it exports by filter (the current
// filter/everything). The result is ordered by severity descending, then time
// descending, matching the grouping order of the "export summary report".
func (d *DB) ListFindingsForExport(f FindingFilter, ids []int64) ([]*DBFinding, error) {
	const order = `ORDER BY CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, f.created_at DESC`
	cols := findingSelectCols + `, COALESCE(f.report, '')`

	var q string
	var args []any
	if len(ids) > 0 {
		ph := make([]string, len(ids))
		for i, id := range ids {
			ph[i] = fmt.Sprintf("$%d", i+1)
			args = append(args, id)
		}
		q = `SELECT ` + cols + `
			FROM findings f
			LEFT JOIN tasks t ON f.task_id = t.id
			WHERE f.id IN (` + strings.Join(ph, ",") + `)
			` + order
	} else {
		scoped, err := d.applyAssetScope(f)
		if err != nil {
			return nil, err
		}
		where, wargs := scoped.where()
		q = `SELECT ` + cols + `
			FROM findings f
			LEFT JOIN tasks t ON f.task_id = t.id` + where + `
			` + order
		args = wargs
	}

	rows, err := d.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*DBFinding
	for rows.Next() {
		f := &DBFinding{}
		var aidsJSON string
		if err := rows.Scan(&f.ID, &f.TaskID, &f.NodeID, &f.VulnClass, &f.Name, &f.Severity,
			&f.Summary, &f.Evidence, &f.Worker, &aidsJSON, &f.Status, &f.ReportState, &f.CreatedAt,
			&f.TaskDescription, &f.EvidenceVersion, &f.ReportEvidenceVersion, &f.PoELevel, &f.VerificationStatus, &f.VerificationNote, &f.Counterevidence, &f.ConfidenceRationale, &f.TrafficCount, &f.Report); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(aidsJSON), &f.AssetIDs)
		out = append(out, f)
	}
	return out, rows.Err()
}

// FindingStats is the whole-table aggregate powering the findings page's stat
// cards and vuln-class filter — computed server-side so it stays exact
// regardless of pagination.
type FindingStats struct {
	Total       int                 `json:"total"`
	Pending     int                 `json:"pending"`
	Submitted   int                 `json:"submitted"`
	Accepted    int                 `json:"accepted"`
	Critical    int                 `json:"critical"`
	High        int                 `json:"high"`
	Medium      int                 `json:"medium"`
	Low         int                 `json:"low"`
	VulnClasses []string            `json:"vulnclasses"`
	Tasks       []FindingTaskOption `json:"tasks"` // tasks that have findings (for the "by task" dropdown)
}

// FindingTaskOption is one entry in the findings page's task filter: a task that
// has at least one finding, with its description and finding count. Description
// is empty when the task has since been deleted (finding rows persist), so the
// frontend falls back to the id.
type FindingTaskOption struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"` // optional task name; empty = unnamed
	Description string `json:"description"`
	Count       int    `json:"count"`
}

// FindingStats returns whole-table counts (by severity, pending, and report
// stage) and the sorted set of distinct vuln classes.
func (d *DB) FindingStats() (*FindingStats, error) {
	return d.FindingStatsForCompany("")
}

// FindingStatsForCompany is FindingStats narrowed by the Company rule of
// FindingFilter, so the stat cards count the same findings as the list. Empty
// company = whole table. A company view leaves out archived (cold) tasks: their
// aggregates carry no asset or company attribution.
func (d *DB) FindingStatsForCompany(company string) (*FindingStats, error) {
	st := &FindingStats{VulnClasses: []string{}, Tasks: []FindingTaskOption{}}
	f, err := d.resolveCompany(FindingFilter{Company: company})
	if err != nil {
		return nil, err
	}
	where, args := f.where()
	and := " WHERE "
	if where != "" {
		and = where + " AND "
	}
	const from = ` FROM findings f LEFT JOIN tasks t ON f.task_id = t.id`
	err = d.QueryRow(`SELECT
		COUNT(*),
		COUNT(*) FILTER (WHERE f.status = 'pending'),
		COUNT(*) FILTER (WHERE f.report_state = 'submitted'),
		COUNT(*) FILTER (WHERE f.report_state = 'accepted'),
		COUNT(*) FILTER (WHERE f.severity = 'critical'),
		COUNT(*) FILTER (WHERE f.severity = 'high'),
		COUNT(*) FILTER (WHERE f.severity = 'medium'),
		COUNT(*) FILTER (WHERE f.severity = 'low')`+from+where, args...).Scan(&st.Total, &st.Pending, &st.Submitted, &st.Accepted, &st.Critical, &st.High, &st.Medium, &st.Low)
	if err != nil {
		return nil, err
	}
	rows, err := d.Query(`SELECT DISTINCT f.vulnclass`+from+and+`f.vulnclass <> '' ORDER BY f.vulnclass`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var vc string
		if err := rows.Scan(&vc); err != nil {
			return nil, err
		}
		st.VulnClasses = append(st.VulnClasses, vc)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Task dropdown: tasks that have findings, with description (empty after the
	// task is deleted; the frontend falls back to the id) and count, the most
	// recently found first.
	trows, err := d.Query(`SELECT f.task_id, COALESCE(t.name, ''), COALESCE(t.description, ''), COUNT(*)`+from+and+`f.task_id IS NOT NULL
		GROUP BY f.task_id, t.name, t.description
		ORDER BY MAX(f.created_at) DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer trows.Close()
	for trows.Next() {
		var opt FindingTaskOption
		if err := trows.Scan(&opt.ID, &opt.Name, &opt.Description, &opt.Count); err != nil {
			return nil, err
		}
		st.Tasks = append(st.Tasks, opt)
	}
	if err := trows.Err(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(company) != "" {
		return st, nil
	}
	archived, err := d.archivedTaskAggregates()
	if err != nil {
		return nil, err
	}
	vulnclasses := make(map[string]bool, len(st.VulnClasses))
	for _, vulnclass := range st.VulnClasses {
		vulnclasses[vulnclass] = true
	}
	for _, aggregate := range archived {
		cold := aggregate.FindingStats
		st.Total += cold.Total
		st.Pending += cold.Pending
		st.Submitted += cold.Submitted
		st.Accepted += cold.Accepted
		st.Critical += cold.Critical
		st.High += cold.High
		st.Medium += cold.Medium
		st.Low += cold.Low
		for _, vulnclass := range cold.VulnClasses {
			if vulnclass != "" {
				vulnclasses[vulnclass] = true
			}
		}
	}
	st.VulnClasses = st.VulnClasses[:0]
	for vulnclass := range vulnclasses {
		st.VulnClasses = append(st.VulnClasses, vulnclass)
	}
	sort.Strings(st.VulnClasses)
	return st, nil
}

// GetFinding returns a single finding row (with task_description joined and the
// full Markdown report), or nil when no row has that id. Unlike the list queries
// it also selects `report` — that column is only needed on the detail page.
func (d *DB) GetFinding(id int64) (*DBFinding, error) {
	f := &DBFinding{}
	var aidsJSON string
	err := d.QueryRow(`SELECT `+findingSelectCols+`, COALESCE(f.report, '')
		FROM findings f
		LEFT JOIN tasks t ON f.task_id = t.id
		WHERE f.id = $1`, id).Scan(
		&f.ID, &f.TaskID, &f.NodeID, &f.VulnClass, &f.Name, &f.Severity,
		&f.Summary, &f.Evidence, &f.Worker, &aidsJSON, &f.Status, &f.ReportState, &f.CreatedAt,
		&f.TaskDescription, &f.EvidenceVersion, &f.ReportEvidenceVersion, &f.PoELevel, &f.VerificationStatus, &f.VerificationNote, &f.Counterevidence, &f.ConfidenceRationale, &f.TrafficCount, &f.Report)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(aidsJSON), &f.AssetIDs)
	return f, nil
}

// DeleteFinding removes a finding entirely: the standalone findings row and its
// originating exploration node (kind='finding'), so it disappears from the
// findings list, the per-task Findings tab, and the exploration graph alike.
// Deleting the node cascades its edges + node_assets and nulls any activity
// referencing it. Returns rows affected (0 = no finding with that id).
func (d *DB) DeleteFinding(id int64) (n int64, err error) {
	err = d.WithEvidenceTx(context.Background(), func(tx *sql.Tx) error {
		if err := LockFindingEvidenceTx(tx, id, nil); err != nil {
			if errors.Is(err, ErrFindingNotFound) {
				return nil
			}
			return err
		}
		var nodeID sql.NullInt64
		if err := tx.QueryRow(`DELETE FROM findings WHERE id=$1 RETURNING node_id`, id).Scan(&nodeID); err != nil {
			return err
		}
		if nodeID.Valid {
			if _, err := tx.Exec(`DELETE FROM exploration_nodes WHERE id=$1 AND kind='finding'`, nodeID.Int64); err != nil {
				return err
			}
		}
		n = 1
		return nil
	})
	return
}

// DeleteFindingsByTask removes all findings rows of a task. The originating
// exploration finding nodes are cascade-deleted separately when the task's
// exploration subgraph is dropped. Returns rows deleted.
func (d *DB) DeleteFindingsByTask(taskID int64) (int64, error) {
	res, err := d.Exec(`DELETE FROM findings WHERE task_id=$1`, taskID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// SetFindingStatus updates one finding's triage state and mirrors it onto the
// originating exploration node's payload under "status" (same path as
// setFindingCol). Agents read that node; the findings row alone is not enough.
// Returns rows affected.
//
// Low-level setter: it does not register a push event. Production code changing
// status should go through SetFindingStatusWithNotify — calling this function
// directly silently disables the "status change push". It is kept so tests that
// do not care about notifications (parameter validation, retest flows) can
// drive the status on their own.
func (d *DB) SetFindingStatus(id int64, status string) (int64, error) {
	ctx := context.Background()
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var nodeID sql.NullInt64
	err = tx.QueryRowContext(ctx, `UPDATE findings SET status=$1 WHERE id=$2 RETURNING node_id`, status, id).Scan(&nodeID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if nodeID.Valid {
		if _, err := tx.ExecContext(ctx, `UPDATE exploration_nodes
			SET payload = jsonb_set(payload, '{status}', to_jsonb($1::text))
			WHERE id = $2`, status, nodeID.Int64); err != nil {
			return 0, err
		}
		if FindingStatusInvalidatesGoal(status) {
			if err := reopenGoalsProvedByNodeTx(ctx, tx, nodeID.Int64); err != nil {
				return 0, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return 1, nil
}

// SetFindingReportState updates one finding's report stage and mirrors it onto
// the originating exploration node's payload under "report_state". It does not
// register a status-change notification: report_state is a workflow stage, not
// a triage verdict. Returns rows affected.
func (d *DB) SetFindingReportState(id int64, state string) (int64, error) {
	return d.setFindingCol(id, "report_state", "report_state", state)
}

// FindingReportStateBatchResult is one id's outcome in a bulk report-stage update.
type FindingReportStateBatchResult struct {
	ID      int64  `json:"id"`
	From    string `json:"from,omitempty"`
	Found   bool   `json:"found"`
	Changed bool   `json:"changed"`
}

// SetFindingReportStates updates several findings to the same report stage in
// one transaction. Unknown ids come back as found=false instead of hiding the
// others; a database error rolls the whole batch back. No notification event
// is written — status-change pushes stay on findings.status.
func (d *DB) SetFindingReportStates(ctx context.Context, ids []int64, state string) ([]FindingReportStateBatchResult, error) {
	out := make([]FindingReportStateBatchResult, 0, len(ids))
	err := d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		for _, id := range ids {
			from, found, changed, err := setFindingReportStateTx(ctx, tx, id, state)
			if err != nil {
				return err
			}
			out = append(out, FindingReportStateBatchResult{ID: id, From: from, Found: found, Changed: changed})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func setFindingReportStateTx(ctx context.Context, tx *sql.Tx, id int64, state string) (from string, found bool, changed bool, err error) {
	var nodeID sql.NullInt64
	scanErr := tx.QueryRowContext(ctx, `SELECT COALESCE(report_state,'none'), node_id
FROM findings WHERE id=$1 FOR UPDATE`, id).Scan(&from, &nodeID)
	if scanErr == sql.ErrNoRows {
		return "", false, false, nil
	}
	if scanErr != nil {
		return "", false, false, scanErr
	}
	found = true
	if from == state {
		return from, true, false, nil
	}
	if _, err := tx.ExecContext(ctx, `UPDATE findings SET report_state=$2 WHERE id=$1`, id, state); err != nil {
		return from, true, false, err
	}
	if nodeID.Valid {
		if _, err := tx.ExecContext(ctx, `UPDATE exploration_nodes
			SET payload = jsonb_set(payload, '{report_state}', to_jsonb($1::text))
			WHERE id = $2`, state, nodeID.Int64); err != nil {
			return from, true, false, err
		}
	}
	return from, true, true, nil
}

// SetFindingReportByNodeID sets the Markdown report on the standalone finding row
// whose node_id matches — report_finding returns that node id, so an agent tool
// can address the finding it just created. Returns rows affected (0 when no row).
func (d *DB) SetFindingReportByNodeID(nodeID int64, report string) (int64, error) {
	return d.SetFindingReportVersionByNodeID(context.Background(), nodeID, report, nil)
}

// setFindingCol updates one text column on the standalone finding row AND mirrors
// the new value into the originating exploration node's payload under jsonKey, so the
// per-task Findings tab (which reads the node payload, not this table) stays in sync.
// Returns rows affected (0 when no finding has that id); the node sync is best-effort.
// col and jsonKey MUST be trusted constants (they are interpolated into SQL) — never
// pass user input.
func (d *DB) setFindingCol(id int64, col, jsonKey, val string) (int64, error) {
	var nodeID *int64
	err := d.QueryRow(`UPDATE findings SET `+col+`=$1 WHERE id=$2 RETURNING node_id`, val, id).Scan(&nodeID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if nodeID != nil {
		_, _ = d.Exec(`UPDATE exploration_nodes
			SET payload = jsonb_set(payload, '{`+jsonKey+`}', to_jsonb($1::text))
			WHERE id = $2`, val, *nodeID)
	}
	return 1, nil
}

// SetFindingSeverity updates one finding's severity (+ node payload sync). Returns
// rows affected (0 when no finding has that id).
func (d *DB) SetFindingSeverity(id int64, severity string) (int64, error) {
	return d.setFindingCol(id, "severity", "severity", severity)
}

// SetFindingName updates one finding's vulnerability name (+ node payload
// sync). Empty name is allowed — the frontend falls back to the vuln class for
// display.
func (d *DB) SetFindingName(id int64, name string) (int64, error) {
	return d.setFindingCol(id, "name", "name", name)
}

// SetFindingVulnClass updates one finding's vulnerability class (+ node payload sync).
func (d *DB) SetFindingVulnClass(id int64, vulnclass string) (int64, error) {
	return d.setFindingCol(id, "vulnclass", "vulnclass", vulnclass)
}

// FindingMeta is the standalone-row data (id, triage state, anchored assets) the
// per-task view grafts onto its exploration-node findings.
//
// It stays deliberately lean: the task findings list calls FindingMetaByNodeID for
// up to a few hundred nodes per page and renders none of the proof-strength fields,
// so the multi-KB report body and the two prose attestations must not ride along on
// this query. The report path uses FindingQualityByNodeID instead.
type FindingMeta struct {
	TrafficCount int

	ID       int64
	Status   string
	AssetIDs []int64
}

// FindingQuality is the report-only view of one standalone row: the triage meta
// plus the proof-strength fields, the reporter-written body and the two evidence
// versions that decide whether that body still describes the current evidence.
//
// VerificationNote / Counterevidence / ConfidenceRationale are optional; "" means
// "not given" and stays distinguishable from an empty assertion. Report "" means
// the reporter never wrote one.
type FindingQuality struct {
	FindingMeta

	PoeLevel              int
	VerificationStatus    string
	VerificationNote      string
	Counterevidence       string
	ConfidenceRationale   string
	Report                string
	EvidenceVersion       int64
	ReportEvidenceVersion int64
}

// ReportStale reports whether the stored report predates the evidence it
// describes: it was written against an older evidence version, so it must be read
// as outdated rather than as the current claim.
func (q FindingQuality) ReportStale() bool {
	return q.Report != "" && q.EvidenceVersion != q.ReportEvidenceVersion
}

// FindingMetaByNodeID maps a task's finding node ids to their standalone-row
// metadata (status + anchored asset ids) via the asset store, so callers holding
// only an AssetStore (e.g. the agent ToolSet) can reach it without a raw *DB.
func (a *AssetStore) FindingMetaByNodeID(taskID int64) (map[int64]FindingMeta, error) {
	return a.db.FindingMetaByNodeID(taskID)
}

// FindingMetaByNodeID maps a task's finding node ids to their standalone-row
// metadata, so the per-task view (which reads exploration nodes) can show and
// edit the same status — and the same anchored assets — as the global findings
// page.
func (d *DB) FindingMetaByNodeID(taskID int64) (map[int64]FindingMeta, error) {
	out := map[int64]FindingMeta{}
	if taskID <= 0 {
		return out, nil
	}
	rows, err := d.Query(`SELECT node_id, id, COALESCE(status,'pending'), asset_ids, `+findingTrafficCountCol+`
		FROM findings
		WHERE task_id=$1 AND node_id IS NOT NULL`, taskID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var nid int64
		var m FindingMeta
		var aidsJSON string
		if err := rows.Scan(&nid, &m.ID, &m.Status, &aidsJSON, &m.TrafficCount); err != nil {
			return out, err
		}
		_ = json.Unmarshal([]byte(aidsJSON), &m.AssetIDs)
		out[nid] = m
	}
	return out, rows.Err()
}

// findingTrafficCountCol is the per-row bound-evidence count, spelled once so both
// node-id lookups count the same way.
const findingTrafficCountCol = `(SELECT count(*) FROM finding_traffic_bindings b WHERE b.finding_id=findings.id)`

// FindingQualityByNodeID maps a task's finding node ids to everything the report
// renders about them: triage meta, poe level, verification state and note, the two
// attestations, the reporter-written body and both evidence versions. One query,
// because the report shows all of it together and a report render is a single
// on-demand document.
//
// The column order below is load-bearing: it is the FindingMetaByNodeID order
// followed by the report-only columns, so the Scan target order can be checked
// column by column against the SELECT instead of being guessed.
func (d *DB) FindingQualityByNodeID(taskID int64) (map[int64]FindingQuality, error) {
	out := map[int64]FindingQuality{}
	if taskID <= 0 {
		return out, nil
	}
	rows, err := d.Query(`SELECT node_id, id, COALESCE(status,'pending'), asset_ids, `+findingTrafficCountCol+`,
			COALESCE(poe_level,0), COALESCE(verification_status,'unverified'), COALESCE(verification_note,''), COALESCE(counterevidence,''), COALESCE(confidence_rationale,''),
			evidence_version, report_evidence_version, COALESCE(report,'')
		FROM findings
		WHERE task_id=$1 AND node_id IS NOT NULL`, taskID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var nid int64
		var q FindingQuality
		var aidsJSON string
		if err := rows.Scan(&nid, &q.ID, &q.Status, &aidsJSON, &q.TrafficCount,
			&q.PoeLevel, &q.VerificationStatus, &q.VerificationNote, &q.Counterevidence, &q.ConfidenceRationale,
			&q.EvidenceVersion, &q.ReportEvidenceVersion, &q.Report); err != nil {
			return out, err
		}
		_ = json.Unmarshal([]byte(aidsJSON), &q.AssetIDs)
		out[nid] = q
	}
	return out, rows.Err()
}
