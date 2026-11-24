
CREATE TABLE IF NOT EXISTS llm_records (
    id            BIGSERIAL PRIMARY KEY,
    ts            TIMESTAMPTZ DEFAULT now(),
    model         TEXT,
    profile_name  TEXT,
    session_id    TEXT,
    task_id       TEXT,
    worker        TEXT,
    latency_ms    INTEGER,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    cache_read    INTEGER,
    cache_write   INTEGER,
    status        TEXT,
    error         TEXT,
    request_body  TEXT,
    response_body TEXT,
    raw_request   TEXT,
    raw_response  TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_records_ts ON llm_records(ts);
CREATE INDEX IF NOT EXISTS idx_llm_records_session ON llm_records(session_id);

ALTER TABLE llm_records ADD COLUMN IF NOT EXISTS task_id TEXT;
ALTER TABLE llm_records ADD COLUMN IF NOT EXISTS worker TEXT;
ALTER TABLE llm_records ADD COLUMN IF NOT EXISTS profile_name TEXT;
ALTER TABLE llm_records ADD COLUMN IF NOT EXISTS raw_request TEXT;
ALTER TABLE llm_records ADD COLUMN IF NOT EXISTS raw_response TEXT;
