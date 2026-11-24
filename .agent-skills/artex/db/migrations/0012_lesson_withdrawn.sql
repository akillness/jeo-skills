-- RSI lesson evidence keeps a retracted source on its row: withdrawn_at is set
-- instead of deleting it. Support and selection count only rows where it is
-- NULL, so existing evidence stays live. schema.sql carries the same column for
-- a fresh install.
ALTER TABLE rsi_lesson_evidence ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;
