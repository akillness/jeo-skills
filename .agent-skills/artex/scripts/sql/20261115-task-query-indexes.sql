\set ON_ERROR_STOP on
-- Run with psql outside a transaction. Adds indexes without blocking normal DML.
SET lock_timeout = '5s';
SET statement_timeout = '10min';
SET maintenance_work_mem = '128MB';
SET max_parallel_maintenance_workers = 1;

-- db/commands.go joins by tool_use_id without an exploration_id constraint.
-- The existing (exploration_id, tool_use_id, id) index has the wrong leading key.
CREATE INDEX CONCURRENTLY idx_activity_tool_result_lookup
    ON public.activity (tool_use_id) INCLUDE (is_error)
    WHERE kind = 'tool_result';

-- Match TokenByModel's actual COALESCE(task_id, '') predicate and cover its sums.
CREATE INDEX CONCURRENTLY idx_llm_usage_task_model_tokens
    ON public.llm_usage ((COALESCE(task_id, '')), model)
    INCLUDE (task_id, input_tokens, output_tokens, cache_read, cache_write);

-- Mark committed append-only pages visible so the covering index can avoid heap reads.
SET vacuum_cost_delay = '2ms';
SET vacuum_cost_limit = 1000;
VACUUM (ANALYZE) public.llm_usage;
