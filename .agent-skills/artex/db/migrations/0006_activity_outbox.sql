-- Activities that could not be inserted (the exploration row was missing, or
-- the write failed after retries) are kept here and replayed into activity
-- once the parent row accepts them. No foreign key: the row has to survive
-- the missing exploration that caused the original failure.
CREATE TABLE IF NOT EXISTS activity_outbox (
    id BIGSERIAL PRIMARY KEY,
    exploration_id BIGINT NOT NULL,
    payload JSONB NOT NULL,
    last_error TEXT,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_outbox_exploration_idx
    ON activity_outbox (exploration_id, id);
