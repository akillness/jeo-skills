package db

import (
	"fmt"
	"strings"
)

// LLMContext is one context-size telemetry row, written on every model call while
// telemetry is on (the default; ARTEX_CONTEXT_TELEMETRY=0|false|off|no turns it off).
// It records only byte sizes, counts, token usage,
// and call metadata — never any prompt, tool, or message content.
type LLMContext struct {
	TaskID                 string `json:"task_id"`
	Worker                 string `json:"worker"`
	Model                  string `json:"model"`
	Profile                string `json:"profile"`
	ToolCount              int    `json:"tool_count"`
	MessageCount           int    `json:"message_count"`
	SystemStaticBytes      int64  `json:"system_static_bytes"`
	SystemDynamicBytes     int64  `json:"system_dynamic_bytes"`
	ToolsBytes             int64  `json:"tools_bytes"`
	MessagesUserBytes      int64  `json:"messages_user_bytes"`
	MessagesAssistantBytes int64  `json:"messages_assistant_bytes"`
	MessagesOtherBytes     int64  `json:"messages_other_bytes"`
	ToolResultBytes        int64  `json:"tool_result_bytes"`
	LastMessageBytes       int64  `json:"last_message_bytes"`
	InputTokens            int    `json:"input_tokens"`
	OutputTokens           int    `json:"output_tokens"`
	CacheRead              int    `json:"cache_read"`
	CacheWrite             int    `json:"cache_write"`
	Status                 string `json:"status"`
}

// TotalMeasuredBytes returns the partition sum of request section bytes
// (excluding ToolResultBytes, which is a subset of MessagesUserBytes).
func (c LLMContext) TotalMeasuredBytes() int64 {
	return c.SystemStaticBytes + c.SystemDynamicBytes + c.ToolsBytes +
		c.MessagesUserBytes + c.MessagesAssistantBytes + c.MessagesOtherBytes
}

// LLMContextSectionShares holds the pro-rata share (0..1) of real input_tokens
// attributed to each request section by byte proportion. The six partition
// fields (SystemStatic through MessagesOther) sum to 1.0 whenever at least one
// call has both measured bytes > 0 and input_tokens > 0. ToolResultSubset is an
// informational sub-share of MessagesUser (not added to the sum).
type LLMContextSectionShares struct {
	SystemStatic     float64 `json:"system_static"`
	SystemDynamic    float64 `json:"system_dynamic"`
	Tools            float64 `json:"tools"`
	MessagesUser     float64 `json:"messages_user"`
	MessagesAsst     float64 `json:"messages_assistant"`
	MessagesOther    float64 `json:"messages_other"`
	ToolResultSubset float64 `json:"tool_result_subset"`
}

// ComputeLLMContextShares deterministically allocates each call's real
// input_tokens across sections proportionally to measured bytes, then divides
// each section's attributed tokens by the total attributed input tokens.
// Rows with zero measured bytes or zero input tokens are ignored so they never
// produce NaN or distort the proportions.
func ComputeLLMContextShares(rows []LLMContext) LLMContextSectionShares {
	var (
		totInput float64
		sysStat  float64
		sysDyn   float64
		tools    float64
		msgUser  float64
		msgAsst  float64
		msgOther float64
		toolRes  float64
	)
	for _, r := range rows {
		totalBytes := r.TotalMeasuredBytes()
		if totalBytes <= 0 || r.InputTokens <= 0 {
			continue
		}
		in := float64(r.InputTokens)
		tb := float64(totalBytes)
		totInput += in
		sysStat += in * (float64(r.SystemStaticBytes) / tb)
		sysDyn += in * (float64(r.SystemDynamicBytes) / tb)
		tools += in * (float64(r.ToolsBytes) / tb)
		msgUser += in * (float64(r.MessagesUserBytes) / tb)
		msgAsst += in * (float64(r.MessagesAssistantBytes) / tb)
		msgOther += in * (float64(r.MessagesOtherBytes) / tb)
		toolRes += in * (float64(r.ToolResultBytes) / tb)
	}
	if totInput <= 0 {
		return LLMContextSectionShares{}
	}
	return LLMContextSectionShares{
		SystemStatic:     sysStat / totInput,
		SystemDynamic:    sysDyn / totInput,
		Tools:            tools / totInput,
		MessagesUser:     msgUser / totInput,
		MessagesAsst:     msgAsst / totInput,
		MessagesOther:    msgOther / totInput,
		ToolResultSubset: toolRes / totInput,
	}
}

// LLMContextGroupStat aggregates llm_context rows for one (worker, model) pair.
type LLMContextGroupStat struct {
	Worker              string                  `json:"worker"`
	Model               string                  `json:"model"`
	Calls               int                     `json:"calls"`
	InputTokensTotal    int64                   `json:"input_tokens_total"`
	OutputTokensTotal   int64                   `json:"output_tokens_total"`
	CacheReadTotal      int64                   `json:"cache_read_total"`
	CacheWriteTotal     int64                   `json:"cache_write_total"`
	CacheReadRatio      float64                 `json:"cache_read_ratio"`
	InputP50            float64                 `json:"input_p50"`
	InputP90            float64                 `json:"input_p90"`
	InputP99            float64                 `json:"input_p99"`
	InputMax            int                     `json:"input_max"`
	AvgToolCount        float64                 `json:"avg_tool_count"`
	AvgMessageCount     float64                 `json:"avg_message_count"`
	AvgLastMessageBytes float64                 `json:"avg_last_message_bytes"`
	Shares              LLMContextSectionShares `json:"shares"`
}

// LLMContextTaskStat summarizes context consumption for one task_id.
type LLMContextTaskStat struct {
	TaskID           string                  `json:"task_id"`
	Calls            int                     `json:"calls"`
	InputTokensTotal int64                   `json:"input_tokens_total"`
	CacheReadTotal   int64                   `json:"cache_read_total"`
	CacheReadRatio   float64                 `json:"cache_read_ratio"`
	InputP90         float64                 `json:"input_p90"`
	InputMax         int                     `json:"input_max"`
	Shares           LLMContextSectionShares `json:"shares"`
}

// LLMContextSummary is the aggregation output for Phase A context measurement.
type LLMContextSummary struct {
	ByWorkerModel []LLMContextGroupStat `json:"by_worker_model"`
	TopTasks      []LLMContextTaskStat  `json:"top_tasks"`
}

// LLMContextQuery scopes LLMContextSummary.
type LLMContextQuery struct {
	Days     int    // > 0 restricts to ts >= now() - Days; <= 0 = all time
	TaskID   string // optional exact task_id filter
	TopTasks int    // max rows in TopTasks (default 20, clamped 1..100)
}

// InsertLLMContext appends one context-telemetry row. Best-effort: callers log
// and continue on error so telemetry never breaks an LLM call.
func (d *DB) InsertLLMContext(c *LLMContext) error {
	status := strings.TrimSpace(c.Status)
	if status == "" {
		status = "ok"
	}
	_, err := d.Exec(`
INSERT INTO llm_context(
    task_id, worker, model, profile,
    tool_count, message_count,
    system_static_bytes, system_dynamic_bytes, tools_bytes,
    messages_user_bytes, messages_assistant_bytes, messages_other_bytes,
    tool_result_bytes, last_message_bytes,
    input_tokens, output_tokens, cache_read, cache_write, status
) VALUES (
    NULLIF($1,''), NULLIF($2,''), NULLIF($3,''), NULLIF($4,''),
    $5, $6,
    $7, $8, $9,
    $10, $11, $12,
    $13, $14,
    $15, $16, $17, $18, $19
)`,
		c.TaskID, c.Worker, c.Model, c.Profile,
		c.ToolCount, c.MessageCount,
		c.SystemStaticBytes, c.SystemDynamicBytes, c.ToolsBytes,
		c.MessagesUserBytes, c.MessagesAssistantBytes, c.MessagesOtherBytes,
		c.ToolResultBytes, c.LastMessageBytes,
		c.InputTokens, c.OutputTokens, c.CacheRead, c.CacheWrite, status)
	return err
}

const llmContextTotalBytesExpr = `(system_static_bytes + system_dynamic_bytes + tools_bytes + messages_user_bytes + messages_assistant_bytes + messages_other_bytes)`

// llmContextSharesSelect produces the 7 pro-rata section-share SQL expressions
// matching ComputeLLMContextShares.
const llmContextSharesSelect = `
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (system_static_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0),
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (system_dynamic_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0),
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (tools_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0),
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (messages_user_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0),
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (messages_assistant_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0),
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (messages_other_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0),
	COALESCE(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens * (tool_result_bytes::double precision / ` + llmContextTotalBytesExpr + `::double precision) ELSE 0 END)
	         / NULLIF(SUM(CASE WHEN ` + llmContextTotalBytesExpr + ` > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0), 0)`

// LLMContextSummary aggregates llm_context by (worker, model) and returns the
// top tasks by total input_tokens, with input percentiles (p50/p90/p99),
// pro-rata section shares over real input_tokens, and cache_read/input ratio.
func (d *DB) LLMContextSummary(q LLMContextQuery) (*LLMContextSummary, error) {
	topLimit := q.TopTasks
	if topLimit <= 0 {
		topLimit = 20
	}
	if topLimit > 100 {
		topLimit = 100
	}

	var conds []string
	var args []any
	addCond := func(expr string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(expr, len(args)))
	}
	if q.Days > 0 {
		addCond("ts >= now() - make_interval(days => $%d)", q.Days)
	}
	if tid := strings.TrimSpace(q.TaskID); tid != "" {
		addCond("COALESCE(task_id,'') = $%d", tid)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	out := &LLMContextSummary{
		ByWorkerModel: []LLMContextGroupStat{},
		TopTasks:      []LLMContextTaskStat{},
	}

	groupSQL := `
SELECT COALESCE(NULLIF(worker,''),'(unknown)') AS w,
       COALESCE(NULLIF(model,''),'(unknown)')  AS m,
       COUNT(*),
       COALESCE(SUM(input_tokens), 0),
       COALESCE(SUM(output_tokens), 0),
       COALESCE(SUM(cache_read), 0),
       COALESCE(SUM(cache_write), 0),
       COALESCE(SUM(cache_read)::double precision / NULLIF(SUM(input_tokens)::double precision, 0), 0),
       COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY input_tokens), 0),
       COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY input_tokens), 0),
       COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY input_tokens), 0),
       COALESCE(MAX(input_tokens), 0),
       COALESCE(AVG(tool_count)::double precision, 0),
       COALESCE(AVG(message_count)::double precision, 0),
       COALESCE(AVG(last_message_bytes)::double precision, 0),` + llmContextSharesSelect + `
FROM llm_context` + where + `
GROUP BY w, m
ORDER BY SUM(input_tokens) DESC, w ASC, m ASC`

	rows, err := d.Query(groupSQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var g LLMContextGroupStat
		if err := rows.Scan(
			&g.Worker, &g.Model, &g.Calls,
			&g.InputTokensTotal, &g.OutputTokensTotal, &g.CacheReadTotal, &g.CacheWriteTotal,
			&g.CacheReadRatio,
			&g.InputP50, &g.InputP90, &g.InputP99, &g.InputMax,
			&g.AvgToolCount, &g.AvgMessageCount, &g.AvgLastMessageBytes,
			&g.Shares.SystemStatic, &g.Shares.SystemDynamic, &g.Shares.Tools,
			&g.Shares.MessagesUser, &g.Shares.MessagesAsst, &g.Shares.MessagesOther,
			&g.Shares.ToolResultSubset,
		); err != nil {
			return nil, err
		}
		out.ByWorkerModel = append(out.ByWorkerModel, g)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	taskConds := append([]string{}, conds...)
	taskConds = append(taskConds, "COALESCE(task_id,'') <> ''")
	taskArgs := append([]any{}, args...)
	taskArgs = append(taskArgs, topLimit)
	limitPlaceholder := fmt.Sprintf("$%d", len(taskArgs))

	taskSQL := `
SELECT task_id,
       COUNT(*),
       COALESCE(SUM(input_tokens), 0),
       COALESCE(SUM(cache_read), 0),
       COALESCE(SUM(cache_read)::double precision / NULLIF(SUM(input_tokens)::double precision, 0), 0),
       COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY input_tokens), 0),
       COALESCE(MAX(input_tokens), 0),` + llmContextSharesSelect + `
FROM llm_context
WHERE ` + strings.Join(taskConds, " AND ") + `
GROUP BY task_id
ORDER BY SUM(input_tokens) DESC, task_id ASC
LIMIT ` + limitPlaceholder

	trows, err := d.Query(taskSQL, taskArgs...)
	if err != nil {
		return nil, err
	}
	defer trows.Close()
	for trows.Next() {
		var ts LLMContextTaskStat
		if err := trows.Scan(
			&ts.TaskID, &ts.Calls, &ts.InputTokensTotal, &ts.CacheReadTotal,
			&ts.CacheReadRatio, &ts.InputP90, &ts.InputMax,
			&ts.Shares.SystemStatic, &ts.Shares.SystemDynamic, &ts.Shares.Tools,
			&ts.Shares.MessagesUser, &ts.Shares.MessagesAsst, &ts.Shares.MessagesOther,
			&ts.Shares.ToolResultSubset,
		); err != nil {
			return nil, err
		}
		out.TopTasks = append(out.TopTasks, ts)
	}
	return out, trows.Err()
}
