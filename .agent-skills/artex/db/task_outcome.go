package db

import "context"

// The per-task outcome card is the baseline layer for RSI comparisons. It
// consolidates what a task produced and what it cost so a later harness or
// lesson change can be judged against a number instead of an impression.
// Metric selection follows harness2 (Google Research, Apache-2.0,
// arXiv 2610.14224) and the task-gain / retained-gain / improver-gain taxonomy
// used by the awesome-rsi list (lobehub).

// TaskOutcomeFindings is the finding disposition and severity split.
type TaskOutcomeFindings struct {
	Total         int `json:"total"`
	Confirmed     int `json:"confirmed"` // confirmed, resolved, or fixed
	Open          int `json:"open"`      // pending or in_progress
	FalsePositive int `json:"false_positive"`
	Duplicate     int `json:"duplicate"`
	Critical      int `json:"critical"` // confirmed only
	High          int `json:"high"`
	Medium        int `json:"medium"`
	Low           int `json:"low"`
}

// TaskOutcomeRetests is the retest verdict split for this task's findings.
type TaskOutcomeRetests struct {
	Reproduced   int `json:"reproduced"`
	Fixed        int `json:"fixed"`
	Inconclusive int `json:"inconclusive"`
}

// TaskOutcomeTokens is the task's result-row token total.
type TaskOutcomeTokens struct {
	InputTokens      int `json:"input_tokens"`
	OutputTokens     int `json:"output_tokens"`
	CacheReadTokens  int `json:"cache_read_tokens"`
	CacheWriteTokens int `json:"cache_write_tokens"`
}

// TaskOutcome is one task's production and cost baseline.
type TaskOutcome struct {
	TaskID      int64               `json:"task_id"`
	Status      string              `json:"status"`
	CategoryID  int64               `json:"category_id"`
	CompanyID   int64               `json:"company_id"`
	Findings    TaskOutcomeFindings `json:"findings"`
	Retests     TaskOutcomeRetests  `json:"retests"`
	Tokens      TaskOutcomeTokens   `json:"tokens"`
	ToolCalls   int                 `json:"tool_calls"`
	SkillMisses int                 `json:"skill_misses"`
	WallSeconds int64               `json:"wall_seconds"`
}

// TaskOutcome returns the outcome card for one live task. sql.ErrNoRows means
// the task does not exist or is deleted.
func (d *DB) TaskOutcome(ctx context.Context, taskID int64) (TaskOutcome, error) {
	var o TaskOutcome
	err := d.QueryRowContext(ctx, `
		SELECT t.id, t.status,
		       COALESCE(t.category_id,0), COALESCE(t.company_id,0),
		       COALESCE(f.total,0), COALESCE(f.confirmed,0), COALESCE(f.open,0),
		       COALESCE(f.false_positive,0), COALESCE(f.duplicate,0),
		       COALESCE(f.critical,0), COALESCE(f.high,0),
		       COALESCE(f.medium,0), COALESCE(f.low,0),
		       COALESCE(r.reproduced,0), COALESCE(r.fixed,0), COALESCE(r.inconclusive,0),
		       COALESCE(a.input_tokens,0), COALESCE(a.output_tokens,0),
		       COALESCE(a.cache_read_tokens,0), COALESCE(a.cache_write_tokens,0),
		       COALESCE(tu.calls,0), COALESCE(su.misses,0),
		       GREATEST(0, EXTRACT(EPOCH FROM
		           (COALESCE(t.completed_at, now()) - COALESCE(t.first_run_at, t.created_at)))::bigint)
		FROM tasks t
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS total,
			       COUNT(*) FILTER (WHERE status IN ('confirmed','resolved','fixed')) AS confirmed,
			       COUNT(*) FILTER (WHERE status IN ('pending','in_progress'))       AS open,
			       COUNT(*) FILTER (WHERE status='false_positive')                   AS false_positive,
			       COUNT(*) FILTER (WHERE status='duplicate')                        AS duplicate,
			       COUNT(*) FILTER (WHERE status IN ('confirmed','resolved','fixed') AND severity='critical') AS critical,
			       COUNT(*) FILTER (WHERE status IN ('confirmed','resolved','fixed') AND severity='high')     AS high,
			       COUNT(*) FILTER (WHERE status IN ('confirmed','resolved','fixed') AND severity='medium')   AS medium,
			       COUNT(*) FILTER (WHERE status IN ('confirmed','resolved','fixed') AND severity='low')      AS low
			FROM findings
			WHERE task_id=t.id
		) f ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE fr.verdict='reproduced')   AS reproduced,
			       COUNT(*) FILTER (WHERE fr.verdict='fixed')        AS fixed,
			       COUNT(*) FILTER (WHERE fr.verdict='inconclusive') AS inconclusive
			FROM finding_retests fr
			JOIN findings f2 ON f2.id=fr.finding_id
			WHERE f2.task_id=t.id
		) r ON true
		LEFT JOIN LATERAL (
			SELECT SUM(input_tokens) AS input_tokens,
			       SUM(output_tokens) AS output_tokens,
			       SUM(cache_read_tokens) AS cache_read_tokens,
			       SUM(cache_write_tokens) AS cache_write_tokens
			FROM activity
			WHERE exploration_id=t.exploration_id AND kind='result'
		) a ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS calls FROM tool_usage WHERE task_id=t.id
		) tu ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS misses FROM skill_usage WHERE task_id=t.id AND NOT found
		) su ON true
		WHERE t.id=$1 AND t.deleted_at IS NULL`, taskID).Scan(
		&o.TaskID, &o.Status,
		&o.CategoryID, &o.CompanyID,
		&o.Findings.Total, &o.Findings.Confirmed, &o.Findings.Open,
		&o.Findings.FalsePositive, &o.Findings.Duplicate,
		&o.Findings.Critical, &o.Findings.High, &o.Findings.Medium, &o.Findings.Low,
		&o.Retests.Reproduced, &o.Retests.Fixed, &o.Retests.Inconclusive,
		&o.Tokens.InputTokens, &o.Tokens.OutputTokens,
		&o.Tokens.CacheReadTokens, &o.Tokens.CacheWriteTokens,
		&o.ToolCalls, &o.SkillMisses, &o.WallSeconds,
	)
	return o, err
}
