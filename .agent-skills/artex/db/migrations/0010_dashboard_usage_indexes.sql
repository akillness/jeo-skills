-- Partial covering indexes proved via EXPLAIN (ANALYZE, BUFFERS) on seeded
-- production-shaped tables (P3.6 dashboard & usage query hygiene):
--
-- 1. idx_act_result_created: TokenDailyAll (db/exploration.go) aggregates
--    activity WHERE kind='result' AND created_at >= now() - interval. The
--    existing idx_act_result_usage is keyed on exploration_id, so date-bounded
--    global daily rollups previously fell back to a bitmap heap scan across all
--    result rows (~100x fewer shared buffers with an index-only scan).
-- 2. idx_conv_act_result: ConversationTokenSummaries (db/conversation.go,
--    polled every 5s by the dashboard) left-joins conversation_activities on
--    (conversation_id) WHERE kind='result'. Without a partial index on
--    kind='result', every poll sequentially scans the entire
--    conversation_activities table (~65x fewer shared buffers).
-- 3. idx_llm_usage_judge_ts: JudgeUsageStats (db/llm_usage.go) filters
--    llm_usage WHERE worker='judge' (all-time and recent window). Judge rows
--    are a small fraction of the append-only ledger; a partial covering index
--    turns both queries into index-only scans (~60-80x fewer shared buffers).
--
-- Plain CREATE INDEX (migrations run in a transaction at startup before the
-- HTTP server listens). Very large installs can pre-build them online with
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS before upgrading.

CREATE INDEX IF NOT EXISTS idx_act_result_created
    ON activity(created_at)
    INCLUDE (input_tokens, output_tokens, cache_read_tokens)
    WHERE kind = 'result';

CREATE INDEX IF NOT EXISTS idx_conv_act_result
    ON conversation_activities(conversation_id)
    INCLUDE (input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
    WHERE kind = 'result';

CREATE INDEX IF NOT EXISTS idx_llm_usage_judge_ts
    ON llm_usage(ts)
    INCLUDE (input_tokens, output_tokens, cache_read, cache_write)
    WHERE worker = 'judge';
