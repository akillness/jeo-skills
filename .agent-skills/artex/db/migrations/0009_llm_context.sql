-- Opt-in per-call LLM context size telemetry (ARTEX_CONTEXT_TELEMETRY=1).
-- Records only byte sizes, counts, token usage, and metadata — never any
-- prompt, tool, or message content.
CREATE TABLE IF NOT EXISTS llm_context (
    id                       BIGSERIAL PRIMARY KEY,
    ts                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    task_id                  TEXT,
    worker                   TEXT,
    model                    TEXT,
    profile                  TEXT,
    tool_count               INTEGER NOT NULL DEFAULT 0,
    message_count            INTEGER NOT NULL DEFAULT 0,
    system_static_bytes      BIGINT NOT NULL DEFAULT 0,
    system_dynamic_bytes     BIGINT NOT NULL DEFAULT 0,
    tools_bytes              BIGINT NOT NULL DEFAULT 0,
    messages_user_bytes      BIGINT NOT NULL DEFAULT 0,
    messages_assistant_bytes BIGINT NOT NULL DEFAULT 0,
    messages_other_bytes     BIGINT NOT NULL DEFAULT 0,
    tool_result_bytes        BIGINT NOT NULL DEFAULT 0,
    last_message_bytes       BIGINT NOT NULL DEFAULT 0,
    input_tokens             INTEGER NOT NULL DEFAULT 0,
    output_tokens            INTEGER NOT NULL DEFAULT 0,
    cache_read               INTEGER NOT NULL DEFAULT 0,
    cache_write              INTEGER NOT NULL DEFAULT 0,
    status                   TEXT NOT NULL DEFAULT 'ok'
);
CREATE INDEX IF NOT EXISTS idx_llm_context_ts           ON llm_context(ts);
CREATE INDEX IF NOT EXISTS idx_llm_context_task         ON llm_context(task_id);
CREATE INDEX IF NOT EXISTS idx_llm_context_worker_model ON llm_context(worker, model);
