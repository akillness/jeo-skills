
CREATE TABLE IF NOT EXISTS llm_usage (
    id             BIGSERIAL PRIMARY KEY,
    ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
    task_id        TEXT,
    exploration_id BIGINT,
    worker         TEXT,
    model          TEXT,
    profile_name   TEXT,
    latency_ms     INTEGER,
    input_tokens   INTEGER NOT NULL DEFAULT 0,
    output_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_read     INTEGER NOT NULL DEFAULT 0,
    cache_write    INTEGER NOT NULL DEFAULT 0,
    status         TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_task  ON llm_usage(task_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON llm_usage(task_id, model);
CREATE INDEX IF NOT EXISTS idx_llm_usage_exp   ON llm_usage(exploration_id);
