\set ON_ERROR_STOP on
-- Removes only the two indexes introduced by this change; retains table data.
SET lock_timeout = '5s';
SET statement_timeout = '10min';
DROP INDEX CONCURRENTLY IF EXISTS public.idx_activity_tool_result_lookup;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_llm_usage_task_model_tokens;
